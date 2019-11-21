import * as path from 'path';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';
import * as gh from '@actions/github';

import { Packager } from './packager';
import { Uploader } from './uploader';
import { Platforms } from './platforms';
import { PackageConfig } from './config';

export class Deployer
{
    // constants
    private readonly qtIfwVer: string = "3.1.1";
    private readonly pkgDir: string = "packages";
    private readonly deployDir: string = "deploy";

    public async run(token: string, qtVersion: string, excludes: string, host: string, key: string, port: string) {
        // generate PackageConfig
        const config = this.createPackageConfig(qtVersion);
        if (!config)
            return;
        core.info(` => Detected Package version as ${config.pkgVersion}`);

        const octokit = new gh.GitHub(token);
        await io.mkdirP(this.pkgDir);
        await io.mkdirP(this.deployDir);

        core.info("### Downloading and creating packages ###");
        const packager = new Packager(octokit, this.pkgDir, config);
        await packager.getSources();
        await packager.createAllPackages(Platforms.platforms(excludes));

        const repogen = await this.downloadRepogen();

        core.info("### Generating and uploading repositories ###");
        const uploader = new Uploader(repogen, this.pkgDir, this.deployDir, config);
        uploader.generateRepos("linux", "x64", Platforms.linuxPlatforms(excludes));
        uploader.generateRepos("windows", "x86", Platforms.windowsPlatforms(excludes));
        uploader.generateRepos("mac", "x64", Platforms.macosPlatforms(excludes));
    }

    private createPackageConfig(qtVersion: string): PackageConfig | null {
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
            config: null
        };
    }

    private async downloadRepogen(): Promise<string> {
        core.info(` => Getting QtIFW repogen`);

        core.info("    -> Installing aqtinstall");
        const python = await io.which("python", true);
        await ex.exec(python, ["-m", "pip", "install", "aqtinstall"]);

        core.info(`    -> Installing QtIfW verion ${this.qtIfwVer}`);
        await ex.exec(python, ["-m", "aqt",
            "tool",
            "linux", "tools_ifw", this.qtIfwVer, "qt.tools.ifw.31",
            "--outputdir", "qtifw",
            "--internal"
        ]);

        const repogen = path.join("qtifw", "Tools", "QtInstallerFramework", "3.1", "bin", "repogen");
        if (!fs.existsSync(repogen))
            throw Error(`Unable to find repogen after aqt install with path: ${repogen}`);

        return repogen;
    }
}