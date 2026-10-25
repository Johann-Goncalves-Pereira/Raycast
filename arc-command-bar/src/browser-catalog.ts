import { homedir } from "os";
import { join } from "path";

export type BrowserEngine = "chromium" | "webkit" | "arc";

export type BrowserDefinition = {
  id: string;
  name: string;
  bundleId: string;
  engine: BrowserEngine;
  /** Chromium internal URL scheme, e.g. chrome:// */
  urlScheme?: string;
  /** Relative path under ~/Library/Application Support */
  profileSupportPath?: string;
};

export const BROWSER_CATALOG: BrowserDefinition[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    bundleId: "com.google.Chrome",
    engine: "chromium",
    urlScheme: "chrome",
    profileSupportPath: "Google/Chrome",
  },
  {
    id: "chrome-canary",
    name: "Google Chrome Canary",
    bundleId: "com.google.Chrome.canary",
    engine: "chromium",
    urlScheme: "chrome",
    profileSupportPath: "Google/Chrome Canary",
  },
  {
    id: "chrome-dev",
    name: "Google Chrome Dev",
    bundleId: "com.google.Chrome.dev",
    engine: "chromium",
    urlScheme: "chrome",
    profileSupportPath: "Google/Chrome Dev",
  },
  {
    id: "safari",
    name: "Safari",
    bundleId: "com.apple.Safari",
    engine: "webkit",
  },
  {
    id: "safari-tp",
    name: "Safari Technology Preview",
    bundleId: "com.apple.SafariTechnologyPreview",
    engine: "webkit",
  },
  {
    id: "arc",
    name: "Arc",
    bundleId: "company.thebrowser.Browser",
    engine: "arc",
    urlScheme: "chrome",
    profileSupportPath: "Arc/User Data",
  },
  {
    id: "dia",
    name: "Dia",
    bundleId: "company.thebrowser.dia",
    engine: "arc",
    urlScheme: "chrome",
    profileSupportPath: "Dia/User Data",
  },
  {
    id: "helium",
    name: "Helium",
    bundleId: "net.imput.helium",
    engine: "chromium",
    urlScheme: "chrome",
    profileSupportPath: "net.imput.helium",
  },
  {
    id: "brave",
    name: "Brave Browser",
    bundleId: "com.brave.Browser",
    engine: "chromium",
    urlScheme: "brave",
    profileSupportPath: "BraveSoftware/Brave-Browser",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    bundleId: "com.microsoft.edgemac",
    engine: "chromium",
    urlScheme: "edge",
    profileSupportPath: "Microsoft Edge",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    bundleId: "com.vivaldi.Vivaldi",
    engine: "chromium",
    urlScheme: "vivaldi",
    profileSupportPath: "Vivaldi",
  },
  {
    id: "opera",
    name: "Opera",
    bundleId: "com.operasoftware.Opera",
    engine: "chromium",
    urlScheme: "opera",
    profileSupportPath: "com.operasoftware.Opera",
  },
  {
    id: "orion",
    name: "Orion",
    bundleId: "com.kagi.kagimacOS",
    engine: "webkit",
  },
  {
    id: "chromium",
    name: "Chromium",
    bundleId: "org.chromium.Chromium",
    engine: "chromium",
    urlScheme: "chrome",
    profileSupportPath: "Chromium",
  },
];

export const BROWSER_BY_BUNDLE_ID = new Map(
  BROWSER_CATALOG.map((b) => [b.bundleId, b]),
);

export function findBrowserByBundleId(
  bundleId: string | undefined,
): BrowserDefinition | undefined {
  if (!bundleId) return undefined;
  return BROWSER_BY_BUNDLE_ID.get(bundleId);
}

export function profileRootFor(browser: BrowserDefinition): string | undefined {
  if (!browser.profileSupportPath) return undefined;
  return join(
    homedir(),
    "Library",
    "Application Support",
    browser.profileSupportPath,
  );
}

export const KARABINER_RULE_DESCRIPTION =
  "Cmd+P → Browser Spotlight when browser frontmost";
