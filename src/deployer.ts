import * as path from 'path';
import * as os from 'os';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as gh from '@actions/github';

import { Packager } from './packager';
import { ConfigParser } from './configparser';

export class Deployer
{
    public async run(token: string, qtVersion: string, platforms: string, host: string, key: string, port: string)  {
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
        core.info(`Detected Package version as ${pkgVersion}`);

        let config = new ConfigParser();

        // download packages
        core.info("### Downloading an preparing packages ###");
        const pkgDir = path.join(deployDir, "packages");
        await io.mkdirP(pkgDir);
        const packager = new Packager(octokit, config, pkgVersion, qtVersion, pkgDir);
    }
}