import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';

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

    public async generateRepos(host: string, arch: string, platforms: string[]) {
        const fullHost = `${host}_${arch}`;
        core.info(` => Deploying for ${fullHost}`);

        if (this.config.config!.hostbuilds) {
            const pHost = Platforms.hostToolPlatform(host, platforms);
            for (let platform of platforms)
                await this.prepareHostTools(host, platform, this.config.config!.hostbuilds, pHost);
        }

        core.info("    -> Generating repositories");
        const realDepDir = path.join(this.deployDir, fullHost, `qt${this.config.qtVersion.replace(/\./g, "")}`);
        await io.mkdirP(realDepDir);
        let pkgList: string[] = [this.config.pkgBase];
        for (let platform of platforms)
            pkgList.push(`${this.config.pkgBase}.${Platforms.packagePlatform(platform)}`);

        await ex.exec(this.repogen, [
            "--update-new-components",
            "-p", this.pkgDir,
            "-i", pkgList.join(","),
            realDepDir
        ]);
    }

    private async prepareHostTools(host: string, platform: string, tools: string[], hostPlatform: string) {
        core.info(`    -> Adjusting host tools for ${platform}`);
        core.debug(`       >> Using host tool from ${hostPlatform}`);
        const pkgPlatform = Platforms.packagePlatform(platform);
        const pkgHostPlatform = Platforms.packagePlatform(hostPlatform);
        
        const srcDir = path.join(this.pkgDir, `qt.qt5.${this.config.qtVid}.${pkgHostPlatform}`, "data");
        const destDir = path.join(this.pkgDir, `qt.qt5.${this.config.qtVid}.${pkgPlatform}`, "data");
        const bkpDir = destDir + ".bkp";

        if (!fs.existsSync(bkpDir)) {
            core.debug("       >> Create original data backup");
            await io.cp(destDir, bkpDir, {
                recursive: true,
                force: true
            });
        } else {
            core.debug("       >> Restoring from original data backup");
            await io.rmRF(destDir);
            await io.cp(bkpDir, destDir, {
                recursive: true,
                force: true
            });
        }

        const toolHost = Platforms.hostOs(platform);
        if (toolHost && toolHost != host)
            core.debug("       >> Using original host build");
        else {
            for (let tool of tools) {
                for (let binary of glob.sync(path.join(destDir, tool))) {
                    await io.rmRF(binary);
                    core.debug(`       >> Removed matching binary ${path.relative(destDir, binary)}`);
                }
                for (let binary of glob.sync(path.join(srcDir, tool))) {
                    const relPath = path.relative(srcDir, binary);
                    await io.cp(binary, path.join(destDir, relPath), {
                        recursive: true,
                        force: true
                    });
                    core.debug(`       >> Copied matching binary ${relPath}`);
                }
            }
        }
    }
}