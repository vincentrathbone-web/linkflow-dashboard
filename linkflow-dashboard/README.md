# LinkFlow desktop client

LinkFlow is a private, Windows desktop link workspace. Its React interface is packaged with Tauri and connects directly to the LinkFlow WordPress plugin API; it never renders the WordPress theme or Elementor.

Current desktop version: **0.1.17**. Requires WordPress plugin **0.4.13 or later** for Google sign-in and desktop-initiated sign-out to work (0.4.31 is the paired, live release). Plugin 0.4.26+ additionally required for the account dropdown to show the signed-in user's email (degrades gracefully to just the display name against older plugin versions).

The app checks for updates on launch via `@tauri-apps/plugin-updater` (see `UpdateBanner.tsx`), against a WordPress-hosted proxy in front of GitHub Releases — see the plugin README's "In-app updates" section for the full path. **Verified working end-to-end** on 2026-08-02: an installed 0.1.8 client detected the published 0.1.9 GitHub Release, downloaded it, installed it, and relaunched successfully.

The temporary sync diagnostics console is no longer shown on top of the app by default — open it from the "Sync log" link in the top nav, which opens it in its own window/tab instead.

An optional "Virtual Pet" (an animated cat) wanders the Dashboard, idles, climbs onto/off section cards, and can be dragged and dropped. Code lives in `src/cat/` (`catEngine.ts` pure state machine, `Cat.tsx` React wiring, `sprites/KawaiiCat.tsx` the pure-SVG sprite) — ported from the standalone [`linkflow-cat-companion`](https://github.com/vincentrathbone-web/linkflow-cat-companion) prototype, which keeps the full development history if a similar rendering bug needs chasing again. Two toggles, same state: a quick switch at the top of the Theme dropdown, and one in Settings → Workspace Preferences (per-device `localStorage`, defaults on, not synced to the cloud workspace).

The REST contract this client uses dates to plugin 0.4.5, so an existing 0.4.5-0.4.8 site will still respond correctly. Do not deploy one, though: every package before 0.4.9 has a known install or activation defect on Linux hosts.

A To-Do List panel (`TodoPanel.tsx`, `AddTaskModal.tsx`) and a Timesheet panel (`TimesheetPanel.tsx`) flank the Dashboard on `lg:` screens and up, both draggable between the left/right columns and height-resizable (never width) via `src/components/widgets/WidgetGrid.tsx`/`WidgetShell.tsx`, snapped to a 24px row grid (`gridConstants.ts`) so a resize/reposition can never overlap the other widget or clip the center Dashboard content — the center block is a separate flex sibling `WidgetGrid` never touches internally. The drag mechanics mirror the *technique* SortBoard already uses (pointer-event snapshot-at-pickup, velocity tilt, WAAPI landing tween) as a fresh implementation, not a shared-hook refactor of that component. Both panels are per-user, cloud-synced (`todos`/`timesheet`/`panelLayout` fields on the workspace document, `src/types.ts`), single-user only (no assignment/sharing), and follow the app's existing token-only color system (no hardcoded hex). The timesheet's live-ticking timer is local component state only — it never touches the synced `TimesheetState`, so it doesn't trigger a cloud save every second, only Start/Stop events do. Weekly hours target is editable in Settings → Workspace Preferences.

The timesheet also: prompts for what was worked on right after Stop (`LogActivityModal.tsx`, optional `TimesheetSession.activity` field, skippable — the session's end time is already captured before the modal opens, so it can't affect the recorded duration); supports a manual "+ Add time entry" for a forgotten Start/Stop (`ManualTimeEntryModal.tsx` — duration is always derived from the entered start/end, never typed separately); shows "Today" progress instead of "This week" (today's target derived as `weeklyTargetHours / 5`, since there's no separate daily-target setting); says "Timer Started"/"Timer Stopped" instead of "Clocked in"/"Clocked out"; and has a right-aligned "Copy" button on the "Today's sessions" line that copies the day's sessions to the clipboard as both a TSV table (Excel/Sheets) and an HTML table (email/Word) in one write. All of the above is implemented, deployed, and **confirmed working by the user as of 2026-08-19** ("It's perfect, thanks").

Two more ways to keep the Timesheet clock visible outside the main window, both desktop-only, per-device, opt-in toggles in Settings (not cloud-synced): a small always-on-top floating Play/Stop widget (`TimerWidget.tsx`, the `#timer-widget` window, draggable via a hover-revealed grip) and a system tray icon with a live tooltip, a dynamic play/stop icon rendered procedurally in Rust, and a left-click-to-toggle/right-click-menu (new in `src-tauri/src/lib.rs`, first use of Tauri's tray-icon feature and JS event `emit`/`listen` in this codebase). "Today's sessions" rows also gained hover-revealed edit/delete controls. **The timer widget/tray icon feature itself was confirmed fully working end-to-end by the user as of desktop 0.1.16** — see the 0.1.16 changelog entry below for the five real bugs found and fixed only by hands-on testing, and `HANDOVER.md` for the full writeup. Two small polish fixes landed in 0.1.17 from direct follow-up feedback: the widget's elapsed-time text was centered on its wider positioning box rather than on the Play/Stop button itself (button re-centered within the box); and the session edit/delete icons had an unwanted white-square background (removed) and were enlarged 13px → 16px.

A run-once **"What's New" coach-mark tour** (`WhatsNewTour.tsx`, new in 0.1.17) points a real speech-bubble tooltip at the actual live control for a newly shipped feature (a dimmed spotlight around it, found and tracked via `getBoundingClientRect()`, not a static screenshot), instead of a plain changelog modal. Generic and content-agnostic — a `TourStep[]` array in `App.tsx` (`whatsNewSteps`) drives it; content for the timer-widget/tray/session-edit-delete batch above is the first use, including two steps that open the Settings modal itself and point at the actual toggle switches inside it (the tray icon/floating widget have no on-screen element of their own to point at, so Settings' toggle is the next best real anchor) — the tour's own click-blocking overlay keeps the modal from being dismissed independently mid-tour, and only the last of the two toggle steps closes it again on exit. Gated per-account in `localStorage` (`linkflow_whatsnew_seen_version`), mirroring the existing onboarding-wizard gate exactly, and shown only to an account that's already past onboarding — a brand-new account gets the tour marked seen automatically when onboarding completes, since it already has these features from day one. **Not yet visually verified in a running app** — implementation checked only via `npm run lint` and both Vite build modes so far, plus a real signed `tauri build`. See `HANDOVER.md` for the full design writeup.

**Status (2026-08-19): desktop 0.1.17 built, signed, and published as a GitHub Release; plugin 0.4.31 (version-only, no PHP change) deployed to `controll.co.za`.** Desktop confirmed live via the update proxy after publishing: `current_version=0.1.16` → 200 with a valid signed manifest; `current_version=0.1.17` → 204. Plugin confirmed post-deploy: `wp plugin list` shows `active 0.4.31`; `linkflow_dashboard_db_version` still `1`; the three `linkflow_*` tables unchanged; `GET /workspace` still 401s unauthenticated (route alive) — zero schema drift, as expected for a version-only bump. 0.1.16's own feature batch (timer widget, tray icon, session edit/delete) was already fully confirmed end-to-end by hand before this release — see the 0.1.16 changelog entry below. **0.1.17's own new content (the What's New tour and the two polish fixes) has been published but not yet hands-on verified in a running app** — no browser/screenshot tool was available in this session to watch it run; worth a real look next time the app is open.

## Development

Prerequisites: Node.js, Rust, Microsoft C++ Build Tools, and Microsoft Edge WebView2 Runtime. WebView2 is already included with current Windows/Edge installations.

```powershell
npm install
npm run tauri:dev
```

`npm run dev` continues to run the browser-only Vite interface. `npm run build` produces WordPress-plugin assets; `npm run build:desktop` produces the desktop web bundle. These outputs are intentionally separate.

## Sign in

At first launch, enter the HTTPS WordPress address and your usual WordPress username/email and password. The LinkFlow plugin exchanges this once for a LinkFlow-only, per-device bearer token.

The WordPress password is never stored. The device token is kept in Windows Credential Manager, and the plugin stores only its one-way hash. It can be revoked without changing the user's WordPress password. LinkFlow uses it only for the authenticated `/wp-json/linkflow/v1/` endpoints, which store each user's workspace separately.

## Cloud synchronization

Every workspace change updates the local cache immediately. After an 800 ms debounce, the app sends an authenticated `POST` request to `/wp-json/linkflow/v1/workspace`. The request includes the current cloud version so the server can reject stale writes instead of overwriting a newer device's data.

Version 0.1.2 contains a temporary on-screen synchronization console that remains visible during session restoration, sign-in, initial cloud loading, and normal use. It persists up to 500 events in local storage and provides Copy log and Clear controls. It records the complete redacted workspace payload, stable fingerprints, cache writes, debounce lifecycle, request IDs, endpoint/method, authentication mechanism, response status/headers/body, and server diagnostics. It never records a usable password, device token, authorization value, or nonce.

The current downward path performs a cache-busted `GET /workspace` during initialization. Continuous polling or a server-push transport is not active yet; the diagnostic console states this explicitly so the next synchronization implementation can be based on observed server behavior.

The app does not rely on the WordPress page, Elementor, browser cookies, or a continuously running local server.

## Windows release

```powershell
npm run tauri:build
```

For the MSVC x64 build used by this project, Tauri places the installers under `src-tauri\target\x86_64-pc-windows-msvc\release\bundle\`. The WordPress plugin must be installed and current on the chosen site before a desktop user signs in.

## Version history

This is the canonical desktop changelog. The WordPress plugin keeps its own in
[`wordpress-plugin/linkflow-dashboard/README.md`](../wordpress-plugin/linkflow-dashboard/README.md).

### Version 0.1.17 (2026-08-19, with plugin 0.4.31)

- Added a run-once "What's New" coach-mark tour (`WhatsNewTour.tsx`): a dimmed spotlight plus a speech-bubble tooltip pointing at the real, live control for a newly shipped feature, rather than a static screenshot or a plain changelog modal. Content for this release (`whatsNewSteps` in `App.tsx`) covers the 0.1.16 batch: two steps that open the Settings modal itself and point at the actual Floating Timer Widget / Tray Icon Timer toggles inside it, and one pointing at the Timesheet panel explaining hover-to-edit/delete on a session. Shown once per account, gated the same way the onboarding wizard already is (`localStorage`, per-account key) — a brand-new account is marked as having seen it automatically when onboarding finishes, since it already has these features from day one.
- Two small fixes to the 0.1.16 batch, found from direct follow-up testing: the floating widget's elapsed-time text was centered on its (deliberately widened, to avoid clipping the drag grip) positioning box rather than on the Play/Stop button itself, since the button was anchored to that box's left edge instead of centered within it — fixed by centering the button horizontally in the box instead. Separately, the session-row edit/delete icons had a `bg-surface` white-square background — left over from when it needed to cover the duration text underneath, but redundant since that text already fades out on the same hover — removed, and both icons enlarged 13px → 16px.
- Plugin bumped to 0.4.31 alongside this release for pairing purposes only — no PHP/server change, this batch is entirely frontend/Rust.
- Built and signed via `tauri build --target x86_64-pc-windows-msvc`, published as GitHub Release `v0.1.17`; the WordPress plugin was packaged via `package.ps1` and deployed via `wp plugin install <zip> --force` over SSH. Confirmed live end-to-end via the update proxy (`current_version=0.1.16` → 200 with a valid signed manifest; `current_version=0.1.17` → 204) and, on the plugin side, `wp plugin list` (`active 0.4.31`), unchanged DB version/tables, and a still-401ing `GET /workspace`. **The new tour itself has not yet been visually verified in a running app** — no browser/screenshot tool was available in this session; worth a real hands-on look.

### Version 0.1.16 (2026-08-19, with plugin 0.4.30)

- Added a floating always-on-top timer widget (`TimerWidget.tsx`, `#timer-widget` window) and a system tray icon, both independent opt-in Settings toggles for keeping the Timesheet clock visible outside the main window. Added hover-revealed edit/delete controls to "Today's sessions" rows.
- Five real bugs were found and fixed only by running each build by hand across 0.1.12–0.1.16, none of them catchable by `tsc` or a successful build:
  - The whole widget window was one big drag region at first, so a click near the Stop button's edge could accidentally start a drag instead of registering as a click, stopping the clock unintentionally. Fixed by moving dragging to a small separate grip, revealed only on hover, away from the button's hit area.
  - The tray showed the static app icon instead of the running/stopped state. Fixed by rendering the icon procedurally as raw RGBA in Rust (`tray_icon_image()`) instead of loading a fixed PNG asset — trivially supports any number of states with no new image files.
  - Tray left-click both toggled the clock and opened the context menu (Windows' tray default). Fixed with `.show_menu_on_left_click(false)` on `TrayIconBuilder`.
  - The drag grip's negative-offset positioning got clipped by its parent's bounds. Fixed by sizing the parent box to fully contain both the button and the grip using only non-negative offsets.
  - **Dragging still silently did nothing even after the clipping fix and after adding the `core:window:allow-start-dragging` capability permission.** Root cause: Tauri's drag detection only starts a drag on a *bare* `data-tauri-drag-region` element when the raw click's `event.composedPath()[0]` is that exact element — but the grip's visible content was a child `<svg>` icon, so every click's real target was the icon, and the check never matched, with no error anywhere. Fixed by using `data-tauri-drag-region="deep"` instead, which matches a click anywhere in the element's subtree. See the Lessons learned section below.
- Published across six iterations (0.1.12 → 0.1.16), each following the full build → sign → GitHub Release → clear WordPress release-cache transient → verify-via-curl → user-tests cycle.

### Version 0.1.11 (2026-08-18, with plugin 0.4.29)

- Added the To-Do List and Timesheet Dashboard side panels: grouped/prioritized tasks; a start/stop clock with a "Today" progress bar, manual time entry, and a "what did you work on?" prompt on Stop; a right-aligned Copy button that exports the day's sessions as a table (both TSV and HTML) for pasting into Excel/email. Both panels are draggable between columns and height-resizable, snapped to a grid so they can never overlap each other or the center Dashboard content — a fresh implementation mirroring the drag technique already used by the link-sort kanban board. All per-user and cloud-synced (`todos`/`timesheet`/`panelLayout` fields on the workspace document); no new DB table on the plugin side.
- Confirmed live end-to-end via the update proxy after publishing: `current_version=0.1.10` → 200 with a valid signed manifest; `current_version=0.1.11` → 204; download endpoint streams the real installer.
- Built and signed on a workstation where `rustup`'s shim directory (`~/.cargo/bin`) had gone missing despite the toolchains themselves being intact — worked around by pointing `PATH` straight at the MSVC toolchain's own `bin/` directory rather than relying on the `rustup`/`cargo` shims. Also hit (and documented in `HANDOVER.md`) that `tauri build`'s auto-signing step reads `TAURI_SIGNING_PRIVATE_KEY`, not `TAURI_SIGNING_PRIVATE_KEY_PATH` (which is only for the separate `tauri signer sign` CLI) — a build can fully succeed and still fail at the last step with a confusing "public key found, but no private key" error if only the `_PATH` variant is set.

### Version 0.1.10 (2026-08-02, with plugin 0.4.19)

- Added an optional "Virtual Pet" (an animated cat) that wanders the Dashboard, idles, climbs onto/off any section card, and can be picked up and dropped by the user. Ported into `src/cat/` from the standalone [`linkflow-cat-companion`](https://github.com/vincentrathbone-web/linkflow-cat-companion) prototype: `catEngine.ts`/`Cat.tsx`/`sprites/KawaiiCat.tsx` copied verbatim per that project's own integration notes; `cat-anim-*` keyframes merged into `index.css`; `DashboardView.tsx`'s section cards marked `data-cat-perch`/`data-cat-perch-id`. Two toggles, same underlying per-device `localStorage` state (default on — not synced to the cloud workspace, same pattern as the Daily Inspiration bubble's mode): a quick switch at the top of the Theme dropdown, and the original one in Settings → Workspace Preferences.
- Version-only release otherwise, cut specifically to publish this feature via the (now-verified) in-app updater.

### Version 0.1.9 (2026-08-02, with plugin 0.4.19)

- Version-only bump, no functional change, created specifically to have a "newer" release to test the in-app updater against a running 0.1.8 client. Confirmed the whole chain works: an installed 0.1.8 client saw the update banner, downloaded this release from the WordPress GitHub-release proxy, verified its minisign signature, installed it, and relaunched as 0.1.9.
- This required rotating the updater's signing keypair first: the original key (used to configure `tauri.conf.json`'s `pubkey` at 0.1.7/0.1.8 time) had an unrecoverable password with no record kept anywhere, so a fresh keypair was generated and the embedded pubkey updated to match. No release had shipped signed with the old key, so this had no user-facing impact.
- Uncovered a real gotcha in the update proxy: `LinkFlow_Updates` caches the GitHub API's latest-release lookup in a 30-minute WordPress transient. Publishing a new GitHub Release does not invalidate it — the proxy will keep serving the previous release's data (or a stale "already current" 204) until the transient expires or is manually cleared (`wp transient delete linkflow_latest_github_release`). Worth remembering for every future release.

### Version 0.1.8 (2026-08-02, with plugin 0.4.18+)

- Added a Dashboard "Sort" mode: a "Sort" link next to "+ Add Link" in each section header opens the same `SortBoard` used during onboarding/bulk-import, pre-populated with the section's current links, so links can be re-sorted or moved between sections at any time (not just on first run). Sections/columns themselves are now drag-and-drop reorderable too, using the same overlay/snapshot/velocity-tilt/WAAPI-landing technique as link cards, with the "Unsorted" bucket pinned first. `SortBoard`'s completion callback grew an optional third argument (ordered section ids); existing callers are unaffected.
- The in-app updater (`UpdateBanner.tsx`, `@tauri-apps/plugin-updater`) and the WordPress-hosted GitHub release proxy landed earlier (see plugin README) but are still awaiting a signed release asset for a full live test — this build itself was produced without the updater signing key set, so it has no `.sig` counterpart yet.

### Version 0.1.7 (2026-08-01, with plugin 0.4.18)

- Fixed "Export Workspace JSON" doing nothing on desktop. The `<a download>` click on a `data:` URI approach (Settings modal) works in a real browser but is unreliable inside the Tauri/WebView2 shell — WebView2 does not consistently surface a save dialog for a programmatic `data:` download. Desktop now uses a native "Save As" dialog (`@tauri-apps/plugin-dialog`) followed by a new `write_text_file` Rust command that writes the chosen path directly, sidestepping the WebView2 download path entirely. The hosted web app is unaffected and keeps the original browser-download approach.

### Version 0.1.6 (2026-08-01, with plugin 0.4.18)

- Added an optional "Daily Inspiration" bubble on the Dashboard, top-right of the header, showing a daily motivational quote or Bible verse. Click to cycle Quote → Verse → Off (persisted per device in `localStorage`). Always renders something — loading, "unavailable — click to switch," or the real text — never disappears silently, so the mode toggle stays reachable even when a fetch fails.
- Data comes from the new `GET /daily-inspiration` endpoint on the WordPress plugin (ZenQuotes for quotes; the official YouVersion Verse of the Day, or a keyless `bible-api.com` fallback, for verses) — see the plugin README for the server side. The client never calls either third-party API directly.
- Visual styling matches the section cards exactly: the same nested `glass-card` + inner `bg-surface/50` layering (not just the same opacity value — the section's compounded two-layer transparency has to be reproduced structurally, a single flat layer looks visibly lighter even at an identical computed color). Width grows up to `50vw` and text wraps fully, unclamped, since real verse text runs much longer than a typical quote.
- Full color/font tokenization pass: removed the last hardcoded `font-sans`/`text-slate-*`/`dark:*` Tailwind classes (found on the app's root wrapper div in `App.tsx`, left over from before theming was tokenized), which was overriding the intended `var(--font-body)` cascade via CSS inheritance for every element without its own more specific font rule — the actual root cause of a light-mode text-contrast bug and heading-font leaking onto nav tabs, buttons, and link tile names.
- Fixed the underlying Tailwind v4 issue that caused the contrast bug in the first place: `dark:` defaults to `prefers-color-scheme` (an OS/media-query signal), not this app's own `.dark` class toggle. Added `@custom-variant dark (&:where(.dark, .dark *));` in `index.css`.
- Added font pairs (heading font + a separate body font for links/buttons/secondary text, each independently themeable, loaded live from Google Fonts) and a curated accent-color preset grid, both sourced from established references (Radix Colors for accents; Google Fonts pairing conventions, including funkier options like Bricolage Grotesque and Cherry Bomb One) rather than picked arbitrarily.
- Re-added access to the bulk-import wizard after first use — previously it only ever appeared once during onboarding with no way back in. Now available any time from **+Add → Bulk Import Links**.

### Version 0.1.5 (2026-08-01, with plugin 0.4.17)

- Removed the always-visible sync diagnostics console from the main app view (both hosted web and desktop) — it had become intrusive during normal use. It's still fully available, just moved out of the way: a "Sync log" link in the top nav (next to Dashboard/Collections/Archive) opens it in its own window.
- On desktop this uses a real second native window (`@tauri-apps/api/webviewWindow`, requiring the new `core:webview:allow-create-webview-window` capability); on the hosted web app it opens a new browser tab via `window.open`. Both point at the same app bundle with `#diagnostics` in the URL, which `main.tsx` detects to render only the diagnostics panel instead of the full app.
- The diagnostics log already persisted to `localStorage`; it now also listens for the browser's `storage` event so the separate window updates live while the main window keeps generating events, instead of only showing a snapshot from when it was opened.

### Version 0.1.4 (2026-08-01, with plugin 0.4.16)

- Added a first-run onboarding wizard shown once per account when a signed-in user's workspace is genuinely empty: a bulk-paste screen (accepts raw URLs, `Name - URL`, `Name: URL`, or bare domains, one per line) followed by a drag-and-drop board for sorting the pasted links into sections. Tracked per-account via `linkflow_onboarding_done` in local storage so it never reshows after completion, even if the user later empties their workspace again.
- The sort board's drag interaction is a direct port of the Projects register's proven technique from another Controll app: an absolutely-positioned overlay card (never the list item itself) driven by raw Pointer Events, one layout snapshot taken at pickup (never re-measured mid-drag), velocity-derived tilt, and a Web Animations API tween landing (`cubic-bezier(.25,.7,.2,1)`). No new dependency required — Motion/Framer Motion was not needed for this.
- Added "Sign in with Google" to the desktop sign-in screen, alongside the existing email/password form. Opens the system browser (Google blocks OAuth inside embedded webviews), authenticates via `/desktop/google/start` and `/desktop/google/callback` on the WordPress plugin, and hands the resulting device token back to the app through a registered `linkflow://` custom URL scheme. Uses the `tauri-plugin-deep-link`, `tauri-plugin-opener`, and `tauri-plugin-single-instance` plugins.
- Added a working "Sign out" to the user menu (the avatar in the top-right was previously a static, non-functional placeholder image). Revokes the device token server-side via `DELETE /desktop/session` and clears the saved Windows Credential Manager entry.
- Fixed a cross-account local-cache leak: `localStorage` was not scoped per account, so signing in as a different account (e.g. a Google account with a different email) inherited the previous account's cached demo/seed links. New accounts now default to a genuinely empty workspace instead of the built-in mock data, and a cache-ownership check clears local state when the signed-in account changes.
- Switching the desktop installer to `installMode: perMachine` (needed for reliable `linkflow://` protocol registration) means the installer now requires admin elevation; a silent `/S` install run from a non-elevated shell fails without any visible error. Install manually (double-click, approve UAC) when automating from a non-elevated context.

### Version 0.1.3 (2026-08-01, with plugin 0.4.12)

- Fixed device credentials never persisting across launches: `keyring` was missing the `windows-native` Cargo feature, so it silently fell back to an in-memory mock credential store on Windows instead of Windows Credential Manager. Every relaunch required a fresh sign-in. Verified fixed with an isolated two-process test and a real relaunch showing "Saved desktop session restored" with no sign-in prompt.
- The machine's default Rust toolchain was found set to `stable-x86_64-pc-windows-gnu` instead of MSVC; switched the default to MSVC so an unqualified `cargo`/`tauri` invocation cannot silently build against the wrong toolchain.

### Version 0.1.2 (2026-08-01, with plugin 0.4.5)

- Added the temporary persistent on-screen synchronization console.
- Added end-to-end request IDs, redacted request/response logging, workspace fingerprints, and local-cache/debounce tracing.
- Added `cache: no-store` and a timestamp query value to workspace GET requests so intermediary caching cannot hide the current server response.

### Version 0.1.1 (2026-08-01, with plugin 0.4.4)

- Uses `POST` for workspace writes.
- Uses the hosting-safe `X-LinkFlow-Token` header.
- Verifies a newly issued token against `/me` before opening the workspace.
- Stores device credentials in Windows Credential Manager.
- Reports the HTTP status and API error code when a cloud save fails.

### Version 0.1.0 (2026-08-01)

- Initial Tauri shell, cloud login, Windows Credential Manager storage, and production installers.

## Lessons learned

- A direct `cargo build --release` does not replace `tauri build`; use Tauri's packager to embed the production frontend.
- Force the `x86_64-pc-windows-msvc` target on this machine because an older GNU toolchain can otherwise be selected from the inherited PATH.
- Treat a successful device-session exchange and a successful workspace write as separate checks.
- Verify the real HTTP method and server response before adding background synchronization behavior.
- Generic sync errors are insufficient. Client and server evidence must share a request ID and show the authenticated user, expected version, database version, and affected rows.
- Diagnostic logging must remain useful without leaking reusable passwords, tokens, authorization headers, or nonces.
- A cross-platform credential crate can compile and run without error while silently using a non-persistent fallback backend. `keyring` requires an explicit platform feature (`windows-native` on Windows) or it uses an in-memory mock; verify persistence with a real two-process test, not just that the API calls succeed.
- This workstation's default Rust toolchain can drift to GNU even when an MSVC toolchain is also installed; check `rustup show` rather than assuming the last `tauri build --target ...` invocation set the default going forward.
- `rustup`'s own shim directory (`~/.cargo/bin`, containing the `cargo`/`rustc`/`rustup` proxy executables) can go missing from a workstation even while the actual toolchains under `~/.rustup/toolchains/` remain intact and `rustup`/`cargo` disappear from `PATH` entirely. Prepending a specific toolchain's own `bin/` directory (e.g. `~/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin`) onto `PATH` for the build command works around it and, as a side benefit, pins MSVC without relying on `--target` alone.
- `tauri build`'s bundler reads `TAURI_SIGNING_PRIVATE_KEY` (raw key content or a file path) for auto-signing release artifacts — not `TAURI_SIGNING_PRIVATE_KEY_PATH`, which only the separate `tauri signer sign` CLI subcommand accepts. Setting only `_PATH` lets the whole build (compile + bundle) succeed and then fail at the very last step with "a public key has been found, but no private key" — easy to mistake for a real signing-key problem when it's actually just the wrong env var name.
- Before concluding a forgotten signing-key password is unrecoverable and rotating the key (which breaks auto-update for every already-installed client until they manually reinstall), test a candidate password by signing a throwaway file with `tauri signer sign -f <key> -p <password> <file>` first — cheap, safe, and confirms the password (and that it's the *same* key as the embedded pubkey, by comparing the signature's key-ID prefix) without touching anything real.
- Matching a "glass" panel's visual transparency to another element requires matching its *layer structure*, not just its computed background color/opacity at one point: this app's section cards stack an outer `glass-card` (blurred, theme-opacity tint) with an inner `bg-surface/50` row on top, and the two compound. Applying only the outer class, or overriding the color with a single flat utility, reads visibly lighter than the real target even when a `getComputedStyle` check on one point shows an identical value.
- A Tailwind utility class (e.g. `font-sans`) on a DOM ancestor sets an explicit `font-family` that wins over an inherited CSS custom property from a base-layer selector like `body { font-family: var(--font-body) }`, because CSS inheritance stops at the first ancestor with its own explicit declaration. When a themed font/color isn't reaching a deeply nested element that has no conflicting class of its own, check ancestors for a leftover hardcoded utility class, not just the element itself.
- A file-download pattern that works fine in every real browser (`<a download href="data:...">`) is not guaranteed to work inside Tauri's WebView2 shell — it can silently do nothing, with no console error. For any desktop save-to-disk feature, use the dialog plugin's native save picker plus a Rust-side file write (or the fs plugin with proper scope), and keep the browser-native path only for the hosted web build.
- Save the updater's signing-key password somewhere durable (a password manager) the moment `tauri signer generate` creates it. There is no recovery path for an encrypted minisign key with a forgotten password — the only fix is generating a brand-new keypair and updating every build's embedded `pubkey`, which is harmless before any signed release ships but would strand every already-updated installation if done afterward.
- A WordPress-side release-lookup cache (here, a 30-minute transient wrapping the GitHub API call) will make a just-published release invisible to the update-check endpoint until it expires or is cleared manually. Don't mistake a stale-cache "no update available" response for a broken token or a bad release when testing right after publishing.
- A bare `data-tauri-drag-region` (no value, or `"true"`) only starts a window drag when the raw click **target** (`event.composedPath()[0]`) is that exact element — not any descendant. Wrap an icon, text, or any other child content in it and every click's real target is the child, so the check silently never matches: dragging does nothing, with no console error and no denied-permission log to point at. Use `data-tauri-drag-region="deep"` (matches any click within the subtree) for anything that isn't a genuine leaf DOM node.
- A missing Tauri window capability permission (here, `core:window:allow-start-dragging`, which is not part of `core:default` or any other default bundle) can fail completely silently in a production build — the JS-side API call just does nothing. When a Tauri window/webview API appears to have zero effect despite correct-looking code, check the window's capability file before assuming the frontend logic is wrong.
- Windows' system tray defaults to opening the context menu on a plain left-click as well as a right-click. If the tray also needs a distinct left-click action, call `.show_menu_on_left_click(false)` on `TrayIconBuilder` or the two handlers will fire together and fight each other.
- A dynamic tray/window icon (state-dependent color or glyph) doesn't need a shipped image asset per state — drawing it as raw RGBA pixels in Rust (`tauri::image::Image::new_owned`) at startup is simpler than managing and swapping between multiple PNGs.
- A hit area meant to trigger one action (e.g. dragging a window) should never overlap the hit area of an unrelated, hard-to-undo action (e.g. stopping a running timer) — even a few pixels of accidental overlap near an edge will occasionally misfire the wrong one. Give each its own clearly separated region rather than layering them and relying on precise click targeting.
