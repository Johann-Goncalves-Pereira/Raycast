#!/usr/bin/env node
/**
 * Diagnose and repair Karabiner so Cmd+P → Browser Spotlight can fire.
 *
 * Usage: npm run fix-karabiner
 *
 * This cannot grant macOS permissions for you. It opens the right panes and
 * re-applies the rule. You must approve the Karabiner install wizard and toggles.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const KARABINER_RULE_DESCRIPTION = "Cmd+P → Browser Spotlight when browser frontmost";
const DEEPLINK = "raycast://extensions/johann_goncalves_pereira/browser-spotlight/search";
const CONFIG_PATH = path.join(os.homedir(), ".config", "karabiner", "karabiner.json");
const ORG_PQRS = "/Library/Application Support/org.pqrs";
const KARABINER_APP = "/Applications/Karabiner-Elements.app";
const DOWNLOAD_URL = "https://karabiner-elements.pqrs.org/";
const LATEST_DMG_HINT =
  "https://github.com/pqrs-org/Karabiner-Elements/releases/latest";

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
  } catch (error) {
    return "";
  }
}

function openUrl(url) {
  try {
    execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function diagnose() {
  const appExists = fs.existsSync(KARABINER_APP);
  const orgPqrsExists = fs.existsSync(ORG_PQRS);
  const cliPath = path.join(ORG_PQRS, "Karabiner-Elements", "bin", "karabiner_cli");
  const cliExists = fs.existsSync(cliPath);
  const processes = run("pgrep -lf -i karabiner") || "";
  const processLines = processes ? processes.split("\n").filter(Boolean) : [];

  let rulePresent = false;
  let heliumInAllowlist = false;
  let configExists = fs.existsSync(CONFIG_PATH);
  if (configExists) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      const profile = (config.profiles ?? []).find((p) => p.selected) ?? config.profiles?.[0];
      const rules = profile?.complex_modifications?.rules ?? [];
      const rule = rules.find((r) => r.description === KARABINER_RULE_DESCRIPTION);
      rulePresent = Boolean(rule);
      const bundles = rule?.manipulators?.[0]?.conditions?.[0]?.bundle_identifiers ?? [];
      heliumInAllowlist = bundles.some((b) => String(b).includes("net\\.imput\\.helium"));
    } catch {
      configExists = false;
    }
  }

  return {
    appExists,
    orgPqrsExists,
    cliExists,
    cliPath,
    processCount: processLines.length,
    processLines,
    configExists,
    rulePresent,
    heliumInAllowlist,
  };
}

function printChecklist(d) {
  const line = (ok, label, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  };

  console.log("\n=== Karabiner checklist ===");
  line(d.appExists, "Karabiner-Elements.app installed");
  line(d.orgPqrsExists, "Privileged install (/Library/Application Support/org.pqrs)");
  line(d.cliExists, "karabiner_cli present", d.cliExists ? d.cliPath : "missing");
  line(d.processCount > 0, "Karabiner processes running", `${d.processCount} process(es)`);
  line(d.configExists, "karabiner.json exists", CONFIG_PATH);
  line(d.rulePresent, `Rule: ${KARABINER_RULE_DESCRIPTION}`);
  line(d.heliumInAllowlist, "Helium (net.imput.helium) in Cmd+P allowlist");
  console.log("===========================\n");
}

function openPermissionPanes() {
  console.log("Opening Karabiner-Elements (complete any install/driver wizard)…");
  if (fs.existsSync(KARABINER_APP)) {
    openUrl(KARABINER_APP);
  } else {
    console.log("  App missing — install from", DOWNLOAD_URL);
  }

  console.log("Opening System Settings → Login Items & Extensions…");
  console.log("  → App Background Activity → (i) → enable Karabiner daemons");
  console.log("  → Driver Extensions (i) → Karabiner-VirtualHIDDevice-Manager if listed");
  openUrl("x-apple.systempreferences:com.apple.LoginItems-Settings.extension");

  console.log("Opening Privacy & Security → Input Monitoring…");
  console.log("  → enable Karabiner-Core-Service (or karabiner_grabber on older builds)");
  openUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent");
}

function reapplyRule() {
  const script = path.join(__dirname, "apply-karabiner.mjs");
  console.log("Re-applying Browser Spotlight Cmd+P rule…");
  const result = spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, BROWSER_SPOTLIGHT_SKIP_OPEN_SETTINGS: "1" },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`apply-karabiner failed with exit ${result.status}`);
  }
}

function printReinstallGuide() {
  console.log(`
REINSTALL REQUIRED
------------------
Privileged Karabiner components are missing. Login Items will NOT show
Karabiner toggles until this install completes.

1. Keep your rules (do not delete):
   ${CONFIG_PATH}

2. Download the latest Karabiner-Elements for macOS 26:
   ${DOWNLOAD_URL}
   ${LATEST_DMG_HINT}

3. Open the DMG → run Karabiner-Elements → approve installer password/prompts

4. Re-run:
   npm run fix-karabiner

5. Then enable:
   System Settings → General → Login Items & Extensions
     → App Background Activity → (i)
     → Karabiner-Elements Privileged Daemons (and Agents / v2 if listed)
   Privacy & Security → Input Monitoring → Karabiner-Core-Service
`);
}

function printNextSteps(d) {
  const healthy = d.orgPqrsExists && d.processCount > 0 && d.rulePresent && d.heliumInAllowlist;

  if (healthy) {
    console.log("Karabiner looks healthy.");
    console.log("Test: focus Helium → press ⌘P → Browser Spotlight should open (not a new tab).");
    console.log("If Raycast opens but tabs are empty: System Settings → Privacy & Security →");
    console.log("  Automation → allow Raycast to control Helium.");
    return 0;
  }

  if (!d.orgPqrsExists) {
    printReinstallGuide();
    return 2;
  }

  console.log("Privileged install exists, but Karabiner is not fully running yet.");
  console.log("In the panes that just opened:");
  console.log("  1. Login Items → App Background Activity → (i) → enable Karabiner daemons");
  console.log("  2. Input Monitoring → enable Karabiner-Core-Service");
  console.log("  3. If still stuck: toggle those off/on, or reinstall from", DOWNLOAD_URL);
  console.log("Then re-run: npm run fix-karabiner");
  return 1;
}

const before = diagnose();
console.log("Before repair:");
printChecklist(before);

openPermissionPanes();

try {
  reapplyRule();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
}

// Brief pause so newly launched services can appear
run("sleep 2");

const after = diagnose();
console.log("After repair attempt:");
printChecklist(after);

if (after.processLines.length) {
  console.log("Running processes:");
  for (const line of after.processLines.slice(0, 12)) console.log(" ", line);
  console.log("");
}

const code = printNextSteps(after);
process.exitCode = code;
