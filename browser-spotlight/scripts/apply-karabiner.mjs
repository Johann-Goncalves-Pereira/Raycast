#!/usr/bin/env node
/**
 * Applies the Cmd+P → Browser Spotlight Karabiner rule via code
 * (same intent as the Raycast "Apply Browser Exclusions" command).
 *
 * Usage: npm run apply-karabiner
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const KARABINER_RULE_DESCRIPTION = "Cmd+P → Browser Spotlight when browser frontmost";
const DEEPLINK = "raycast://extensions/johann_goncalves_pereira/browser-spotlight/search";
const SHELL_COMMAND = `open '${DEEPLINK}'`;
const CONFIG_PATH = path.join(os.homedir(), ".config", "karabiner", "karabiner.json");
const TEMPLATE_PATH = path.join(__dirname, "..", "karabiner", "cmd-p-browser-spotlight.json");

const BUNDLE_IDS = [
  "com.google.Chrome",
  "com.google.Chrome.canary",
  "com.google.Chrome.dev",
  "com.apple.Safari",
  "com.apple.SafariTechnologyPreview",
  "company.thebrowser.Browser",
  "company.thebrowser.dia",
  "net.imput.helium",
  "com.brave.Browser",
  "com.microsoft.edgemac",
  "com.vivaldi.Vivaldi",
  "com.operasoftware.Opera",
  "com.kagi.kagimacOS",
  "org.chromium.Chromium",
];

function bundleIdRegex(bundleId) {
  return `^${bundleId.replace(/\./g, "\\.")}$`;
}

function buildRule(bundleIds = BUNDLE_IDS) {
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
        to: [{ shell_command: SHELL_COMMAND }],
        conditions: [
          {
            type: "frontmost_application_if",
            bundle_identifiers: bundleIds.map(bundleIdRegex),
          },
        ],
      },
    ],
  };
}

function apply() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Karabiner config not found: ${CONFIG_PATH}`);
  }

  const backupDir = path.join(path.dirname(CONFIG_PATH), "automatic_backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(CONFIG_PATH, path.join(backupDir, `karabiner_browser_spotlight_${stamp}.json`));

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const profiles = config.profiles ?? [];
  const profile = profiles.find((p) => p.selected) ?? profiles[0];
  if (!profile) throw new Error("No Karabiner profile found");

  profile.complex_modifications = profile.complex_modifications ?? { rules: [] };
  profile.complex_modifications.rules = profile.complex_modifications.rules ?? [];

  const rule = buildRule();
  const rules = profile.complex_modifications.rules;
  const idx = rules.findIndex((r) => r.description === KARABINER_RULE_DESCRIPTION);
  if (idx >= 0) rules[idx] = rule;
  else rules.push(rule);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4) + "\n");

  fs.mkdirSync(path.dirname(TEMPLATE_PATH), { recursive: true });
  fs.writeFileSync(
    TEMPLATE_PATH,
    JSON.stringify({ title: "Browser Spotlight — Cmd+P in browsers", rules: [rule] }, null, 2) + "\n",
  );

  return { configPath: CONFIG_PATH, ruleCount: rules.length, deeplink: DEEPLINK };
}

function openLoginItems() {
  if (process.env.BROWSER_SPOTLIGHT_SKIP_OPEN_SETTINGS === "1") return;
  try {
    execSync('open "x-apple.systempreferences:com.apple.LoginItems-Settings.extension"', {
      stdio: "ignore",
    });
  } catch {
    // ignore
  }
}

function tryKickKarabiner() {
  const cliCandidates = [
    "/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli",
    "/Applications/Karabiner-Elements.app/Contents/MacOS/karabiner_cli",
  ];
  for (const cli of cliCandidates) {
    if (fs.existsSync(cli)) {
      try {
        const out = execSync(`"${cli}" --version`, { encoding: "utf8" });
        console.log("karabiner_cli:", out.trim());
      } catch {
        console.log("karabiner_cli present but not runnable yet (enable background services)");
      }
      return;
    }
  }
  console.log("karabiner_cli not found — open Karabiner-Elements after enabling Login Items");
}

const result = apply();
console.log("Applied Karabiner rule:", KARABINER_RULE_DESCRIPTION);
console.log("Deeplink shell:", SHELL_COMMAND);
console.log("Config:", result.configPath);
console.log("Rules in profile:", result.ruleCount);
console.log("");
console.log("Karabiner background services must be ON for this rule to fire.");
console.log("Opening System Settings → Login Items & Extensions…");
openLoginItems();
tryKickKarabiner();
