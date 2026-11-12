# Omnibar behaviors

Each row is a behavior that already went wrong once. The test next to it is the lock. Change the behavior only by changing the test first.

| Behavior | Lock |
| --- | --- |
| Arrow down on history or suggestions stays on that row. A result refresh does not pull the highlight back to the first row. Selection resets only when the query or the bang changes. | `selectionAfterReport` and `shouldResetSelection` in `src/result-order.test.ts` |
| Cmd+Enter inside a bang opens that site's search URL. An empty bang query stays in the bang. An unscoped query uses the browser's search engine. A pasted `http` or `https` URL opens that page, including Cmd+Enter and inside a bang. `github.com` stays a search. Closing does not clear the bang on screen before the window goes away. | `scopedSubmitUrl` and `navigableHttpUrl` in `src/submit-target.test.ts` |
| Escape, empty Delete, Enter, and Cmd+Enter return focus to the browser after the window closes. A trackpad gesture or click that unmounts the window does not activate the browser. | `shouldActivateBrowser` in `src/close-focus.test.ts` |
| The Zen command icon is `assets/browsers/zen-mark.png`, the dock mark. It is not `document.icns`. The path is new so Raycast does not keep the old document bitmap. | `commandIconPath` in `scripts/browser-command-manifest.test.mjs` |
| Escape closes Omnibar and returns Raycast to the empty root bar, so the next Cmd+Space is normal Raycast. Empty Backspace inside a bang leaves the bang. Empty Backspace at the root closes Omnibar. Backspace with text deletes a character. | `dismissDecision` in `src/dismiss.test.ts` |
| A fresh Cmd+P hint paints immediately. A cold open with no hint may show the spinner. Cached rows do not go back to the spinner while they refresh. | `shouldBlockList` in `src/list-loading.test.ts` |
| `/new fold` in Zen ranks New Folder first. Safari does not get `chrome://` pages. Zen does not get the Chrome Web Store. Chrome keeps Incognito, Downloads, Extensions, and Task Manager. | `filterCommands` in `src/commands.test.ts` |
| A Quick section above history and suggestions shows two suggestions and two history rows. The full lists stay below it. A site appears once: Quick does not repeat in the lists under it, and `www` is the same site. History is ranked by how often the link was opened. | `quickPicks`, `uniqueBySite`, `uniqueLabels`, and `filterHistory` in `src/result-order.test.ts` and `src/browser-history.test.ts` |
| Each history link keeps the clock on the left and the site's own logo on the right. | `historyLinkLogo` in `src/site-mark.test.ts` |
| Pages that are open, finished loading, and on the current Space sit above history. Holding Cmd+Shift shows only that list. | `pagesOnThisSpace`, `parseOpenSpaceHeld`, and `sectionsForQuery` in `src/open-pages.test.ts` and `src/result-order.test.ts` |
| A draft older than two seconds opens as an empty Omnibar. Reopening sooner keeps the draft. Enter on a pasted `http` or `https` URL opens that page instead of a matching tab or history row. | `sessionForOpen` in `src/session.test.ts` and `selectionAfterType` in `src/result-order.test.ts` |
| With two Zen profiles open, a link opens in the Zen that was focused when Cmd+P fired. It does not open in the Zen that was launched most recently. Escape still returns to that same Zen. | `shouldOpenFocusedProcess`, `rememberFocusedProcess`, and `parseLastBrowserHint` in `src/focused-browser.test.ts` |
| Omnibar commands stay off the empty Raycast bar. A live `ray develop` build is the only state Raycast pins into Development. Install publishes a build, then stops that watcher. Cmd+P still opens the command. | `pinnedToDevelopmentSection` and `shouldStopDevelopWatcher` in `scripts/update-plan.test.mjs` |
