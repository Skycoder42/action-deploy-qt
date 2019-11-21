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
const io = __importStar(require("@actions/io"));
const ex = __importStar(require("@actions/exec"));
class Sshfs {
    static mount(host, key, port, mountPath) {
        return __awaiter(this, void 0, void 0, function* () {
            // write key and config
            const sshKey = path.join(String(process.env.GITHUB_WORKSPACE), "ssh-key");
            yield fs_1.promises.writeFile(sshKey, `-----BEGIN OPENSSH PRIVATE KEY-----
${key}
-----END OPENSSH PRIVATE KEY-----
`);
            // mount
            yield io.mkdirP(mountPath);
            const sshfs = yield io.which("sshfs", true);
            let sshfsArgs = [
                host, mountPath,
                "-o", "dir_cache=yes",
                "-o", `IdentityFile=${sshKey}`
            ];
            if (port)
                sshfsArgs.push("-P", port);
            yield ex.exec(sshfs, sshfsArgs);
        });
    }
}
exports.Sshfs = Sshfs;
