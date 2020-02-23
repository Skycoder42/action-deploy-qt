import * as path from 'path';
import { promises as fs } from 'fs';
import replaceInFile from 'replace-in-file';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as gh from '@actions/github';
import * as tc from '@actions/tool-cache'
import * as ex from '@actions/exec';

import { ConfigParser, Config, PackageConfig } from './config';
import { Platforms } from './platforms';

export class Packager
{
    private octokit: gh.GitHub;
    private pkgDir: string;
    private config: PackageConfig;

    private srcDlDir: string = "";
    private assets: Map<string, string> = new Map();

    public constructor(octokit: gh.GitHub, pkgDir: string, config: PackageConfig) {
        this.octokit = octokit;
        this.pkgDir = pkgDir;
        this.config = config;
    }

    public async getSources() {
        core.info(" => Downloading sources");
        core.info("    -> Downloading source tarball");
        const release = await this.octokit.repos.getReleaseByTag({
            owner: gh.context.repo.owner,
            repo: gh.context.repo.repo,
            tag: this.config.pkgVersion
        });
        const srcFile = await tc.downloadTool(release.data.tarball_url);
        core.info("    -> Extracting source tarball");
        this.srcDlDir = path.join(await tc.extractTar(srcFile), `${gh.context.repo.owner}-${gh.context.repo.repo}-${gh.context.sha.substr(0, 7)}`);
        for (let asset of release.data.assets)
            this.assets.set(asset.name, asset.browser_download_url);

        core.info("    -> Parsing deploy configuration");
        this.config.config = await ConfigParser.loadConfig(path.join(this.srcDlDir, "deploy.json"));
    }

    public async createAllPackages(platforms: string[]) {
        await this.createBasePackage();
        for (let platform of platforms) {
            switch (platform) {
            case "src":
                await this.createSrcPackage();
                break;
            case "doc":
                await this.createDocPackage();
                break;
            case "examples":
                await this.createExamplePackage();
                break;
            default:
                await this.createPlatformPackage(platform);
                break;
            }
        }
    }

    public async createBasePackage() {
        core.info(" => Creating base package");
        const pkgDir = path.join(this.pkgDir, this.config.pkgBase);

        core.info("    -> Creating meta package.xml");
        let depList: Array<string> = [];
        if (this.config.config!.dependencies) {
            for (let dep of this.config.config!.dependencies) {
                if (dep.startsWith("."))
                    depList.push(`qt.qt5.${this.config.qtVid}${dep}`);
                else
                    depList.push(dep);
            }
        }
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${this.config.pkgBase}</Name>
    <DisplayName>${this.config.config!.title}</DisplayName>
    <Description>${this.config.config!.description}</Description>
    <Dependencies>${depList.join(", ")}</Dependencies>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Licenses>
        <License name="${this.config.config!.license.name}" file="LICENSE.txt" />
    </Licenses>
    <Default>true</Default>
</Package>
`);

        core.info("    -> Adding license");
        await io.cp(path.join(this.srcDlDir, this.config.config!.license.path), path.join(metaDir, "LICENSE.txt"));

        core.info("    -> Adding additional global files");
        const dataDir = path.join(pkgDir, "data");
        await io.mkdirP(dataDir);
        if (this.config.config!.installs) {
            let map = new Map(Object.entries(this.config.config!.installs));
            for (let eInfo of map) {
                await io.cp(path.join(this.srcDlDir, eInfo[0]), path.join(dataDir, eInfo[1]), {
                    recursive: true,
                    force: true
                });
            }
        }
    }

    public async createSrcPackage() {
        core.info(" => Creating source package");
        const pkgName = this.config.pkgBase + ".src";
        const pkgDir = path.join(this.pkgDir, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtSrc = `qt.qt5.${this.config.qtVid}.src`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config!.title} Sources</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtSrc}</AutoDependOn>
    <Dependencies>${qtSrc}</Dependencies>
</Package>
`);

        core.info("    -> Removing CI and other non-related stuff from sources");
        await io.rmRF(path.join(this.srcDlDir, ".github"));
        await io.rmRF(path.join(this.srcDlDir, "deploy.json"));

        core.info("    -> Moving sources into package directory");
        const srcBasePath = path.join(pkgDir, "data", this.config.qtVersion, "Src");
        await io.mkdirP(srcBasePath);
        const srcPath = path.join(srcBasePath, this.config.config!.title.toLowerCase());
        await io.mv(this.srcDlDir, srcPath);

        core.info("    -> Downloading syncqt.pl");
        const syncQt = await tc.downloadTool(`https://code.qt.io/cgit/qt/qtbase.git/plain/bin/syncqt.pl?h=${this.config.qtVersion}`);
        core.info("    -> Running syncqt.pl");
        const perl = await io.which("perl", true);
        for (let mod of this.config.config!.modules) {
            core.debug(`       >> Creating headers for ${mod}`);
            await ex.exec(perl, [
                syncQt,
                "-module", mod,
                "-version", this.config.pkgVersion.split('-')[0],
                "-outdir", srcPath,
                srcPath
            ], {silent: true});
        }
    }

    public async createPlatformPackage(platform: string) {
        core.info(` => Creating ${platform} package`);
        const pkgArch = Platforms.packagePlatform(platform);
        const pkgName = `${this.config.pkgBase}.${pkgArch}`;
        const pkgDir = path.join(this.pkgDir, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtPkg = `qt.qt5.${this.config.qtVid}.${pkgArch}`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config!.title} for ${pkgArch}</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtPkg}</AutoDependOn>
    <Dependencies>${qtPkg}</Dependencies>
    <Script>installscript.qs</Script>
