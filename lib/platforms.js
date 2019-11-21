"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Platforms {
    static platforms(filter = null) {
        const pData = [
            "src",
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
        if (filter)
            return pData.filter((platform) => !platform.match(filter));
        else
            return pData;
    }
    static linuxPlatforms(filter = null) {
        return Platforms.platforms(filter).filter((platform) => {
            return Platforms.isBasic(platform) ||
                platform.includes("gcc") ||
                platform.includes("android") ||
                platform.includes("wasm");
        });
    }
    static windowsPlatforms(filter = null) {
        return Platforms.platforms(filter).filter((platform) => {
            return Platforms.isBasic(platform) ||
                platform.includes("msvc") ||
                platform.includes("mingw") ||
                platform.includes("android") ||
                platform.includes("wasm");
        });
    }
    static macosPlatforms(filter = null) {
        return Platforms.platforms(filter).filter((platform) => {
            return Platforms.isBasic(platform) ||
                platform.includes("clang") ||
                platform.includes("ios") ||
                platform.includes("android") ||
                platform.includes("wasm");
        });
    }
    static packagePlatform(platform) {
        switch (platform) {
            case "mingw73_64":
                return "win64_mingw73";
            case "mingw73_32":
                return "win32_mingw73";
            case "msvc2017_64":
                return "win64_msvc2017_64";
            case "msvc2017":
                return "win32_msvc2017";
            case "winrt_x86_msvc2017":
                return "win64_msvc2017_winrt_x86";
            case "winrt_x64_msvc2017":
                return "win64_msvc2017_winrt_x64";
            case "winrt_armv7_msvc2017":
                return "win64_msvc2017_winrt_armv7";
            default:
                return platform;
        }
    }
    static patchString(platform) {
        const embeddedKeys = [
            "android_arm64_v8a",
            "android_armv7",
            "android_x86",
            "ios",
            "winrt_x86_msvc2017",
            "winrt_x64_msvc2017",
            "winrt_armv7_msvc2017"
        ];
        return embeddedKeys.includes(platform) ? "emb-arm-qt5" : "qt5";
    }
    static isBasic(platform) {
        return platform == "src" ||
            platform == "doc" ||
            platform == "examples";
    }
}
exports.Platforms = Platforms;
