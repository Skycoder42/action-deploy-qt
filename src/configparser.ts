import { promises as fs } from 'fs';

export interface License
{
    name: string,
    path: string
}

export interface Config
{
    title: string;
    description: string
    modules: Array<string>
    license: License
    dependencies: Array<string> | null,
    extraInstall: Map<string, string> | null
    hostbuilds: Array<string> | null
}

export class ConfigParser
{
    public config: Config | null = null;

    public async loadConfig(path: string) {
        const textBuf = await fs.readFile(path);
        this.config = JSON.parse(textBuf.toString());
    }
}