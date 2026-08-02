# LinkFlow desktop client

LinkFlow is a private, Windows desktop link workspace. Its React interface is packaged with Tauri and connects directly to the LinkFlow WordPress plugin API; it never renders the WordPress theme or Elementor.

Current desktop version: **0.1.8**. Requires WordPress plugin **0.4.13 or later** for Google sign-in and desktop-initiated sign-out to work (0.4.18+ is the paired release; see `HANDOVER.md` for the exact live version).

The app checks for updates on launch via `@tauri-apps/plugin-updater` (see `UpdateBanner.tsx`), against a WordPress-hosted proxy in front of GitHub Releases — see the plugin README's "In-app updates" section for the full path and current verification status.

The temporary sync diagnostics console is no longer shown on top of the app by default — open it from the "Sync log" link in the top nav, which opens it in its own window/tab instead.

The REST contract this client uses dates to plugin 0.4.5, so an existing 0.4.5-0.4.8 site will still respond correctly. Do not deploy one, though: every package before 0.4.9 has a known install or activation defect on Linux hosts.

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
- Matching a "glass" panel's visual transparency to another element requires matching its *layer structure*, not just its computed background color/opacity at one point: this app's section cards stack an outer `glass-card` (blurred, theme-opacity tint) with an inner `bg-surface/50` row on top, and the two compound. Applying only the outer class, or overriding the color with a single flat utility, reads visibly lighter than the real target even when a `getComputedStyle` check on one point shows an identical value.
- A Tailwind utility class (e.g. `font-sans`) on a DOM ancestor sets an explicit `font-family` that wins over an inherited CSS custom property from a base-layer selector like `body { font-family: var(--font-body) }`, because CSS inheritance stops at the first ancestor with its own explicit declaration. When a themed font/color isn't reaching a deeply nested element that has no conflicting class of its own, check ancestors for a leftover hardcoded utility class, not just the element itself.
- A file-download pattern that works fine in every real browser (`<a download href="data:...">`) is not guaranteed to work inside Tauri's WebView2 shell — it can silently do nothing, with no console error. For any desktop save-to-disk feature, use the dialog plugin's native save picker plus a Rust-side file write (or the fs plugin with proper scope), and keep the browser-native path only for the hosted web build.
