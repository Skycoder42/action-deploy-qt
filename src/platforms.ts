export class Platforms {
    public static platforms(filter: string | null = null): string[] {
        const pData: string[] = [
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

    public static linuxPlatforms(filter: string | null = null): string[] {
        return Platforms.platforms(filter).filter((platform) => {
            return Platforms.isBasic(platform) ||
                   platform.includes("gcc") ||
                   platform.includes("android") ||
                   platform.includes("wasm");
        });
    }

    public static windowsPlatforms(filter: string | null = null): string[] {
        return Platforms.platforms(filter).filter((platform) => {
            return Platforms.isBasic(platform) ||
                   platform.includes("msvc") ||
                   platform.includes("mingw") ||
                   platform.includes("android") ||
                   platform.includes("wasm");
        });
    }

    public static macosPlatforms(filter: string | null = null): string[] {
        return Platforms.platforms(filter).filter((platform) => {
            return Platforms.isBasic(platform) ||
                   platform.includes("clang") ||
                   platform.includes("ios") ||
                   platform.includes("android") ||
                   platform.includes("wasm");
        });
    }

    public static packagePlatform(platform: string): string {
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

    public static patchString(platform: string): string {
        const embeddedKeys: string[] = [
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

    private static isBasic(platform: string): boolean {
        return platform == "src" ||
               platform == "doc" ||
               platform == "examples"
    }
}