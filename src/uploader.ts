import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';
import * as crypto from 'crypto';
import * as xml from 'xml2js';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';
import * as gh from '@actions/github';

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
        ], {silent: true});

        await this.createVersionPackage(fullHost, realDepDir);
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

    private async createVersionPackage(fullHost: string, depDir: string) {
        const pkgName = `qt.qt5.${this.config.qtVid}.${gh.context.repo.owner.toLowerCase()}`;
        const pkgDir = path.join(depDir, pkgName);
        if (!fs.existsSync(pkgDir)) {
            core.info(`    -> Generating root package for Qt ${this.config.qtVersion}`);

            core.debug("       >> Creating meta 7z file");
            const dummyDir = path.join(this.config.tmpDir, "root-deploy-dummy");
            const metaPath = path.join(pkgDir, "1.0.0meta.7z");
            await io.mkdirP(path.join(dummyDir, pkgName));
            await ex.exec("7z", ["a", path.resolve(metaPath)], {
                //silent: true,
                cwd: dummyDir
            });

            core.debug("       >> Calculation hashsum");
            let sha1 = crypto.createHash("sha1");
            sha1.update(await fs.promises.readFile(metaPath));
            const sha1sum = sha1.digest("hex");

            core.debug("       >> Updating Updates.xml file");
            const updPath = path.join(depDir, "Updates.xml");
            let parser = new xml.Parser();
            let data = await parser.parseStringPromise(await fs.promises.readFile(updPath));
            let update = {
                Name: pkgName,
                DisplayName: `${gh.context.repo.owner} Qt ${this.config.qtVersion} modules`,
                Version: "1.0.0",
                ReleaseDate: new Date().toISOString().slice(0, 10),
                Default: true,
                UpdateFile: {
                    CompressedSize: 0,
                    OS: "Any",
                    UncompressedSize: 0
                },
                SHA1: sha1sum
            };
            data.Updates.PackageUpdate.push(update);
            let builder = new xml.Builder();
            await fs.promises.writeFile(updPath, builder.buildObject(data));
        }
    }
}