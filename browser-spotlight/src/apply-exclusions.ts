import {
  closeMainWindow,
  getPreferenceValues,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { join } from "path";
import { existsSync } from "fs";
import { ExtensionPreferences } from "./browsers";
import {
  applyExclusionsToKarabiner,
  writeKarabinerTemplate,
} from "./karabiner";

export default async function Command() {
  try {
    const prefs = getPreferenceValues<ExtensionPreferences>();
    const result = applyExclusionsToKarabiner(prefs);

    const templateCandidates = [
      join(__dirname, "..", "karabiner", "cmd-p-browser-spotlight.json"),
      join(process.cwd(), "karabiner", "cmd-p-browser-spotlight.json"),
    ];
    for (const candidate of templateCandidates) {
      if (
        existsSync(join(candidate, "..")) ||
        candidate.includes("browser-spotlight")
      ) {
        try {
          writeKarabinerTemplate(candidate, prefs);
          break;
        } catch {
          // continue
        }
      }
    }

    await closeMainWindow();
    await showHUD(
      `Browser Spotlight: ${result.allowedCount} allowed, ${result.excludedCount} excluded`,
    );
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to update Karabiner",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
