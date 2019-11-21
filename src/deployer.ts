import * as path from 'path';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as gh from '@actions/github';

import { Config } from './config';
import { Packager } from './packager';

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
        core.info(` => Detected Package version as ${pkgVersion}`);

        // download binaries and create packages
        core.info("### Downloading an creating packages ###");
        const pkgDir = path.join(deployDir, "packages");
        await io.mkdirP(pkgDir);
        const packager = new Packager(octokit, pkgVersion, qtVersion, pkgDir);
        await packager.getSources();
        await packager.createBasePackage();
        await packager.createSrcPackage();
        for (let platform of platforms.split(',')) {
            switch (platform) {
            case "doc":
                await packager.createDocPackage();
                break;
            case "examples":
                await packager.createExamplePackage();
                break;
            default:
                await packager.createPlatformPackage(platform);
                break;
            }
        }
    }
}