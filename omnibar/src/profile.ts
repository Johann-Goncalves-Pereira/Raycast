import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { BrowserDefinition, profileRootFor } from "./browser-catalog";

export function listProfileDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root);
  return entries
    .filter((name) => name === "Default" || /^Profile \d+$/i.test(name))
    .map((name) => join(root, name))
    .filter((path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    });
}

/** Chromium "Local State" → last_used profile directory. */
export function lastUsedProfileDir(
  browser: BrowserDefinition,
): string | undefined {
  const root = profileRootFor(browser);
  if (!root || !existsSync(root)) return undefined;

  let lastUsed = "Default";
  try {
    const localState = JSON.parse(
      readFileSync(join(root, "Local State"), "utf8"),
    ) as { profile?: { last_used?: string } };
    if (localState.profile?.last_used) {
      lastUsed = localState.profile.last_used;
    }
  } catch {
    // keep Default
  }

  const preferred = join(root, lastUsed);
  if (existsSync(preferred) && statSync(preferred).isDirectory()) {
    return preferred;
  }

  const profiles = listProfileDirs(root);
  return profiles[0];
}

/**
 * Resolve the active Gecko/Zen profile directory from profiles.ini.
 * Exported for tests.
 */
export function parseGeckoProfilesIni(
  iniText: string,
  root: string,
): string | undefined {
  const sections: Array<{
    name?: string;
    path?: string;
    isRelative?: boolean;
    default?: boolean;
  }> = [];
  let current: (typeof sections)[number] | undefined;

  for (const rawLine of iniText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const section = line.match(/^\[(.+)\]$/);
    if (section) {
      current = {};
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === "name") current.name = value;
    if (key === "path") current.path = value;
    if (key === "isrelative") current.isRelative = value === "1";
    if (key === "default") current.default = value === "1";
  }

  const withPath = sections.filter((s) => s.path);
  const preferred =
    withPath.find((s) => s.default) ??
    withPath.find((s) => /default/i.test(s.name ?? "")) ??
    withPath[0];
  if (!preferred?.path) return undefined;

  const profilePath =
    preferred.isRelative === false
      ? preferred.path
      : join(root, preferred.path);
  if (existsSync(profilePath) && statSync(profilePath).isDirectory()) {
    return profilePath;
  }
  return undefined;
}

/** Zen / Firefox-style profile root via profiles.ini. */
export function geckoProfileDir(
  browser: BrowserDefinition,
): string | undefined {
  const root = profileRootFor(browser);
  if (!root || !existsSync(root)) return undefined;

  const iniPath = join(root, "profiles.ini");
  if (existsSync(iniPath)) {
    try {
      const parsed = parseGeckoProfilesIni(
        readFileSync(iniPath, "utf8"),
        root,
      );
      if (parsed) return parsed;
    } catch {
      // fall through to scanning Profiles/
    }
  }

  const profilesRoot = join(root, "Profiles");
  if (!existsSync(profilesRoot)) return undefined;
  const dirs = readdirSync(profilesRoot)
    .map((name) => join(profilesRoot, name))
    .filter((path) => {
      try {
        return (
          statSync(path).isDirectory() && existsSync(join(path, "places.sqlite"))
        );
      } catch {
        return false;
      }
    });
  return dirs[0];
}

export function safariHistoryDbPath(): string {
  return join(homedir(), "Library", "Safari", "History.db");
}
