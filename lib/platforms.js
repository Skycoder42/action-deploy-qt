"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Platforms = void 0;
class Platforms {
    static platforms(filter = null) {
        const pData = [
            "src",
            "gcc_64",
            "android",
            "wasm_32",
            "msvc2019_64",
            "msvc2019",
            "winrt_x64_msvc2019",
            "winrt_x86_msvc2019",
            "winrt_armv7_msvc2019",
            "mingw81_64",
            "mingw81_32",
            "clang_64",
            "ios",
            "doc",
            "examples",
        ];
        if (filter)
            return pData.filter((platform) => !platform.match(filter));
        else
            return pData;
    }
    static linuxPlatforms(filter = null) {
        return Platforms.platforms(filter).filter((platform) => {
            return (Platforms.isBasic(platform) ||
                platform.includes("gcc") ||
                platform.includes("android") ||
                platform.includes("wasm"));
        });
    }
    static windowsPlatforms(filter = null) {
        return Platforms.platforms(filter).filter((platform) => {
            return (Platforms.isBasic(platform) ||
                platform.includes("msvc") ||
                platform.includes("mingw") ||
                platform.includes("android") ||
                platform.includes("wasm"));
        });
    }
    static macosPlatforms(filter = null) {
        return Platforms.platforms(filter).filter((platform) => {
            return (Platforms.isBasic(platform) ||
                platform.includes("clang") ||
                platform.includes("ios") ||
                platform.includes("android") ||
                platform.includes("wasm"));
        });
    }
    static packagePlatform(platform) {
        switch (platform) {
            case "mingw81_64":
                return "win64_mingw81";
            case "mingw81_32":
                return "win32_mingw81";
            case "msvc2019_64":
                return "win64_msvc2019_64";
            case "msvc2019":
                return "win32_msvc2019";
            case "winrt_x86_msvc2019":
                return "win64_msvc2019_winrt_x86";
            case "winrt_x64_msvc2019":
                return "win64_msvc2019_winrt_x64";
            case "winrt_armv7_msvc2019":
                return "win64_msvc2019_winrt_armv7";
            default:
                return platform;
        }
    }
    static patchString(platform) {
        const embeddedKeys = [
            "android",
            "ios",
            "winrt_x86_msvc2019",
            "winrt_x64_msvc2019",
            "winrt_armv7_msvc2019",
        ];
        return embeddedKeys.includes(platform) ? "emb-arm-qt5" : "qt5";
    }
    static hostToolPlatform(os, platforms) {
        let matchP;
        switch (os) {
            case "linux":
                matchP = platforms.filter((platform) => platform.includes("android") || platform.includes("wasm"));
                break;
            case "windows":
                matchP = platforms.filter((platform) => platform.includes("winrt"));
                break;
            case "mac":
                matchP = platforms.filter((platform) => platform.includes("ios"));
                break;
            default:
                throw Error(`Unsupported os: ${os}`);
        }
        if (matchP.length == 0)
            throw Error(`None of the provided packages provides host tools for ${os}`);
        return matchP[0];
    }
    static hostOs(platform) {
        if (platform.includes("android") || platform.includes("wasm"))
            return "linux";
        else if (platform.includes("winrt"))
            return "windows";
        else if (platform.includes("ios"))
            return "mac";
        else
            return null;
    }
    static isBasic(platform) {
        return platform == "src" || platform == "doc" || platform == "examples";
    }
}
exports.Platforms = Platforms;
