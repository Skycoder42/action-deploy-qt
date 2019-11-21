import * as path from 'path';
import { promises as fs } from 'fs';
import replaceInFile from 'replace-in-file';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as gh from '@actions/github';
import * as tc from '@actions/tool-cache'
import * as ex from '@actions/exec';

import { ConfigParser, Config } from './config';
import { RSA_SSLV23_PADDING } from 'constants';

export class Packager
{
    private octokit: gh.GitHub;
    private pkgVersion: string;
    private qtVersion: string;
    private pwd: string;

    private qtVid: string;
    private pkgBase: string;

    private srcDlDir: string = "";
    private config: Config | null = null;
    private assets: Map<string, string> = new Map();

    public constructor(octokit: gh.GitHub, pkgVersion: string, qtVersion: string, pwd: string) {
        this.octokit = octokit;
        this.pkgVersion = pkgVersion;
        this.qtVersion = qtVersion;
        this.pwd = pwd;

        this.qtVid = this.qtVersion.replace(/\./g, "");
        this.pkgBase = `qt.qt5.${this.qtVid}.${gh.context.repo.owner.toLowerCase()}.${gh.context.repo.repo.substr(2).toLowerCase()}`;
        core.info(` => Using package base ${this.pkgBase}`);
    }

    public async getSources() {
        core.info(" => Downloading sources");
        core.info("    -> Downloading source tarball");
        const release = await this.octokit.repos.getReleaseByTag({
            owner: gh.context.repo.owner,
            repo: gh.context.repo.repo,
            tag: this.pkgVersion
        });
        const srcFile = await tc.downloadTool(release.data.tarball_url);
        core.info("    -> Extracting source tarball");
        this.srcDlDir = path.join(await tc.extractTar(srcFile), `${gh.context.repo.owner}-${gh.context.repo.repo}-${gh.context.sha.substr(0, 7)}`);
        for (let asset of release.data.assets)
            this.assets.set(asset.name, asset.browser_download_url);

        core.info("    -> Parsing deploy configuration");
        this.config = await ConfigParser.loadConfig(path.join(this.srcDlDir, "deploy.json"));
    }

    public async createBasePackage() {
        core.info(" => Creating base package");
        const pkgDir = path.join(this.pwd, this.pkgBase);

        core.info("    -> Creating meta package.xml");
        let depList: Array<string> = [];
        if (this.config!.dependencies) {
            for (let dep of this.config!.dependencies) {
                if (dep.startsWith("."))
                    depList.push(`qt.qt5.${this.qtVid}${dep}`);
                else
                    depList.push(dep);
            }
        }
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${this.pkgBase}</Name>
    <DisplayName>${this.config!.title}</DisplayName>
    <Description>${this.config!.description}</Description>
    <Dependencies>${depList.join(", ")}</Dependencies>
    <Version>${this.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Licenses>
        <License name="${this.config!.license.name}" file="LICENSE.txt" />
    </Licenses>
    <Default>true</Default>
</Package>
`);

        core.info("    -> Adding license");
        await io.cp(path.join(this.srcDlDir, this.config!.license.path), path.join(metaDir, "LICENSE.txt"));

        core.info("    -> Adding additional global files");
        const dataDir = path.join(pkgDir, "data");
        await io.mkdirP(dataDir);
        if (this.config!.installs) {
            for (let eInfo of this.config!.installs)
                await io.cp(path.join(this.srcDlDir, eInfo[0]), path.join(dataDir, eInfo[1]));
        }
    }

    public async createSrcPackage() {
        core.info(" => Creating source package");
        const pkgName = this.pkgBase + ".src";
        const pkgDir = path.join(this.pwd, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtSrc = `qt.qt5.${this.qtVid}.src`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config!.title} Sources</DisplayName>
    <Version>${this.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.pkgBase}, ${qtSrc}</AutoDependOn>
    <Dependencies>${qtSrc}</Dependencies>
</Package>
`);

        core.info("    -> Removing CI and other non-related stuff from sources");
        await io.rmRF(path.join(this.srcDlDir, ".github"));
        await io.rmRF(path.join(this.srcDlDir, "deploy.json"));

        core.info("    -> Moving sources into package directory");
        const srcBasePath = path.join(pkgDir, "data", this.qtVersion, "Src");
        await io.mkdirP(srcBasePath);
        const srcPath = path.join(srcBasePath, this.config!.title.toLowerCase());
        await io.mv(this.srcDlDir, srcPath);

        core.info("    -> Downloading syncqt.pl");
        const syncQt = await tc.downloadTool(`https://code.qt.io/cgit/qt/qtbase.git/plain/bin/syncqt.pl?h=${this.qtVersion}`);
        core.info("    -> Running syncqt.pl");
        let syncQtArgs: Array<string> = [syncQt];
        for (let mod of this.config!.modules)
            syncQtArgs.push("-module", mod);
        syncQtArgs.push("-version", this.pkgVersion.split('-')[0]);
        syncQtArgs.push("-out", srcPath);
        syncQtArgs.push(srcPath);
        await ex.exec("perl", syncQtArgs, {
            silent: true
        });
    }

