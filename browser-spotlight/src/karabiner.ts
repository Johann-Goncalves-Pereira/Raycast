import { homedir } from "os";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "fs";
import { dirname, join } from "path";
import {
  BROWSER_CATALOG,
  KARABINER_RULE_DESCRIPTION,
  getAllowedBrowsers,
  ExtensionPreferences,
} from "./browsers";

export const KARABINER_CONFIG_PATH = join(
  homedir(),
  ".config",
  "karabiner",
  "karabiner.json",
);

const EXTENSION_DEEPLINK =
  "open 'raycast://extensions/johann_goncalves_pereira/browser-spotlight/search'";

type KarabinerManipulator = {
  type: string;
  from?: unknown;
  to?: unknown;
  conditions?: Array<{
    type: string;
    bundle_identifiers?: string[];
  }>;
  description?: string;
};

type KarabinerRule = {
  description: string;
  manipulators: KarabinerManipulator[];
};

type KarabinerConfig = {
  profiles?: Array<{
    name?: string;
    selected?: boolean;
    complex_modifications?: {
      rules?: KarabinerRule[];
    };
  }>;
  [key: string]: unknown;
};

function bundleIdRegex(bundleId: string): string {
  return `^${bundleId.replace(/\./g, "\\.")}$`;
}

export function buildSpotlightRule(
  prefs?: ExtensionPreferences,
): KarabinerRule {
  const allowed = getAllowedBrowsers(prefs);
  // If everything is excluded, use an impossible bundle id so Cmd+P is never remapped
  const bundleIds =
    allowed.length > 0
      ? allowed.map((b) => bundleIdRegex(b.bundleId))
      : ["^browser\\.spotlight\\.none$"];

  return {
    description: KARABINER_RULE_DESCRIPTION,
    manipulators: [
      {
        type: "basic",
        from: {
          key_code: "p",
          modifiers: {
            mandatory: ["command"],
            optional: ["caps_lock"],
          },
        },
        to: [
          {
            shell_command: EXTENSION_DEEPLINK,
          },
        ],
        conditions: [
          {
            type: "frontmost_application_if",
            bundle_identifiers: bundleIds,
          },
        ],
      },
    ],
  };
}

export function applyExclusionsToKarabiner(prefs?: ExtensionPreferences): {
  path: string;
  allowedCount: number;
  excludedCount: number;
} {
  if (!existsSync(KARABINER_CONFIG_PATH)) {
    throw new Error(`Karabiner config not found at ${KARABINER_CONFIG_PATH}`);
  }

  const backupDir = join(dirname(KARABINER_CONFIG_PATH), "automatic_backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(
    KARABINER_CONFIG_PATH,
    join(backupDir, `karabiner_browser_spotlight_${stamp}.json`),
  );

  const raw = readFileSync(KARABINER_CONFIG_PATH, "utf8");
  const config = JSON.parse(raw) as KarabinerConfig;
  const profiles = config.profiles ?? [];
  const profile = profiles.find((p) => p.selected) ?? profiles[0];
  if (!profile) {
    throw new Error("No Karabiner profile found");
  }

  profile.complex_modifications = profile.complex_modifications ?? {
    rules: [],
  };
  profile.complex_modifications.rules =
    profile.complex_modifications.rules ?? [];

  const rule = buildSpotlightRule(prefs);
  const rules = profile.complex_modifications.rules;
  const existingIndex = rules.findIndex(
    (r) => r.description === KARABINER_RULE_DESCRIPTION,
  );
  if (existingIndex >= 0) {
    rules[existingIndex] = rule;
  } else {
    rules.push(rule);
  }

  writeFileSync(
    KARABINER_CONFIG_PATH,
    JSON.stringify(config, null, 4) + "\n",
    "utf8",
  );

  const allowed = getAllowedBrowsers(prefs);
  return {
    path: KARABINER_CONFIG_PATH,
    allowedCount: allowed.length,
    excludedCount: BROWSER_CATALOG.length - allowed.length,
  };
}

export function writeKarabinerTemplate(
  targetPath: string,
  prefs?: ExtensionPreferences,
): void {
  const rule = buildSpotlightRule(prefs);
  const template = {
    title: "Browser Spotlight — Cmd+P in browsers",
    rules: [rule],
  };
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(template, null, 2) + "\n", "utf8");
}
