"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const fs_1 = require("fs");
const replace_in_file_1 = __importDefault(require("replace-in-file"));
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const gh = __importStar(require("@actions/github"));
const tc = __importStar(require("@actions/tool-cache"));
const ex = __importStar(require("@actions/exec"));
const config_1 = require("./config");
const platforms_1 = require("./platforms");
class Packager {
    constructor(octokit, pkgDir, config) {
        this.srcDlDir = "";
        this.assets = new Map();
        this.octokit = octokit;
        this.pkgDir = pkgDir;
        this.config = config;
    }
    getSources() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(" => Downloading sources");
            core.info("    -> Downloading source tarball");
            const release = yield this.octokit.repos.getReleaseByTag({
                owner: gh.context.repo.owner,
                repo: gh.context.repo.repo,
                tag: this.config.pkgVersion
            });
            const srcFile = yield tc.downloadTool(release.data.tarball_url);
            core.info("    -> Extracting source tarball");
            this.srcDlDir = path.join(yield tc.extractTar(srcFile), `${gh.context.repo.owner}-${gh.context.repo.repo}-${gh.context.sha.substr(0, 7)}`);
            for (let asset of release.data.assets)
                this.assets.set(asset.name, asset.browser_download_url);
            core.info("    -> Parsing deploy configuration");
            this.config.config = yield config_1.ConfigParser.loadConfig(path.join(this.srcDlDir, "deploy.json"));
        });
    }
    createAllPackages(platforms) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.createBasePackage();
            for (let platform of platforms) {
                switch (platform) {
                    case "src":
                        yield this.createSrcPackage();
                        break;
                    case "doc":
                        yield this.createDocPackage();
                        break;
                    case "examples":
                        yield this.createExamplePackage();
                        break;
                    default:
                        yield this.createPlatformPackage(platform);
                        break;
                }
            }
        });
    }
    createBasePackage() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(" => Creating base package");
            const pkgDir = path.join(this.pkgDir, this.config.pkgBase);
            core.info("    -> Creating meta package.xml");
            let depList = [];
            if (this.config.config.dependencies) {
                for (let dep of this.config.config.dependencies) {
                    if (dep.startsWith("."))
                        depList.push(`qt.qt5.${this.config.qtVid}${dep}`);
                    else
                        depList.push(dep);
                }
            }
            const metaDir = path.join(pkgDir, "meta");
            yield io.mkdirP(metaDir);
            yield fs_1.promises.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${this.config.pkgBase}</Name>
    <DisplayName>${this.config.config.title}</DisplayName>
    <Description>${this.config.config.description}</Description>
    <Dependencies>${depList.join(", ")}</Dependencies>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Licenses>
        <License name="${this.config.config.license.name}" file="LICENSE.txt" />
    </Licenses>
    <Default>true</Default>
</Package>
`);
            core.info("    -> Adding license");
            yield io.cp(path.join(this.srcDlDir, this.config.config.license.path), path.join(metaDir, "LICENSE.txt"));
            core.info("    -> Adding additional global files");
            const dataDir = path.join(pkgDir, "data");
            yield io.mkdirP(dataDir);
            if (this.config.config.installs) {
                let map = new Map(Object.entries(this.config.config.installs));
                for (let eInfo of map) {
                    yield io.cp(path.join(this.srcDlDir, eInfo[0]), path.join(dataDir, eInfo[1]), {
                        recursive: true,
                        force: true
                    });
                }
            }
        });
    }
    createSrcPackage() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(" => Creating source package");
            const pkgName = this.config.pkgBase + ".src";
            const pkgDir = path.join(this.pkgDir, pkgName);
            core.info("    -> Creating meta package.xml");
            const qtSrc = `qt.qt5.${this.config.qtVid}.src`;
            const metaDir = path.join(pkgDir, "meta");
            yield io.mkdirP(metaDir);
            yield fs_1.promises.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config.title} Sources</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtSrc}</AutoDependOn>
    <Dependencies>${qtSrc}</Dependencies>
</Package>
`);
            core.info("    -> Removing CI and other non-related stuff from sources");
            yield io.rmRF(path.join(this.srcDlDir, ".github"));
            yield io.rmRF(path.join(this.srcDlDir, "deploy.json"));
            core.info("    -> Moving sources into package directory");
            const srcBasePath = path.join(pkgDir, "data", this.config.qtVersion, "Src");
            yield io.mkdirP(srcBasePath);
            const srcPath = path.join(srcBasePath, this.config.config.title.toLowerCase());
            yield io.mv(this.srcDlDir, srcPath);
            core.info("    -> Downloading syncqt.pl");
            const syncQt = yield tc.downloadTool(`https://code.qt.io/cgit/qt/qtbase.git/plain/bin/syncqt.pl?h=${this.config.qtVersion}`);
            core.info("    -> Running syncqt.pl");
            let syncQtArgs = [syncQt];
            for (let mod of this.config.config.modules)
                syncQtArgs.push("-module", mod);
            syncQtArgs.push("-version", this.config.pkgVersion.split('-')[0]);
            syncQtArgs.push("-out", srcPath);
            syncQtArgs.push(srcPath);
            yield ex.exec("perl", syncQtArgs, {
                silent: true
            });
        });
    }
    createPlatformPackage(platform) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(` => Creating ${platform} package`);
            const pkgArch = platforms_1.Platforms.packagePlatform(platform);
            const pkgName = `${this.config.pkgBase}.${pkgArch}`;
            const pkgDir = path.join(this.pkgDir, pkgName);
            core.info("    -> Creating meta package.xml");
            const qtPkg = `qt.qt5.${this.config.qtVid}.${pkgArch}`;
            const metaDir = path.join(pkgDir, "meta");
            yield io.mkdirP(metaDir);
            yield fs_1.promises.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config.title} for ${pkgArch}</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtPkg}</AutoDependOn>
    <Dependencies>${qtPkg}</Dependencies>
    <Script>installscript.qs</Script>
