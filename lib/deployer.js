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
class Deployer {
    constructor() {
        this.platforms = [
            "gcc_64",
            "android_arm64_v8a",
            "android_x86_64",
            "android_armv7",
            "android_x86",
            "wasm_32",
            "msvc2017_64",
            "msvc2017",
            "winrt_x64_msvc2017",
            "winrt_x86_msvc2017",
            "winrt_armv7_msvc2017",
            "mingw73_64",
            "mingw73_32",
            "clang_64",
            "ios",
            "doc",
            "examples"
        ];
    }
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
            const packages = yield this.createPackages(token, pkgVersion, qtVersion, excludes);
            const repogen = yield this.downloadRepogen();
            const deployDir = "dummy-deploy";
            yield this.generateRepositories(repogen, packages, deployDir);
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
            if (!"src".match(excludes))
                yield packager.createSrcPackage();
            for (let platform of this.platforms) {
                if (platform.match(excludes))
                    continue;
                switch (platform) {
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
            return pkgDir;
        });
    }
    generateRepositories(repogen, pkgDir, deployDir) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
}
exports.Deployer = Deployer;