</Package>
`);

        core.info("    -> Creating meta installscript.qs");
        await fs.writeFile(path.join(metaDir, "installscript.qs"), `// constructor
function Component()
{
}

function resolveQt5EssentialsDependency()
{
    return "${qtPkg}" + "_qmakeoutput";
}

Component.prototype.createOperations = function()
{
    component.createOperations();

    var platform = "";
    if (installer.value("os") == "x11")
        platform = "linux";
    if (installer.value("os") == "win")
        platform = "windows";
    if (installer.value("os") == "mac")
        platform = "mac";

    component.addOperation("QtPatch",
                            platform,
                            "@TargetDir@" + "/${this.config.qtVersion}/${platform}",
                            "QmakeOutputInstallerKey=" + resolveQt5EssentialsDependency(),
                            "${Platforms.patchString(platform)}");
}
`);

        const dataDir = await this.getAsset(platform, pkgDir, this.config.qtVersion);

        core.info ("    -> Fixing configuration paths");
        core.debug("       >> Remove QMAKE_PRL_BUILD_DIR from *.prl");
        await replaceInFile({
            files: path.join(dataDir, "**", "*.prl"),
            allowEmptyPaths: true,
            from: /^QMAKE_PRL_BUILD_DIR\s*=.*$/gm,
            to: ""
        });
        core.debug("       >> Fix dependency_libs in *.la");
        await replaceInFile({
            files: path.join(dataDir, "**", "*.la"),
            allowEmptyPaths: true,
            from: /^dependency_libs\s*=.*$/gm,
            to: (match) => {
                let depStr = match.split('=')[1];
                depStr = depStr.substr(1, depStr.length - 2);
                let depRes: string[] = ["-L/home/qt/work/install/lib"];
                for (let dep of depStr.split(' ')) {
                    if (!dep.startsWith("-L"))
                        depRes.push(dep);
                }
                return `dependency_libs='${depRes.join(' ')}'`;
            }
        });
        core.debug("       >> Fix libdir in *.la");
        await replaceInFile({
            files: path.join(dataDir, "**", "*.la"),
            allowEmptyPaths: true,
            from: /^libdir\s*=.*$/gm,
            to: "libdir='=/home/qt/work/install/lib'"
        });
        core.debug("       >> Fix prefix in *.pc");
        await replaceInFile({
            files: path.join(dataDir, "**", "*.pc"),
            allowEmptyPaths: true,
            from: /^prefix\s*=.*$/gm,
            to: "prefix=/home/qt/work/install"
        });
    }

    public async createDocPackage() {
        core.info(` => Creating documentation package`);
        const pkgName = `${this.config.pkgBase}.doc`;
        const pkgDir = path.join(this.pkgDir, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtDoc = `qt.qt5.${this.config.qtVid}.doc`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config!.title} Documentation</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtDoc}</AutoDependOn>
    <Dependencies>${qtDoc}, qt.tools</Dependencies>
    <Script>installscript.qs</Script>
</Package>
`);

        core.info("    -> Creating meta installscript.qs");
        await fs.writeFile(path.join(metaDir, "installscript.qs"), `// constructor
function Component()
{
}

Component.prototype.createOperations = function()
{
    component.createOperations();
    if (typeof registerQtCreatorDocumentation === "function")
        registerQtCreatorDocumentation(component, "/Docs/Qt-${this.config.qtVersion}/");
}
`);

        await this.getAsset("doc", pkgDir, `Docs/Qt-${this.config.qtVersion}`);
    }

    public async createExamplePackage() {
        core.info(` => Creating examples package`);
        const pkgName = `${this.config.pkgBase}.examples`;
        const pkgDir = path.join(this.pkgDir, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtExamples = `qt.qt5.${this.config.qtVid}.examples`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config!.title} Examples</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtExamples}</AutoDependOn>
    <Dependencies>${qtExamples}</Dependencies>
</Package>
`);

        await this.getAsset("examples", pkgDir, `Examples/Qt-${this.config.qtVersion}`);
    }

    private async getAsset(platform: string, pkgDir: string, subDir: string): Promise<string> {
        core.info("    -> Downloading asset");
        const asZip = platform.includes("msvc") || platform.includes("mingw");
        const assetName = `${this.config.config!.title.toLowerCase()}-${platform}-${this.config.qtVersion}.${asZip ? "zip" : "tar.xz"}`;
        const assetUrl = this.assets.get(assetName);
        if (typeof assetUrl == "undefined")
            throw Error(`No such asset: ${assetName}`);
        const dlPath = await tc.downloadTool(assetUrl);

        core.info("    -> Extracting asset");
        const dataDir = path.join(pkgDir, "data", subDir);
        await io.mkdirP(dataDir);
        if (asZip)
            await ex.exec("unzip", ["-qq", dlPath, "-d", dataDir], {silent: true});
        else 
            await ex.exec("tar", ["x", "-C", dataDir, "-f", dlPath], {silent: true});
        return dataDir;
    }

    private today() {
        return new Date().toISOString().slice(0, 10);
    }
}