/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Search Engine - Default search engine when opening a new search tab. */
  "searchEngine": "google" | "duckduckgo" | "bing",
  /** Suggestions - When enabled, show DuckDuckGo / YouTube autocomplete suggestions. */
  "enableSuggestions": boolean,
  /** Excluded Browsers - Exclude Google Chrome from Cmd+P Omnibar (keeps native Print). */
  "exclude_com.google.Chrome": boolean,
  /** undefined - Exclude Chrome Canary from Cmd+P Omnibar. */
  "exclude_com.google.Chrome.canary": boolean,
  /** undefined - Exclude Chrome Dev from Cmd+P Omnibar. */
  "exclude_com.google.Chrome.dev": boolean,
  /** undefined - Exclude Safari from Cmd+P Omnibar. */
  "exclude_com.apple.Safari": boolean,
  /** undefined - Exclude Safari Technology Preview from Cmd+P Omnibar. */
  "exclude_com.apple.SafariTechnologyPreview": boolean,
  /** undefined - Exclude Arc from Cmd+P Omnibar. */
  "exclude_company.thebrowser.Browser": boolean,
  /** undefined - Exclude Dia from Cmd+P Omnibar. */
  "exclude_company.thebrowser.dia": boolean,
  /** undefined - Exclude Helium from Cmd+P Omnibar. */
  "exclude_net.imput.helium": boolean,
  /** undefined - Exclude Zen Browser from Cmd+P Omnibar. */
  "exclude_app.zen-browser.zen": boolean,
  /** undefined - Exclude Brave from Cmd+P Omnibar. */
  "exclude_com.brave.Browser": boolean,
  /** undefined - Exclude Microsoft Edge from Cmd+P Omnibar. */
  "exclude_com.microsoft.edgemac": boolean,
  /** undefined - Exclude Vivaldi from Cmd+P Omnibar. */
  "exclude_com.vivaldi.Vivaldi": boolean,
  /** undefined - Exclude Opera from Cmd+P Omnibar. */
  "exclude_com.operasoftware.Opera": boolean,
  /** undefined - Exclude Orion from Cmd+P Omnibar. */
  "exclude_com.kagi.kagimacOS": boolean,
  /** undefined - Exclude Chromium from Cmd+P Omnibar. */
  "exclude_org.chromium.Chromium": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search` command */
  export type Search = ExtensionPreferences & {}
  /** Preferences accessible in the `cmd-chrome` command */
  export type CmdChrome = ExtensionPreferences & {}
  /** Preferences accessible in the `cmd-chrome-dev` command */
  export type CmdChromeDev = ExtensionPreferences & {}
  /** Preferences accessible in the `cmd-safari` command */
  export type CmdSafari = ExtensionPreferences & {}
  /** Preferences accessible in the `cmd-helium` command */
  export type CmdHelium = ExtensionPreferences & {}
  /** Preferences accessible in the `cmd-zen` command */
  export type CmdZen = ExtensionPreferences & {}
  /** Preferences accessible in the `sync-browser-exclusions` command */
  export type SyncBrowserExclusions = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search` command */
  export type Search = {}
  /** Arguments passed to the `cmd-chrome` command */
  export type CmdChrome = {}
  /** Arguments passed to the `cmd-chrome-dev` command */
  export type CmdChromeDev = {}
  /** Arguments passed to the `cmd-safari` command */
  export type CmdSafari = {}
  /** Arguments passed to the `cmd-helium` command */
  export type CmdHelium = {}
  /** Arguments passed to the `cmd-zen` command */
  export type CmdZen = {}
  /** Arguments passed to the `sync-browser-exclusions` command */
  export type SyncBrowserExclusions = {}
}

