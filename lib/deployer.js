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
const gh = __importStar(require("@actions/github"));
const packager_1 = require("./packager");
class Deployer {
    run(token, qtVersion, platforms, host, key, port) {
        return __awaiter(this, void 0, void 0, function* () {
            // prepare
            const octokit = new gh.GitHub(token);
            const deployDir = "qt-deploy";
            const refs = gh.context.ref.split('/');
            if (refs.length != 3)
                throw Error(`Unexpected GitHub ref format: ${gh.context.ref}`);
            if (refs[1] != "tags") {
                core.warning("Deployments are only run for tags. Not doing anything! Consider adding 'if: startsWith(github.ref, 'refs/tags/')' as condition to this step");
                return;
            }
            const pkgVersion = refs[2];
            core.info(` => Detected Package version as ${pkgVersion}`);
            // download binaries and create packages
            core.info("### Downloading an creating packages ###");
            const pkgDir = path.join(deployDir, "packages");
            yield io.mkdirP(pkgDir);
            const packager = new packager_1.Packager(octokit, pkgVersion, qtVersion, pkgDir);
            yield packager.getSources();
            yield packager.createBasePackage();
            yield packager.createSrcPackage();
            for (let platform of platforms.split(',')) {
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
        });
    }
}
exports.Deployer = Deployer;
