import * as path from 'path';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';

import { Platforms } from './platforms';
import { PackageConfig } from './config';

export class Uploader
{
    private repogen: string;
    private pkgDir: string;
    private deployDir: string;
    private config: PackageConfig;

    public constructor(repogen: string, pkgDir: string, deployDir: string, config: PackageConfig) {
        this.repogen = repogen;
        this.pkgDir = pkgDir;
        this.deployDir = deployDir;
        this.config = config;
    }

    public async generateRepos(host: string, arch: string, packages: string[]) {
        const fullHost = `${host}_${arch}`;
        core.info(` => Deploying for ${fullHost}`);

        // TODO prepare hostbuilds

        core.info("    -> Generating repositories");
        const realDepDir = path.join(this.deployDir, fullHost, `qt${this.config.qtVersion.replace(/\./g, "")}`);
        await io.mkdirP(realDepDir);
        let pkgList: string[] = [this.config.pkgBase];
        core.debug(`       >> Adding package ${this.config.pkgBase}`);
        for (let pkg of packages) {
            const dPkg = `${this.config.pkgBase}.${Platforms.packagePlatform(pkg)}`;
            core.debug(`       >> Adding package ${dPkg}`);
            pkgList.push(dPkg);
        }

        core.debug("       >> Running repogen");
        await ex.exec(this.repogen, [
            "--update-new-components",
            "-p", this.pkgDir,
            "-i", pkgList.join(","),
            this.deployDir
        ]);
    }

    private async prepareHostTools() {

    }
}