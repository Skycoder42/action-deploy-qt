import * as path from 'path';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as gh from '@actions/github';

import { Packager } from './packager';

export class Deployer
{
    private platforms: Array<string> = [
        "gcc_64",
        "android_arm64_v8a",
        "android_x86_64",
        "android_armv7",
        "android_x86",
        "wasm_32",
        "msvc2017_64",
        "msvc2017",
        "winrt_x64_msvc2017",
        "winrt_x86_msvc2017",
        "winrt_armv7_msvc2017",
        "mingw73_64",
        "mingw73_32",
        "clang_64",
        "ios",
        "doc",
        "examples"
    ];

    public async run(token: string, qtVersion: string, excludes: string, host: string, key: string, port: string)  {
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
        if (!"src".match(excludes))
            await packager.createSrcPackage();
        for (let platform of this.platforms) {
            if (platform.match(excludes))
                continue;
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