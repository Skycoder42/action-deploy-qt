import * as path from 'path';
import { promises as fs } from 'fs';

import * as io from '@actions/io';
import * as ex from '@actions/exec';

export class Sshfs
{
    public static async mount(host: string, key: string, port: string, mountPath: string) {
        // write key and config
        const sshKey = path.join(String(process.env.GITHUB_WORKSPACE), "ssh-key");
        await fs.writeFile(sshKey, `-----BEGIN OPENSSH PRIVATE KEY-----
${key}
-----END OPENSSH PRIVATE KEY-----
`);

        // mount
        await io.mkdirP(mountPath);
        const sshfs = await io.which("sshfs", true);
        let sshfsArgs: string[] = [
            host, mountPath,
            "-o", "dir_cache=yes",
            "-o", `IdentityFile=${sshKey}`
        ];
        if (port)
            sshfsArgs.push("-P", port);
        await ex.exec(sshfs, sshfsArgs);
    }
}