</Package>
`);
            core.info("    -> Creating meta installscript.qs");
            yield fs_1.promises.writeFile(path.join(metaDir, "installscript.qs"), `// constructor
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
                            "${platforms_1.Platforms.patchString(platform)}");
}
`);
            const dataDir = yield this.getAsset(platform, pkgDir, this.config.qtVersion);
            core.info("    -> Fixing configuration paths");
            core.debug("       >> Remove QMAKE_PRL_BUILD_DIR from *.prl");
            yield replace_in_file_1.default({
                files: path.join(dataDir, "**", "*.prl"),
                from: /^QMAKE_PRL_BUILD_DIR\s*=.*$/gm,
                to: ""
            });
            core.debug("       >> Fix dependency_libs in *.la");
            yield replace_in_file_1.default({
                files: path.join(dataDir, "**", "*.la"),
                from: /^dependency_libs\s*=.*$/gm,
                to: (match) => {
                    let depStr = match.split('=')[1];
                    depStr = depStr.substr(1, depStr.length - 2);
                    let depRes = ["-L/home/qt/work/install/lib"];
                    for (let dep of depStr.split(' ')) {
                        if (!dep.startsWith("-L"))
                            depRes.push(dep);
                    }
                    return `dependency_libs='${depRes.join(' ')}'`;
                }
            });
            core.debug("       >> Fix libdir in *.la");
            yield replace_in_file_1.default({
                files: path.join(dataDir, "**", "*.la"),
                from: /^libdir\s*=.*$/gm,
                to: "libdir='=/home/qt/work/install/lib'"
            });
            core.debug("       >> Fix prefix in *.pc");
            yield replace_in_file_1.default({
                files: path.join(dataDir, "**", "*.pc"),
                from: /^prefix\s*=.*$/gm,
                to: "prefix=/home/qt/work/install"
            });
        });
    }
    createDocPackage() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(` => Creating documentation package`);
            const pkgName = `${this.config.pkgBase}.doc`;
            const pkgDir = path.join(this.pkgDir, pkgName);
            core.info("    -> Creating meta package.xml");
            const qtDoc = `qt.qt5.${this.config.qtVid}.doc`;
            const metaDir = path.join(pkgDir, "meta");
            yield io.mkdirP(metaDir);
            yield fs_1.promises.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config.title} Documentation</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtDoc}</AutoDependOn>
    <Dependencies>${qtDoc}, qt.tools</Dependencies>
    <Script>installscript.qs</Script>
</Package>
`);
            core.info("    -> Creating meta installscript.qs");
            yield fs_1.promises.writeFile(path.join(metaDir, "installscript.qs"), `// constructor
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
            yield this.getAsset("doc", pkgDir, "Docs");
        });
    }
    createExamplePackage() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(` => Creating examples package`);
            const pkgName = `${this.config.pkgBase}.examples`;
            const pkgDir = path.join(this.pkgDir, pkgName);
            core.info("    -> Creating meta package.xml");
            const qtExamples = `qt.qt5.${this.config.qtVid}.examples`;
            const metaDir = path.join(pkgDir, "meta");
            yield io.mkdirP(metaDir);
            yield fs_1.promises.writeFile(path.join(metaDir, "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config.title} Examples</DisplayName>
    <Version>${this.config.pkgVersion}</Version>
    <ReleaseDate>${this.today()}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.config.pkgBase}, ${qtExamples}</AutoDependOn>
    <Dependencies>${qtExamples}</Dependencies>
</Package>
`);
            yield this.getAsset("examples", pkgDir, "Examples");
        });
    }
    getAsset(platform, pkgDir, subDir) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info("    -> Downloading asset");
            const asZip = platform.includes("msvc") || platform.includes("mingw");
            const assetName = `${this.config.config.title.toLowerCase()}-${platform}-${this.config.qtVersion}.${asZip ? "zip" : "tar.xz"}`;
            const assetUrl = this.assets.get(assetName);
            if (typeof assetUrl == "undefined")
                throw Error(`No such asset: ${assetName}`);
            const dlPath = yield tc.downloadTool(assetUrl);
            core.info("    -> Extracting asset");
            const dataDir = path.join(pkgDir, "data", subDir);
            yield io.mkdirP(dataDir);
            if (asZip)
                yield tc.extractZip(dlPath, dataDir);
            else {
                const newPath = dlPath + ".tar.xz";
                yield io.mv(dlPath, newPath);
                yield tc.extractTar(newPath, dataDir);
            }
            return dataDir;
        });
    }
    today() {
        return new Date().toISOString().slice(0, 10);
    }
}
exports.Packager = Packager;
