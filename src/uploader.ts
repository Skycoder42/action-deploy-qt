import * as path from 'path';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';

import { Platforms } from './platforms';

export class Uploader
{
    private repogen: string;
    private qtVersion: string;
    pkgBase: string;
    private pkgDir: string;
    private deployDir: string;

    public constructor(repogen: string, qtVersion: string, pkgBase: string, pkgDir: string, deployDir: string) {
        this.repogen = repogen;
        this.qtVersion = qtVersion;
        this.pkgBase = pkgBase;
        this.pkgDir = pkgDir;
        this.deployDir = deployDir;
    }

    public async generateRepos(host: string, arch: string, packages: string[]) {
        const fullHost = `${host}_${arch}`;
        core.info(` => Deploying for ${fullHost}`);

        // TODO prepare hostbuilds

        core.info("    -> Generating repositories");
        const realDepDir = path.join(this.deployDir, fullHost, `qt${this.qtVersion.replace(/\./g, "")}`);
        await io.mkdirP(realDepDir);
        let pkgList: string[] = [this.pkgBase];
        core.debug(`       >> Adding package ${this.pkgBase}`);
        for (let pkg of packages) {
            const dPkg = `${this.pkgBase}.${Platforms.packagePlatform(pkg)}`;
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
}