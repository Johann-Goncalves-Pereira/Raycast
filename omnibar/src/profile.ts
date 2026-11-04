import { existsSync, readdirSync, readFileSync, statSync } from "fs";
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
