import * as core from '@actions/core';

import { Deployer } from './deployer';

async function run() {
	try {
		const deployer = new Deployer();
		await deployer.run(core.getInput('token'),
						   core.getInput('version'),
						   core.getInput('excludes'),
						   core.getInput('host'),
						   core.getInput('key'),
						   core.getInput('port'));
	} catch (error) {
		core.error(error.message);
		core.setFailed(error.message);
	}
}

run();
