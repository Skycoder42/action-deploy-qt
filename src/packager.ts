import * as path from 'path';
import { promises as fs } from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as gh from '@actions/github';
import * as tc from '@actions/tool-cache'
import * as ex from '@actions/exec';
import { ConfigParser, Config } from './configparser';

export class Packager
{
    private octokit: gh.GitHub;
    private config: ConfigParser;
    private pkgVersion: string;
    private qtVersion: string;
    private pwd: string;

    private pkgBase: string;

    public constructor(octokit: gh.GitHub, config: ConfigParser, pkgVersion: string, qtVersion: string, pwd: string) {
        this.octokit = octokit;
        this.config = config;
        this.pkgVersion = pkgVersion;
        this.qtVersion = qtVersion;
        this.pwd = pwd;

        this.pkgBase = `qt.qt5.${this.qtVersion.replace(/\./g, "")}.${gh.context.repo.owner.toLowerCase()}.${gh.context.repo.repo.substr(2).toLowerCase()}`;
        core.debug(` => Using package base ${this.pkgBase}`);
    }

    public async createBasePackage() {

    }

    public async createSrcPackage() {
        core.info(" => Creating source package");
        const pkgName = this.pkgBase + ".src";
        const pkgDir = path.join(this.pwd, pkgName);

        core.debug("    -> Downloading and extracting source tarball");
        const srcPath = path.join(pkgDir, "data", this.qtVersion, "Src", this.config.config!.title.toLowerCase());
        await io.mkdirP(srcPath);
        const release = await this.octokit.repos.getReleaseByTag({
            owner: gh.context.repo.owner,
            repo: gh.context.repo.repo,
            tag: this.pkgVersion
        });
        const srcFile = await tc.downloadTool(release.data.tarball_url);
        await tc.extractTar(srcFile, srcPath);

        core.debug("    -> Parsing deploy configuration");
        await this.config.loadConfig(path.join(srcPath, "deploy.json"));

        core.debug("    -> Removing CI and other non-related stuff from sources");
        await io.rmRF(path.join(srcPath, ".github"));
        await io.rmRF(path.join(srcPath, "deploy.json"));

        core.debug("    -> Downloading syncqt.pl");
        const syncQt = await tc.downloadTool(`https://code.qt.io/cgit/qt/qtbase.git/plain/bin/syncqt.pl?h=${this.qtVersion}`);
        core.debug("    -> Running syncqt.pl");
        let syncQtArgs: Array<string> = [syncQt];
        for (let mod of this.config.config!.modules)
            syncQtArgs.push("-module", mod);
        syncQtArgs.push("-version", this.pkgVersion.split('-')[0]);
        syncQtArgs.push("-out", srcPath);
        syncQtArgs.push(srcPath);
        await ex.exec("perl", syncQtArgs, {
            silent: true
        });

        core.debug("    -> Creating meta data");
        const qtSrc = `qt.qt5.${this.qtVersion.replace(/\./g, "")}.src`;
        await fs.writeFile(path.join(pkgDir, "meta", "package.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Package>
    <Name>${pkgName}</Name>
    <DisplayName>${this.config.config!.title} Sources</DisplayName>
    <Version>${this.pkgVersion}</Version>
    <ReleaseDate>${new Date().toISOString().slice(0, 10)}</ReleaseDate>
    <Virtual>true</Virtual>
    <AutoDependOn>${this.pkgBase}, ${qtSrc}</AutoDependOn>
    <Dependencies>${qtSrc}</Dependencies>
</Package>
`);
    }

    public async createPlatformPackage(platform: string) {
        
    }
}