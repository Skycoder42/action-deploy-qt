import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as ex from '@actions/exec';
import * as gh from '@actions/github';

import { Packager } from './packager';
import { Uploader } from './uploader';
import { Platforms } from './platforms';
import { PackageConfig } from './config';
import { Sshfs } from './sshfs';

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

        await io.mkdirP(this.pkgDir);
        await io.mkdirP(this.deployDir);
        const octokit = new gh.GitHub(token);
        const repogen = await this.downloadRepogen();

        core.info("### Downloading and creating packages ###");
        const packager = new Packager(octokit, this.pkgDir, config);
        await packager.getSources();
        await packager.createAllPackages(Platforms.platforms(excludes));

        core.info("### Generating and uploading repositories ###");
        const uploader = new Uploader(repogen, this.pkgDir, this.deployDir, config);
        await uploader.generateRepos("linux", "x64", Platforms.linuxPlatforms(excludes));
        await uploader.generateRepos("windows", "x86", Platforms.windowsPlatforms(excludes));
        await uploader.generateRepos("mac", "x64", Platforms.macosPlatforms(excludes));

        core.info(` => Mounting sshfs`);
        const sshfs = new Sshfs(this.deployDir + "-test");
        await sshfs.init();
        await sshfs.mount(host, key, port);
        await sshfs.unmount();
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
            config: null,
            tmpDir: this.initTempDir(os.platform())
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

	private initTempDir(platform: NodeJS.Platform): string {
		let tempDirectory: string = process.env['RUNNER_TEMP'] || ''
		if (!tempDirectory) {
			let baseLocation: string
			if (platform ==  "win32") {
				// On windows use the USERPROFILE env variable
				baseLocation = process.env['USERPROFILE'] || 'C:\\'
			} else {
				if (platform === 'darwin')
					baseLocation = '/Users'
				else
					baseLocation = '/home'
			}
			tempDirectory = path.join(baseLocation, 'actions', 'temp')
		}
		return tempDirectory;
	}
}