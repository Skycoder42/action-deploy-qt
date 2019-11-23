import * as path from 'path';
import { promises as fs } from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';
import { PackageConfig } from './config';

export class Sshfs
{
    private mountPath: string;
    private config: PackageConfig;

    constructor(mountPath: string, config: PackageConfig) {
        this.mountPath = mountPath;
        this.config = config;
    }
    
    public async init() {
        core.info("    -> Installing sshfs");
        await ex.exec("sudo", ["apt-get", "-qq", "install", "sshfs"]);
        await io.mkdirP(this.mountPath);
    }

    public async mount(host: string, key: string, port: string) {
        // write key and config
        core.info("    -> writing keyfile");
        const sshKey = path.join(this.config.tmpDir, "ssh-key");
        await fs.writeFile(sshKey, key + '\n', {mode: 0o600});

        // mount
        core.info("    -> Mounting");
        const sshfs = await io.which("sshfs", true);
        let sshfsArgs: string[] = [
            host, this.mountPath,
            "-o", "StrictHostKeyChecking=no",
            "-o", `IdentityFile=${sshKey}`
        ];
        if (port)
            sshfsArgs.push("-p", port);
        await ex.exec(sshfs, sshfsArgs, {silent: true});
        await io.rmRF(sshKey);
    }

    public async unmount() {
        core.info("    -> Unounting");
        const fusermount = await io.which("fusermount", true);
        await ex.exec(fusermount, ["-u", this.mountPath], {silent: true});
    }
}