import * as path from 'path';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';
import * as gh from '@actions/github';

import { Packager } from './packager';
import { Uploader } from './uploader';
import { Platforms } from './platforms';

export class Deployer
{
    public async run(token: string, qtVersion: string, excludes: string, host: string, key: string, port: string) {
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
        const [pkgBase, pkgDir] = await this.createPackages(token, pkgVersion, qtVersion, excludes);
        const repogen = await this.downloadRepogen();
        const deployDir = "dummy-deploy";
        await this.generateRepositories(repogen, qtVersion, pkgBase, pkgDir, deployDir, excludes);
    }

    private async downloadRepogen(): Promise<string> {
        core.info(` => Getting QtIFW repogen`);
        core.info("    -> Installing aqtinstall");
        const python = await io.which("python", true);
        await ex.exec(python, ["-m", "pip", "install", "aqtinstall"]);
        const qtIfwVer = "3.1.1";
        core.info(`    -> Installing QtIfW verion ${qtIfwVer}`);
        await ex.exec(python, ["-m", "aqt",
            "tool",
            "linux", "tools_ifw", qtIfwVer, "qt.tools.ifw.31",
            "--outputdir", "qtifw",
            "--internal"
        ]);
        const repogen = path.join("qtifw", "Tools", "QtInstallerFramework", "3.1", "bin", "repogen");
        if (!fs.existsSync(repogen))
            throw Error(`Unable to find repogen after aqt install with path: ${repogen}`);
        return repogen;
    }

    private async createPackages(token: string, pkgVersion: string, qtVersion: string, excludes: string): Promise<[string, string]> {
        core.info("### Downloading an creating packages ###");
        const octokit = new gh.GitHub(token);
        const pkgDir = "packages";
        await io.mkdirP(pkgDir);
        const packager = new Packager(octokit, pkgVersion, qtVersion, pkgDir);
        await packager.getSources();
        await packager.createBasePackage();
        for (let platform of Platforms.platforms(excludes)) {
            switch (platform) {
            case "src":
                await packager.createSrcPackage();
                break;
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
        return [packager.getPkgBase(), pkgDir];
    }

    private async generateRepositories(repogen: string, qtVersion: string, pkgBase: string, pkgDir: string, deployDir: string, excludes: string) {
        core.info("### Generating and uploading repositories ###");
        const uploader = new Uploader(repogen, qtVersion, pkgBase, pkgDir, deployDir);
        uploader.generateRepos("linux", "x64", Platforms.linuxPlatforms(excludes));
        uploader.generateRepos("windows", "x86", Platforms.windowsPlatforms(excludes));
        uploader.generateRepos("mac", "x64", Platforms.macosPlatforms(excludes));
    }
}