import { readdirSync, readFileSync, existsSync } from "fs";
import { join, isAbsolute } from "path";
import { BrowserDefinition, profileRootFor } from "./browsers";
import { listProfileDirs } from "./profile";

export type BrowserExtension = {
  id: string;
  name: string;
  description?: string;
  optionsUrl?: string;
  detailsUrl: string;
};

function readJsonLoose(path: string): Record<string, unknown> | undefined {
  try {
    const raw = readFileSync(path, "utf8");
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

function resolveLocalizedString(
  value: unknown,
  extensionPath: string | undefined,
): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("__MSG_") || !extensionPath) return value;

  const key = value.slice("__MSG_".length, -2);
  const localesDir = join(extensionPath, "_locales");
  if (!existsSync(localesDir)) return key;

  const preferred = ["en_US", "en", "en_GB"];
  const locales = readdirSync(localesDir);
  const locale = preferred.find((l) => locales.includes(l)) ?? locales[0];
  if (!locale) return key;

  const messages = readJsonLoose(join(localesDir, locale, "messages.json"));
  const entry = messages?.[key] as { message?: string } | undefined;
  return entry?.message ?? key;
}

function resolveExtensionPath(
  profileDir: string,
  relativeOrAbsolute?: string,
): string | undefined {
  if (!relativeOrAbsolute) return undefined;
  if (isAbsolute(relativeOrAbsolute) && existsSync(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }
  const underExtensions = join(profileDir, "Extensions", relativeOrAbsolute);
  if (existsSync(underExtensions)) return underExtensions;
  const direct = join(profileDir, relativeOrAbsolute);
  if (existsSync(direct)) return direct;
  return undefined;
}

function isExtensionEnabled(settings: Record<string, unknown>): boolean {
  // state 0 = disabled when present (modern Chromium often omits state entirely)
  if (typeof settings.state === "number" && settings.state === 0) {
    return false;
  }
  // Chromium DisableReason::DISABLE_USER_ACTION === 1
  const disableReasons = settings.disable_reasons;
  if (Array.isArray(disableReasons) && disableReasons.includes(1)) {
    return false;
  }
  return true;
}

function extensionFromSettings(
  id: string,
  settings: Record<string, unknown>,
  scheme: string,
  profileDir: string,
): BrowserExtension | undefined {
  if (!isExtensionEnabled(settings)) return undefined;

  const manifest = settings.manifest as Record<string, unknown> | undefined;
  const rawPath = typeof settings.path === "string" ? settings.path : undefined;
  const path = resolveExtensionPath(profileDir, rawPath);

  let name = typeof manifest?.name === "string" ? manifest.name : undefined;
  let description =
    typeof manifest?.description === "string"
      ? manifest.description
      : undefined;
  let optionsPage: string | undefined;

  const diskManifest = path
    ? readJsonLoose(join(path, "manifest.json"))
    : undefined;
  if (diskManifest) {
    name = resolveLocalizedString(diskManifest.name, path) ?? name;
    description =
      resolveLocalizedString(diskManifest.description, path) ?? description;
    const optionsUi = diskManifest.options_ui as { page?: string } | undefined;
    optionsPage =
      (typeof diskManifest.options_page === "string"
        ? diskManifest.options_page
        : undefined) ?? optionsUi?.page;
  } else if (manifest) {
    name = resolveLocalizedString(manifest.name, path) ?? name;
    description =
      resolveLocalizedString(manifest.description, path) ?? description;
  }

  if (!name || name.startsWith("__MSG_")) {
    name = (name ?? id).replace(/^__MSG_/, "").replace(/__$/, "");
  }

  // Skip nameless / id-only component stubs
  if (!name || name === id || name.length < 2) return undefined;

  const detailsUrl = `${scheme}://extensions/?id=${id}`;
  const optionsUrl = optionsPage
    ? `${scheme}-extension://${id}/${optionsPage}`
    : undefined;

  return { id, name, description, optionsUrl, detailsUrl };
}

export function getInstalledExtensions(
  browser: BrowserDefinition,
): BrowserExtension[] {
  if (browser.engine === "webkit" || !browser.urlScheme) return [];

  const root = profileRootFor(browser);
  if (!root) return [];

  const scheme = browser.urlScheme;
  const byId = new Map<string, BrowserExtension>();

  for (const profileDir of listProfileDirs(root)) {
    for (const file of ["Secure Preferences", "Preferences"]) {
      const prefs = readJsonLoose(join(profileDir, file));
      if (!prefs) continue;
      const extensions = prefs.extensions as
        { settings?: Record<string, Record<string, unknown>> } | undefined;
      const settings = extensions?.settings;
      if (!settings) continue;

      for (const [id, value] of Object.entries(settings)) {
        if (byId.has(id)) continue;
        const ext = extensionFromSettings(id, value, scheme, profileDir);
        if (ext) byId.set(id, ext);
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
