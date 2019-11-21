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
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const ex = __importStar(require("@actions/exec"));
const gh = __importStar(require("@actions/github"));
const packager_1 = require("./packager");
const uploader_1 = require("./uploader");
const platforms_1 = require("./platforms");
class Deployer {
    run(token, qtVersion, excludes, host, key, port) {
        return __awaiter(this, void 0, void 0, function* () {
            // prepare
            const refs = gh.context.ref.split('/');
            if (refs.length != 3)
                throw Error(`Unexpected GitHub ref format: ${gh.context.ref}`);
            if (refs[1] != "tags") {
                core.warning("Deployments are only run for tags. Not doing anything! Consider adding 'if: startsWith(github.ref, 'refs/tags/')' as condition to this step");
                return;
            }
            const pkgVersion = refs[2];
            core.info(` => Detected Package version as ${pkgVersion}`);
            // run
            const [pkgBase, pkgDir] = yield this.createPackages(token, pkgVersion, qtVersion, excludes);
            const repogen = yield this.downloadRepogen();
            const deployDir = "dummy-deploy";
            yield this.generateRepositories(repogen, qtVersion, pkgBase, pkgDir, deployDir, excludes);
        });
    }
    downloadRepogen() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(` => Getting QtIFW repogen`);
            core.info("    -> Installing aqtinstall");
            const python = yield io.which("python", true);
            yield ex.exec(python, ["-m", "pip", "install", "aqtinstall"]);
            const qtIfwVer = "3.1.1";
            core.info(`    -> Installing QtIfW verion ${qtIfwVer}`);
            yield ex.exec(python, ["-m", "aqt",
                "tool",
                "linux", "tools_ifw", qtIfwVer, "qt.tools.ifw.31",
                "--outputdir", "qtifw",
                "--internal"
            ]);
            const repogen = path.join("qtifw", "Tools", "QtInstallerFramework", "3.1", "bin", "repogen");
            if (!fs.existsSync(repogen))
                throw Error(`Unable to find repogen after aqt install with path: ${repogen}`);
            return repogen;
        });
    }
    createPackages(token, pkgVersion, qtVersion, excludes) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info("### Downloading an creating packages ###");
            const octokit = new gh.GitHub(token);
            const pkgDir = "packages";
            yield io.mkdirP(pkgDir);
            const packager = new packager_1.Packager(octokit, pkgVersion, qtVersion, pkgDir);
            yield packager.getSources();
            yield packager.createBasePackage();
            for (let platform of platforms_1.Platforms.platforms(excludes)) {
                switch (platform) {
                    case "src":
                        yield packager.createSrcPackage();
                        break;
                    case "doc":
                        yield packager.createDocPackage();
                        break;
                    case "examples":
                        yield packager.createExamplePackage();
                        break;
                    default:
                        yield packager.createPlatformPackage(platform);
                        break;
                }
            }
            return [packager.getPkgBase(), pkgDir];
        });
    }
    generateRepositories(repogen, qtVersion, pkgBase, pkgDir, deployDir, excludes) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info("### Generating and uploading repositories ###");
            const uploader = new uploader_1.Uploader(repogen, qtVersion, pkgBase, pkgDir, deployDir);
            uploader.generateRepos("linux", "x64", platforms_1.Platforms.linuxPlatforms(excludes));
            uploader.generateRepos("windows", "x86", platforms_1.Platforms.windowsPlatforms(excludes));
            uploader.generateRepos("mac", "x64", platforms_1.Platforms.macosPlatforms(excludes));
        });
    }
}
exports.Deployer = Deployer;
