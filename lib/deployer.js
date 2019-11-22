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
const os = __importStar(require("os"));
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const ex = __importStar(require("@actions/exec"));
const gh = __importStar(require("@actions/github"));
const packager_1 = require("./packager");
const uploader_1 = require("./uploader");
const platforms_1 = require("./platforms");
const sshfs_1 = require("./sshfs");
class Deployer {
    constructor() {
        // constants
        this.qtIfwVer = "3.1.1";
        this.pkgDir = "packages";
        this.deployDir = "deploy";
    }
    run(token, qtVersion, excludes, host, key, port) {
        return __awaiter(this, void 0, void 0, function* () {
            // generate PackageConfig
            const config = this.createPackageConfig(qtVersion);
            if (!config)
                return;
            core.info(` => Detected Package version as ${config.pkgVersion}`);
            yield io.mkdirP(this.pkgDir);
            yield io.mkdirP(this.deployDir);
            const octokit = new gh.GitHub(token);
            const repogen = yield this.downloadRepogen();
            core.info("### Downloading and creating packages ###");
            const packager = new packager_1.Packager(octokit, this.pkgDir, config);
            yield packager.getSources();
            yield packager.createAllPackages(platforms_1.Platforms.platforms(excludes));
            core.info("### Generating and uploading repositories ###");
            const uploader = new uploader_1.Uploader(repogen, this.pkgDir, this.deployDir, config);
            yield uploader.generateRepos("linux", "x64", platforms_1.Platforms.linuxPlatforms(excludes));
            yield uploader.generateRepos("windows", "x86", platforms_1.Platforms.windowsPlatforms(excludes));
            yield uploader.generateRepos("mac", "x64", platforms_1.Platforms.macosPlatforms(excludes));
            core.info(` => Mounting sshfs`);
            const sshfs = new sshfs_1.Sshfs(this.deployDir + "-test");
            yield sshfs.init();
            yield sshfs.mount(host, key, port);
            yield sshfs.unmount();
        });
    }
    createPackageConfig(qtVersion) {
        const refs = gh.context.ref.split('/');
        if (refs.length != 3)
            throw Error(`Unexpected GitHub ref format: ${gh.context.ref}`);
        if (refs[1] != "tags") {
            core.warning("Deployments are only run for tags. Not doing anything! Consider adding 'if: startsWith(github.ref, 'refs/tags/')' as condition to this step");
            return null;
        }
        const qtVid = qtVersion.replace(/\./g, "");
        return {
            pkgVersion: refs[2],
            qtVersion: qtVersion,
            qtVid: qtVid,
            pkgBase: `qt.qt5.${qtVid}.${gh.context.repo.owner.toLowerCase()}.${gh.context.repo.repo.substr(2).toLowerCase()}`,
            config: null,
            tmpDir: this.initTempDir(os.platform())
        };
    }
    downloadRepogen() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(` => Getting QtIFW repogen`);
            core.info("    -> Installing aqtinstall");
            const python = yield io.which("python", true);
            yield ex.exec(python, ["-m", "pip", "install", "aqtinstall"]);
            core.info(`    -> Installing QtIfW verion ${this.qtIfwVer}`);
            yield ex.exec(python, ["-m", "aqt",
                "tool",
                "linux", "tools_ifw", this.qtIfwVer, "qt.tools.ifw.31",
                "--outputdir", "qtifw",
                "--internal"
            ]);
            const repogen = path.join("qtifw", "Tools", "QtInstallerFramework", "3.1", "bin", "repogen");
            if (!fs.existsSync(repogen))
                throw Error(`Unable to find repogen after aqt install with path: ${repogen}`);
            return repogen;
        });
    }
    initTempDir(platform) {
        let tempDirectory = process.env['RUNNER_TEMP'] || '';
        if (!tempDirectory) {
            let baseLocation;
            if (platform == "win32") {
                // On windows use the USERPROFILE env variable
                baseLocation = process.env['USERPROFILE'] || 'C:\\';
            }
            else {
                if (platform === 'darwin')
                    baseLocation = '/Users';
                else
                    baseLocation = '/home';
            }
            tempDirectory = path.join(baseLocation, 'actions', 'temp');
        }
        return tempDirectory;
    }
}
exports.Deployer = Deployer;