    public async createPlatformPackage(platform: string) {
        core.info(` => Creating ${platform} package`);
        const pkgArch = this.packageArch(platform);
        const pkgName = `${this.pkgBase}.${pkgArch}`;
        const pkgDir = path.join(this.pwd, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtPkg = `qt.qt5.${this.qtVid}.${pkgArch}`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config!.title} for ${pkgArch}</DisplayName>
    <Version>${this.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.pkgBase}, ${qtPkg}</AutoDependOn>
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
                            "@TargetDir@" + "/${this.qtVersion}/${platform}",
                            "QmakeOutputInstallerKey=" + resolveQt5EssentialsDependency(),
                            "${this.patchString(platform)}");
}
`);

        const dataDir = await this.getAsset(platform, pkgDir, this.qtVersion);

        core.info ("    -> Fixing configuration paths");
        core.debug("       >> Remove QMAKE_PRL_BUILD_DIR from *.prl");
        await replaceInFile({
            files: path.join(dataDir, "**", "*.prl"),
            from: /^QMAKE_PRL_BUILD_DIR\s*=.*$/gm,
            to: ""
        });
        core.debug("       >> Fix dependency_libs in *.la");
        await replaceInFile({
            files: path.join(dataDir, "**", "*.la"),
            from: /^dependency_libs\s*=.*$/gm,
            to: (match) => {
                let depStr = match.split('=')[1];
                depStr = depStr.substr(1, depStr.length - 2);
                let depRes: Array<string> = ["-L/home/qt/work/install/lib"];
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
            from: /^libdir\s*=.*$/gm,
            to: "libdir='=/home/qt/work/install/lib'"
        });
        core.debug("       >> Fix prefix in *.pc");
        await replaceInFile({
            files: path.join(dataDir, "**", "*.pc"),
            from: /^prefix\s*=.*$/gm,
            to: "prefix=/home/qt/work/install"
        });
    }

    public async createDocPackage() {
        core.info(` => Creating documentation package`);
        const pkgName = `${this.pkgBase}.doc`;
        const pkgDir = path.join(this.pwd, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtDoc = `qt.qt5.${this.qtVid}.doc`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config!.title} Documentation</DisplayName>
    <Version>${this.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.pkgBase}, ${qtDoc}</AutoDependOn>
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
        registerQtCreatorDocumentation(component, "/Docs/Qt-${this.qtVersion}/");
}
`);

        await this.getAsset("doc", pkgDir, "Docs");
    }

    public async createExamplePackage() {
        core.info(` => Creating examples package`);
        const pkgName = `${this.pkgBase}.examples`;
        const pkgDir = path.join(this.pwd, pkgName);

        core.info("    -> Creating meta package.xml");
        const qtExamples = `qt.qt5.${this.qtVid}.examples`;
        const metaDir = path.join(pkgDir, "meta");
        await io.mkdirP(metaDir);
        await fs.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config!.title} Examples</DisplayName>
    <Version>${this.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.pkgBase}, ${qtExamples}</AutoDependOn>
    <Dependencies>${qtExamples}</Dependencies>
</Package>
`);

        await this.getAsset("examples", pkgDir, "Examples");
    }

    private async getAsset(platform: string, pkgDir: string, subDir: string): Promise<string> {
        core.info("    -> Downloading asset");
        const asZip = platform.includes("msvc") || platform.includes("mingw");
        const assetName = `${this.config!.title.toLowerCase()}-${platform}-${this.qtVersion}.${asZip ? "zip" : "tar.xz"}`;
        const assetUrl = this.assets.get(assetName);
        if (typeof assetUrl == "undefined")
            throw Error(`No such asset: ${assetName}`);
        const dlPath = await tc.downloadTool(assetUrl);

        core.info("    -> Extracting asset");
        const dataDir = path.join(pkgDir, "data", subDir);
        await io.mkdirP(dataDir);
        if (asZip)
            await tc.extractZip(dlPath, dataDir);
        else
            await tc.extractTar(dlPath, dataDir);
        return dataDir;
    }

    private packageArch(platform: string): string {
        switch (platform) {
        case "mingw73_64":
            return "win64_mingw73";
        case "mingw73_32":
            return "win32_mingw73";
        case "msvc2017_64":
            return "win64_msvc2017_64";
        case "msvc2017":
            return "win32_msvc2017";
        case "winrt_x86_msvc2017":
            return "win64_msvc2017_winrt_x86";
        case "winrt_x64_msvc2017":
            return "win64_msvc2017_winrt_x64";
        case "winrt_armv7_msvc2017":
            return "win64_msvc2017_winrt_armv7";
        default:
            return platform;
        }
    }

    private patchString(platform: string): string {
        const embeddedKeys: Array<string> = [
            "android_arm64_v8a",
            "android_armv7",
            "android_x86",
            "ios",
            "winrt_x86_msvc2017",
            "winrt_x64_msvc2017",
            "winrt_armv7_msvc2017"
        ];
        return embeddedKeys.includes(platform) ? "emb-arm-qt5" : "qt5";
    }

    private today() {
        return new Date().toISOString().slice(0, 10);
    }
}