import * as path from 'path';
import { promises as fs } from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';

export class Sshfs
{
    private mountPath: string;

    constructor(mountPath: string) {
        this.mountPath = mountPath;
    }
    
    public async init() {
        core.info("    -> Installing sshfs");
        await ex.exec("sudo", ["apt-get", "-qq", "install", "sshfs"]);
        await io.mkdirP(this.mountPath);
    }

    public async mount(host: string, key: string, port: string) {
        // write key and config
        core.info("    -> writing keyfile");
        const sshKey = path.join(String(process.env.GITHUB_WORKSPACE), "ssh-key");
        await fs.writeFile(sshKey, `-----BEGIN OPENSSH PRIVATE KEY-----
${key}
-----END OPENSSH PRIVATE KEY-----
`);

        // mount
        core.info("    -> Mounting");
        const sshfs = await io.which("sshfs", true);
        let sshfsArgs: string[] = [
            host, this.mountPath,
            "-o", "dir_cache=yes",
            "-o", `IdentityFile=${sshKey}`
        ];
        if (port)
            sshfsArgs.push("-P", port);
        await ex.exec(sshfs, sshfsArgs, {silent: true});
    }

    public async unmount() {
        core.info("    -> Unounting");
        const fusermount = await io.which("fusermount", true);
        await ex.exec(fusermount, ["-u", this.mountPath]);
    }
}