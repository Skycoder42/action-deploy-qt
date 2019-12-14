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
const fs = __importStar(require("fs"));
const glob = __importStar(require("glob"));
const crypto = __importStar(require("crypto"));
const xml = __importStar(require("xml2js"));
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const ex = __importStar(require("@actions/exec"));
const gh = __importStar(require("@actions/github"));
const platforms_1 = require("./platforms");
class Uploader {
    constructor(repogen, pkgDir, deployDir, config) {
        this.repogen = repogen;
        this.pkgDir = pkgDir;
        this.deployDir = deployDir;
        this.config = config;
    }
    generateRepos(host, arch, platforms) {
        return __awaiter(this, void 0, void 0, function* () {
            const fullHost = `${host}_${arch}`;
            core.info(` => Deploying for ${fullHost}`);
            if (this.config.config.hostbuilds) {
                const pHost = platforms_1.Platforms.hostToolPlatform(host, platforms);
                for (let platform of platforms)
                    if (!platforms_1.Platforms.isBasic(platform))
                        yield this.prepareHostTools(host, platform, this.config.config.hostbuilds, pHost);
            }
            core.info("    -> Generating repositories");
            const realDepDir = path.join(this.deployDir, fullHost, `qt${this.config.qtVersion.replace(/\./g, "")}`);
            yield io.mkdirP(realDepDir);
            let pkgList = [this.config.pkgBase];
            for (let platform of platforms)
                pkgList.push(`${this.config.pkgBase}.${platforms_1.Platforms.packagePlatform(platform)}`);
            yield ex.exec(this.repogen, [
                "--update-new-components",
                "-p", this.pkgDir,
                "-i", pkgList.join(","),
                realDepDir
            ], { silent: true });
            yield this.createVersionPackage(realDepDir);
        });
    }
    prepareHostTools(host, platform, tools, hostPlatform) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(`    -> Adjusting host tools for ${platform}`);
            core.debug(`       >> Using host tool from ${hostPlatform}`);
            const pkgPlatform = platforms_1.Platforms.packagePlatform(platform);
            const pkgHostPlatform = platforms_1.Platforms.packagePlatform(hostPlatform);
            const srcDir = path.join(this.pkgDir, `${this.config.pkgBase}.${pkgHostPlatform}`, "data");
            const destDir = path.join(this.pkgDir, `${this.config.pkgBase}.${pkgPlatform}`, "data");
            const bkpDir = destDir + ".bkp";
            if (!fs.existsSync(bkpDir)) {
                core.debug("       >> Create original data backup");
                yield io.cp(destDir, bkpDir, {
                    recursive: true,
                    force: true
                });
            }
            else {
                core.debug("       >> Restoring from original data backup");
                yield io.rmRF(destDir);
                yield io.cp(bkpDir, destDir, {
                    recursive: true,
                    force: true
                });
            }
            const toolHost = platforms_1.Platforms.hostOs(platform);
            if (!toolHost || toolHost == host)
                core.debug("       >> Using original host build");
            else {
                for (let tool of tools) {
                    for (let binary of glob.sync(path.join(destDir, tool))) {
                        yield io.rmRF(binary);
                        core.debug(`       >> Removed matching binary ${path.relative(destDir, binary)}`);
                    }
                    for (let binary of glob.sync(path.join(srcDir, tool))) {
                        const relPath = path.relative(srcDir, binary);
                        yield io.cp(binary, path.join(destDir, relPath), {
                            recursive: true,
                            force: true
                        });
                        core.debug(`       >> Copied matching binary ${relPath}`);
                    }
                }
            }
        });
    }
    createVersionPackage(depDir) {
        return __awaiter(this, void 0, void 0, function* () {
            const pkgName = `qt.qt5.${this.config.qtVid}.${gh.context.repo.owner.toLowerCase()}`;
            const pkgDir = path.join(depDir, pkgName);
            if (!fs.existsSync(pkgDir)) {
                core.info(`    -> Generating root package for Qt ${this.config.qtVersion}`);
                yield io.mkdirP(pkgDir);
                core.debug("       >> Creating meta 7z file");
                const dummyDir = path.join(this.config.tmpDir, "root-deploy-dummy");
                const metaPath = path.join(pkgDir, "1.0.0meta.7z");
                yield io.mkdirP(path.join(dummyDir, pkgName));
                yield ex.exec("7z", ["a", path.resolve(metaPath)], {
                    silent: true,
                    cwd: dummyDir
                });
                core.debug("       >> Calculation hashsum");
                let sha1 = crypto.createHash("sha1");
                sha1.update(yield fs.promises.readFile(metaPath));
                const sha1sum = sha1.digest("hex");
                core.debug("       >> Updating Updates.xml file");
                const updPath = path.join(depDir, "Updates.xml");
                let parser = new xml.Parser();
                let data = yield parser.parseStringPromise(yield fs.promises.readFile(updPath));
                data.Updates.PackageUpdate.push({
                    Name: pkgName,
                    DisplayName: `${gh.context.repo.owner} Qt ${this.config.qtVersion} modules`,
                    Version: "1.0.0",
                    ReleaseDate: new Date().toISOString().slice(0, 10),
                    Default: true,
                    UpdateFile: {
                        $: {
                            CompressedSize: 0,
                            OS: "Any",
                            UncompressedSize: 0
                        }
                    },
                    SHA1: sha1sum
                });
                let builder = new xml.Builder();
                yield fs.promises.writeFile(updPath, builder.buildObject(data));
            }
        });
    }
}
exports.Uploader = Uploader;
