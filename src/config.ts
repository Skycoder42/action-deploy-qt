import { promises as fs } from 'fs';

export interface License
{
    name: string,
    path: string
}

export interface Installs {
    [key: string]: string;
}

export interface Config
{
    title: string;
    description: string
    modules: Array<string>
    license: License
    dependencies: Array<string> | null,
    installs: Installs | null
    hostbuilds: Array<string> | null
}

export class ConfigParser
{
    public static async loadConfig(path: string): Promise<Config> {
        const textBuf = await fs.readFile(path);
        return JSON.parse(textBuf.toString());
    }
}