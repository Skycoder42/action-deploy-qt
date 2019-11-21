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
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const ex = __importStar(require("@actions/exec"));
const platforms_1 = require("./platforms");
class Uploader {
    constructor(repogen, qtVersion, pkgBase, pkgDir, deployDir) {
        this.repogen = repogen;
        this.qtVersion = qtVersion;
        this.pkgBase = pkgBase;
        this.pkgDir = pkgDir;
        this.deployDir = deployDir;
    }
    generateRepos(host, arch, packages) {
        return __awaiter(this, void 0, void 0, function* () {
            const fullHost = `${host}_${arch}`;
            core.info(` => Deploying for ${fullHost}`);
            // TODO prepare hostbuilds
            core.info("    -> Generating repositories");
            const realDepDir = path.join(this.deployDir, fullHost, `qt${this.qtVersion.replace(/\./g, "")}`);
            yield io.mkdirP(realDepDir);
            let pkgList = [this.pkgBase];
            core.debug(`       >> Adding package ${this.pkgBase}`);
            for (let pkg of packages) {
                const dPkg = `${this.pkgBase}.${platforms_1.Platforms.packagePlatform(pkg)}`;
                core.debug(`       >> Adding package ${dPkg}`);
                pkgList.push(dPkg);
            }
            core.debug("       >> Running repogen");
            yield ex.exec(this.repogen, [
                "--update-new-components",
                "-p", this.pkgDir,
                "-i", pkgList.join(","),
                this.deployDir
            ]);
        });
    }
}
exports.Uploader = Uploader;
