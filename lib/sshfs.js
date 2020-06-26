"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sshfs = void 0;
const path = __importStar(require("path"));
const fs_1 = require("fs");
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const ex = __importStar(require("@actions/exec"));
class Sshfs {
    constructor(mountPath, config) {
        this.mountPath = mountPath;
        this.config = config;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info("    -> Installing sshfs");
            yield ex.exec("sudo", ["apt-get", "-qq", "install", "sshfs"]);
            yield io.mkdirP(this.mountPath);
        });
    }
    mount(host, key, port) {
        return __awaiter(this, void 0, void 0, function* () {
            // write key and config
            core.info("    -> writing keyfile");
            const sshKey = path.join(this.config.tmpDir, "ssh-key");
            yield fs_1.promises.writeFile(sshKey, key + '\n', { mode: 0o600 });
            // mount
            core.info("    -> Mounting");
            const sshfs = yield io.which("sshfs", true);
            let sshfsArgs = [
                host, this.mountPath,
                "-o", "StrictHostKeyChecking=no",
                "-o", `IdentityFile=${sshKey}`
            ];
            if (port)
                sshfsArgs.push("-p", port);
            yield ex.exec(sshfs, sshfsArgs, { silent: true });
            yield io.rmRF(sshKey);
        });
    }
    unmount() {
        return __awaiter(this, void 0, void 0, function* () {
            core.info("    -> Unounting");
            const fusermount = yield io.which("fusermount", true);
            yield ex.exec(fusermount, ["-u", this.mountPath], { silent: true });
        });
    }
}
exports.Sshfs = Sshfs;
