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
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const fs_1 = require("fs");
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const gh = __importStar(require("@actions/github"));
const tc = __importStar(require("@actions/tool-cache"));
const ex = __importStar(require("@actions/exec"));
class Packager {
    constructor(octokit, config, pkgVersion, qtVersion, pwd) {
        this.octokit = octokit;
        this.config = config;
        this.pkgVersion = pkgVersion;
        this.qtVersion = qtVersion;
        this.pwd = pwd;
        this.pkgBase = `qt.qt5.${this.qtVersion.replace(/\./g, "")}.${gh.context.repo.owner.toLowerCase()}.${gh.context.repo.repo.substr(2).toLowerCase()}`;
        core.debug(` => Using package base ${this.pkgBase}`);
    }
    createSrcPackage() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(" => Creating source package");
            const pkgName = this.pkgBase + ".src";
            const pkgDir = path.join(this.pwd, pkgName);
            core.debug("    -> Creating meta data");
            const qtSrc = `qt.qt5.${this.qtVersion.replace(/\./g, "")}.src`;
            yield fs_1.promises.writeFile(path.join(pkgDir, "meta", "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config.title} Sources</DisplayName>
    <Version>${this.pkgVersion}</Version>
    <ReleaseDate>${new Date().toISOString().slice(0, 10)}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.pkgBase}, ${qtSrc}</AutoDependOn>
    <Dependencies>${qtSrc}</Dependencies>
</Package>
`);
            core.debug("    -> Downloading and extracting source tarball");
            const release = yield this.octokit.repos.getReleaseByTag({
                owner: gh.context.repo.owner,
                repo: gh.context.repo.repo,
                tag: this.pkgVersion
            });
            const srcFile = yield tc.downloadTool(release.data.tarball_url);
            const srcPath = yield tc.extractTar(srcFile, this.pwd);
            core.debug("    -> Parsing deploy configuration");
            yield this.config.loadConfig(path.join(srcPath, "deploy.json"));
            core.debug("    -> Removing CI and other non-related stuff from sources");
            yield io.rmRF(path.join(srcPath, ".github"));
            yield io.rmRF(path.join(srcPath, "deploy.json"));
            core.debug("    -> Downloading syncqt.pl");
            const syncQt = yield tc.downloadTool(`https://code.qt.io/cgit/qt/qtbase.git/plain/bin/syncqt.pl?h=${this.qtVersion}`);
            core.debug("    -> Running syncqt.pl");
            let syncQtArgs = [syncQt];
            for (let mod of this.config.config.modules)
                syncQtArgs.push("-module", mod);
            syncQtArgs.push("-version", this.pkgVersion.split('-')[0]);
            syncQtArgs.push("-out", srcPath);
            syncQtArgs.push(srcPath);
            yield ex.exec("perl", syncQtArgs, {
                silent: true
            });
        });
    }
}
exports.Packager = Packager;
