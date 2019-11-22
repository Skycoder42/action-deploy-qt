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
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const ex = __importStar(require("@actions/exec"));
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
        });
    }
    prepareHostTools(host, platform, tools, hostPlatform) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(`    -> Adjusting host tools for ${platform}`);
            core.debug(`       >> Using host tool from ${hostPlatform}`);
            const pkgPlatform = platforms_1.Platforms.packagePlatform(platform);
            const pkgHostPlatform = platforms_1.Platforms.packagePlatform(hostPlatform);
            const srcDir = path.join(this.pkgDir, `qt.qt5.${this.config.qtVid}.${pkgHostPlatform}`, "data");
            const destDir = path.join(this.pkgDir, `qt.qt5.${this.config.qtVid}.${pkgPlatform}`, "data");
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
            if (toolHost && toolHost != host)
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
}
exports.Uploader = Uploader;
