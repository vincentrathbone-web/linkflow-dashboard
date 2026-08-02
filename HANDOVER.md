# LinkFlow handover

Last updated: 2026-08-02

## Status

- WordPress plugin: **0.4.19** deployed and active on `controll.co.za` (installed via `wp plugin install ... --force --activate` over SSH; confirmed via `wp plugin list` and the live REST route list, which shows `/desktop/latest-release` and `/desktop/latest-release/download` registered with no errors). This was a packaging/docs-only bump — no schema change, no new functionality beyond what 0.4.18 already had.
- Tauri desktop app: **0.1.9**, signed and published as a GitHub Release. Includes the 0.1.8 Dashboard "Sort" mode; 0.1.9 itself is a version-only bump created to test the updater (no functional change).
- Compatible pairing: desktop **0.1.9** pairs with plugin **0.4.19**. The Daily Inspiration bubble needs plugin 0.4.18+ for live data (it degrades gracefully to "unavailable" against older plugin versions that lack the endpoint). Desktop **0.1.3 or later** requires plugin **0.4.9 or later** generally. The REST contract dates to plugin 0.4.5, so a site already running 0.4.5-0.4.8 still responds correctly, but no package before 0.4.9 should be deployed: each has a known install or activation defect on Linux hosts.
- YouVersion app key for the real Verse of the Day: registered (app "LinkFlow Dashboard", non-commercial, 2026-08-01) but **not yet confirmed entered** in Settings → LinkFlow on the live site — treat the bubble's verse mode as still possibly serving the `bible-api.com` fallback until checked.
- **GitHub repository:** the project is now uploaded — `https://github.com/vincentrathbone-web/linkflow-dashboard` (private), `origin` on `master`.
- **In-app update feature: fully verified working end-to-end**, 2026-08-02. See "In-app update feature" below for the full test record.
- **Cat companion: ported in and browser-verified, not yet released.** Code changes are committed but no new desktop version has been built/packaged for this yet — see "Cat companion" below.
- Primary client: native Windows app
- Cloud host: `https://controll.co.za`
- REST namespace: `/wp-json/linkflow/v1/`
- Access model: registered WordPress users only; all workspaces are private and user-scoped
- SSH access to the production host is configured locally as the `linkflow` alias (`~/.ssh/config`, key `~/.ssh/linkflow_ed25519`, `rs60.cphost.co.za:22000`, user `controllco`). WP-CLI is available on the server (`wp` on PATH).

## In-app update feature

Three pieces, all already coded (landed in commit `011cc12`, predating this handover's last accurate update — this file simply hadn't caught up):

1. **Desktop update check/install** — [`UpdateBanner.tsx`](linkflow-dashboard/src/components/UpdateBanner.tsx) calls `@tauri-apps/plugin-updater`'s `check()` on load; if an update is available it shows a pill banner, and clicking it calls `downloadAndInstall()` then relaunches via `@tauri-apps/plugin-process`.
2. **Updater config** — [`tauri.conf.json`](linkflow-dashboard/src-tauri/tauri.conf.json) `plugins.updater` points at `https://controll.co.za/wp-json/linkflow/v1/desktop/latest-release?current_version={{current_version}}` and carries the public minisign key.
3. **WordPress GitHub proxy** — [`class-linkflow-updates.php`](wordpress-plugin/linkflow-dashboard/includes/class-linkflow-updates.php) exposes `GET /desktop/latest-release` and `GET /desktop/latest-release/download`, both public/unauthenticated (as the Tauri updater plugin requires), but internally calls the GitHub Releases API with a token so a *private* GitHub repo's release assets are reachable. The token is configured via a **Settings → LinkFlow** wp-admin field (`linkflow_github_release_token`, a fine-grained PAT scoped to this repo with Contents: Read-only) — never sent to the client, never in a file.

**Verified working end-to-end, 2026-08-02:**

- GitHub PAT (fine-grained, Contents: Read-only, scoped to this repo) entered into Settings → LinkFlow on the live site.
- The original signing keypair's password was never recorded/known — it was generated in an earlier session with no record kept. Since no release had ever shipped signed with it, it was **reset**: old key files renamed to `*.old` (kept for reference, not used), a fresh keypair generated via `npx tauri signer generate`, its password saved by the user this time, and `tauri.conf.json`'s `pubkey` updated to match the new key (key ID `739FC1234CA5B499`).
- A signed 0.1.8 build was produced and installed as the "current" test client.
- Version bumped to 0.1.9 (no functional change) purely to have a newer release to test against, rebuilt and signed the same way, and published as a GitHub Release (`v0.1.9`) with all four assets (`-setup.exe`/`.sig`, `.msi`/`.sig`) via `gh release create`.
- Confirmed via direct `curl` against the live endpoint: `current_version=0.1.7` → `200` with a correct manifest (version, notes, pub_date, signature, download URL); `current_version=0.1.8` → `204` once current; the download endpoint streams the real installer with correct `Content-Type`/`Content-Disposition`.
- **The one snag hit:** `LinkFlow_Updates::get_latest_release()` caches the GitHub API response in a transient for 30 minutes. After publishing the 0.1.9 release, the endpoint kept returning the stale 0.1.8 result until the transient was manually cleared (`wp transient delete linkflow_latest_github_release`). Worth remembering for any future release: either wait out the cache or clear it manually — don't mistake a stale-cache 204 for the release/token being broken.
- Confirmed live in the actual desktop app: installed 0.1.8, saw the update banner appear, clicked it, and it downloaded, installed, and relaunched successfully as 0.1.9.
- **Lesson learned:** never generate a signing/encryption key without immediately saving its password somewhere durable (password manager) — losing it is unrecoverable and forces a full key rotation, which is harmless before any real release ships but would break every existing installation if it happened after signed releases were already in the wild (every old client's embedded pubkey would stop matching).
- **Lesson learned:** the release proxy's 30-minute transient cache means a freshly published GitHub release will not appear immediately; clear `linkflow_latest_github_release` (or wait) when testing a just-published release.

## Cat companion

An optional animated cat that wanders the Dashboard, idles, climbs onto/off section cards, and can be picked up and dropped by the user. Ported from a separate standalone prototype the user had already built and hardened at `../LinkFlow Cat Companion` (sibling project, own HANDOVER.md/README.md with the full development history and hard-won SVG-transform lessons) — that project's own README already specified the exact integration steps, followed here:

1. **`linkflow-dashboard/src/cat/catEngine.ts`** — pure state-machine logic (no React, no DOM writes), copied verbatim. One function, `stepCat(state, dtMs, containerWidth, perches) => nextState`, plus `resolveDrop()` for drag release and `createInitialCatState()`.
2. **`linkflow-dashboard/src/cat/Cat.tsx`** — React wiring: `requestAnimationFrame` tick loop (pauses correctly when `document.hidden`), pointer-event drag/drop, and perch measurement via `[data-cat-perch]` DOM query (re-measured every 1.5s plus scroll/resize). Copied verbatim.
3. **`linkflow-dashboard/src/cat/sprites/KawaiiCat.tsx`** — the pure-SVG sprite (grey/white kawaii cat, no image assets). Copied verbatim.
4. The `cat-anim-*` keyframes were merged into `linkflow-dashboard/src/index.css` (scoped by class prefix, no other app-wide effect).
5. `<Cat enabled={catEnabled} />` mounted once in `App.tsx`, next to `<UpdateBanner />`.
6. `DashboardView.tsx`'s section card (`motion.section` in the sections map) got `data-cat-perch="true" data-cat-perch-id={section.id}` — every real dashboard section is now a climbable surface.
7. Enable/disable state (`catEnabled`) lives in `App.tsx`, persisted to `localStorage` under `linkflow_cat_enabled` (default on). Deliberately **not** added to `ThemeConfig`/synced workspace — like the Daily Inspiration bubble's mode, this is a per-device display preference with no reason to sync across devices or bump the workspace schema.
8. User-facing label is **"Virtual Pet"**, not "Cat Companion" — that internal name stays in code (folder, component, variable names) since renaming those has no user-visible benefit, but the two on-screen toggles both say "Virtual Pet". There are two, both wired to the same `catEnabled` state: a low-key switch pinned to the very top of the Theme dropdown (`ThemeDropdown.tsx`, above Presets — added per explicit request for quick one-click access) and the original toggle in Settings → Workspace Preferences (`SettingsModal.tsx`).

**Verified 2026-08-02** (browser dev server, not yet in a packaged release):
- TypeScript lint clean.
- The sprite renders and the DOM overlay structure (`position: fixed`, `pointer-events: none` except the cat itself, `z-index: 9000`) matches the prototype exactly.
- A real dashboard section card correctly carries `data-cat-perch`/`data-cat-perch-id` and is measurable via `getBoundingClientRect()`.
- Drag entry point confirmed (`cursor: grab`, `pointerEvents: auto`, `touchAction: none` on the cat's div).
- Both toggles (Theme dropdown and Settings) correctly show/hide the cat and persist to `localStorage`; confirmed live via the actual dropdown switch (label reads "Turn virtual pet off"/"on" correctly as it flips).
- **Movement itself could not be watched live in this session** — the Browser pane wasn't actually composited/visible on the automation side, so `document.hidden` was `true` the whole time, and the app correctly paused the simulation exactly as designed (see `Cat.tsx`'s tick loop). Instead, `catEngine.ts` was dynamically imported straight from the running dev server's module graph and driven directly with the real perch rect measured from the live DOM (same methodology as the original prototype's own bug-hunting, see its `HANDOVER.md`) — confirmed it walks toward the section card, arrives at the card's true right edge (`x` snaps to `perch.left + perch.width`), and begins climbing (`y` increasing) exactly as expected.
- **Still needed:** a real visual/interactive check with the Browser pane actually visible (watch it wander/climb/drag over time with your own eyes), and a decision on whether this ships in the next desktop release or waits.

**Untracked image files in the repo root** (`Gemini_Generated_Image_2liav22liav22lia.png`, the kitten/British-shorthair/cartoon-cat-poses JPGs) are **not used by this feature** — the sprite is 100% SVG, no image assets. These look like reference/mood-board images from earlier design exploration; ask the user whether to delete them, move them to a `design/` or `reference/` folder outside `src/`, or leave them as-is (they're untracked, so they don't affect any build either way).

## Repository layout

```text
LinkFlow Dashboard/
├── linkflow-dashboard/                  React/Vite and Tauri source
│   ├── src/                             Shared React interface
│   ├── src-tauri/                       Rust/Tauri native shell
│   └── dist/                            Desktop frontend build
├── wordpress-plugin/linkflow-dashboard/ Installable plugin source
├── dist/                                Versioned WordPress plugin ZIPs
├── package.ps1                          Plugin build/package script
├── README.md
├── HANDOVER.md
└── AGENTS.md
```

## Architecture

The React code is shared between the optional WordPress page and the Windows client. Vite selects its output by build mode:

- `npm run build` writes plugin assets to `wordpress-plugin/linkflow-dashboard/build/`.
- `npm run build:desktop` writes native-client assets to `linkflow-dashboard/dist/`.
- `tauri build` embeds the desktop assets and creates Windows installers.

WordPress owns identity, device tokens, workspace persistence, sanitization, revision history, and optimistic version checks. The desktop client owns native presentation and Windows Credential Manager integration.

## Authentication flow

1. The user enters the WordPress URL, username/email, and password in the desktop client.
2. The client sends them once over HTTPS to `POST /desktop/session`.
3. The plugin authenticates with WordPress, generates a 256-bit device token, stores its SHA-256 hash, and returns the raw token once.
4. Tauri stores the raw token in Windows Credential Manager under service `za.co.controll.linkflow`.
5. Subsequent API requests use `X-LinkFlow-Token`.

The WordPress password is never retained. Tokens are per-device and revocable.

## Workspace write flow

1. React state and localStorage update immediately.
2. An 800 ms debounce consolidates rapid UI changes.
3. The client sends `POST /workspace` with the complete workspace and `X-LinkFlow-Version`.
4. WordPress authenticates the device token, validates and sanitizes the document, writes the user row, increments the version, and records a revision.
5. The client stores the returned version. The temporary diagnostic console records both successful and failed steps with a shared request ID.

The application loads cloud state at startup only; it does not poll or receive server-pushed changes, so an already-open client cannot see a server edit automatically. This is intentional, not a pending gap: the server exists as the recovery/device-switch path (see the 2026-08-01 architectural decision below), and the desktop `POST` on every change is the real synchronization contract. The diagnostic console states the startup-only pull explicitly so this isn't mistaken for continuous sync.

## Temporary synchronization diagnostics

Desktop 0.1.2 and plugin 0.4.5 added the visible diagnostic console shown during restoration, sign-in, initial loading, and normal app use; it is still present in 0.4.9. Up to 500 events persist in local storage and can be copied or cleared. Each cloud request carries `X-LinkFlow-Request-ID`, allowing the client log to match the server response. The server reports authentication state, WordPress user ID, plugin version, current/expected/new workspace versions, payload size/counts, database write mode, affected rows, revision result, and UTC timestamp. GET responses are explicitly no-cache and the desktop adds a timestamp query value.

Passwords, raw device tokens, authorization headers, nonces, and secret-like fields are redacted. This panel is intentionally temporary and should be removed or placed behind an explicit support mode after synchronization is verified.

## Build commands

Frontend validation:

```powershell
cd linkflow-dashboard
npm install
npm run lint
npm run build:desktop
```

WordPress package:

```powershell
cd ..
.\package.ps1
```

The packager reads `wordpress-plugin/linkflow-dashboard/package.json`, bumps the patch version unless `-NoBump` is supplied, and validates every ZIP entry. Upload `dist/linkflow-dashboard-vX.Y.Z.zip` to WordPress. The filename must carry the version, but the archive itself must contain the unversioned `linkflow-dashboard/` root.

Windows production package on this machine:

```powershell
npx tauri build --target x86_64-pc-windows-msvc
```

The expected installer directory is:

```text
linkflow-dashboard/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/
```

Rust, Visual Studio 2022 Build Tools, Windows 11 SDK, and Edge WebView2 are installed. The build environment must prefer the MSVC Rust toolchain; an older GNU toolchain is also present and previously caused `dlltool.exe` failures.

## Deployment order

1. Update and activate the matching WordPress plugin ZIP.
2. Clear WordPress/Cloudflare caches if hosted assets changed.
3. Install or launch the matching Tauri build.
4. Sign in and verify `/me`, initial workspace load, and a POST save.
5. Reload the hosted page or another client to confirm the saved version.

## Version history

Each component owns its changelog; this file no longer restates them:

- WordPress plugin: [`wordpress-plugin/linkflow-dashboard/README.md`](./wordpress-plugin/linkflow-dashboard/README.md)
- Windows desktop client: [`linkflow-dashboard/README.md`](./linkflow-dashboard/README.md)

Both record release dates, and each notes the paired release of the other component. The currently
supported pairing is in Status above.

## Architectural decisions

### 2026-08-02

- Uploaded the project to GitHub (`vincentrathbone-web/linkflow-dashboard`, private) as the source of truth for releases, and built the in-app updater on top of it: the desktop client uses `@tauri-apps/plugin-updater` against a WordPress-hosted proxy endpoint rather than pointing at GitHub directly, specifically because the repo is private and Tauri's updater plugin has no way to authenticate its own request. The WordPress plugin holds the one GitHub token server-side and re-exposes two plain unauthenticated endpoints shaped exactly the way the updater plugin expects; the token never reaches the client. This establishes the pattern for any future "check GitHub for the latest release" need from the desktop app.
- Added a Dashboard "Sort" mode (desktop 0.1.8) reusing the onboarding wizard's `SortBoard` component for ordinary day-to-day re-sorting, not just first-run setup — including making section/column order itself draggable, which onboarding never needed. `SortBoard`'s callback signature grew a third (ordered section ids) argument; existing callers are backward compatible since they simply don't read it.

### 2026-08-01

- Clarified the intended synchronization model: the desktop app is the primary, authoritative client, and its 800 ms-debounced `POST /workspace` on every change is the real-time path — that write must always succeed promptly, it is not best-effort. The server's role is recovery/device-switch: if a user moves to another device or the hosted web page, they should see the last-saved state, not start over. A single startup `GET` satisfies that role; continuous downward polling or push is explicitly *not* required and should not be added unless a concrete need for true multi-device concurrent editing emerges.
- Confirmed no background-service architecture (a la the `rust-tauri-windows-service` pattern) is needed for this product: LinkFlow only needs to do work while its window is open, so a plain Tauri app is correct. Revisit only if up/down sync requirements change to need continuous background work independent of the GUI.
- Added the Daily Inspiration bubble (optional daily quote/Bible verse on the Dashboard). Established the pattern for any future third-party content integration: the WordPress plugin fetches server-side and caches per day in a transient (`GET /daily-inspiration?type=quote|verse`); the client never calls a third-party API or holds an API key. Sources were deliberately scoped to what requires no developer sign-in (ZenQuotes, `bible-api.com`) as the baseline, with the official YouVersion Verse of the Day as an optional upgrade gated by a free non-commercial app key.
- The YouVersion app key is stored as a WordPress option, configured via a new **Settings → LinkFlow** wp-admin page (`LinkFlow_Settings`), not a `wp-config.php` constant. Decided this way specifically so the site owner can rotate/set it through the ordinary WordPress admin UI without SSH access or a code deploy — the plugin had no admin-facing settings screen before this.
- Completed a full color/font tokenization pass across the frontend (see the desktop README's 0.1.6 changelog entry for the root-cause bug this closed out) and added curated font-pair and accent-color presets, both sourced from established references rather than picked arbitrarily, matching the target audience.
- Fixed "Export Workspace JSON" being silently broken on desktop (0.1.7): the `<a download href="data:...">` pattern works in real browsers but not reliably in Tauri/WebView2. Added `tauri-plugin-dialog` for a native Save As picker plus a small Rust `write_text_file` command, used only on the desktop code path (`isDesktopApp()`); the hosted web app is untouched. This establishes the pattern for any future desktop file-save feature: don't rely on browser download tricks inside the Tauri shell.

### 2026-07-31

- The primary architecture changed to Tauri so native rendering is independent of Elementor. Plugin 0.3.3-0.3.6 were the preceding attempts to make the hosted WordPress page render correctly under Elementor; that approach was abandoned rather than completed.
- Public URLs and the Shared tab were removed; the product is private-only. `AGENTS.md` carries this as a standing boundary.

## Lessons learned

- Verify the actual network verb, endpoint, response status, and persisted server version before diagnosing client refresh behavior.
- A generic sync warning hid several distinct failures; retain status/code diagnostics.
- Shared hosts may strip `Authorization`; use the scoped `X-LinkFlow-Token` header and verify CORS preflight live.
- `wp_http_validate_url()` is for outbound server requests and is too restrictive for stored bookmarks.
- Tauri production artifacts must be built with `tauri build`; a direct Cargo executable can point at the development URL.
- On this workstation, force the MSVC target and toolchain paths to avoid inheriting the GNU Rust toolchain.
- Keep plugin and desktop versions separate, but document their compatible pairing in every release.
- A startup GET is not downward synchronization for an already-open client; document the actual refresh frequency precisely.
- Correlated evidence must cover success as well as failure. A green HTTP status without the user ID, returned version, and affected-row result is not enough.
- Verbose support logs must redact credentials at the logging boundary, before persistence or display.
- The install ZIP filename includes the release version, but no version may appear in its internal plugin root. The release contract is `linkflow-dashboard-vX.Y.Z.zip` containing `linkflow-dashboard/`.
- Validate ZIP entry paths programmatically; visual inspection of the source directory is not proof of the extracted WordPress folder name.
- WordPress packages built on Windows must use forward slashes in ZIP entry names; otherwise a Linux host can fail to extract `linkflow-dashboard/linkflow-dashboard.php` as a real plugin file.
- Do not use the plugin package version as the database migration marker: package-only releases would force unnecessary `dbDelta()` work and can make activation/upgrades appear to stall on a shared host.
- A cross-platform credential crate (`keyring`) can compile and run with zero errors while silently using an in-memory, non-persistent mock backend; it requires an explicit platform feature (`windows-native`) to reach the real OS credential store. Verify with an actual two-process persistence test, not just that the save/load calls succeed.
- This workstation's default Rust toolchain can silently be GNU even with an MSVC toolchain also installed (`rustup show`); an unqualified `cargo`/`tauri` command then builds against the wrong one. Set the default explicitly rather than relying on the `--target` flag alone.
- A validated packaging script (backslash/root/main-file checks) only prevents *future* bad installs; it cannot repair one already deployed. When a live activation fails, inspect the actual files on the server before assuming the packager regressed.
- `wp_add_inline_script()` is not reliable for a script registered with `type="module"` on all WordPress core versions in use in production — the module `<script>` tag can print while its attached inline content is silently dropped, with no error anywhere. Prefer printing required runtime config (like `window.linkflowConfig`) as a plain classic inline `<script>` in the shortcode's own HTML output.
- A page rendering without visible errors is not proof its cloud configuration succeeded — check the diagnostics panel's `cloudBackendPresentAtMount` value specifically, since a page can mount and run entirely on local cache while never talking to the server.
- When adding any third-party content feed (quotes, verses, etc.), fetch it server-side and cache it, never call it directly from the client: avoids CORS gaps on the provider's free tier, keeps API keys off the client bundle, and gives one place to add a fallback source.
- A UI element that renders nothing when its data is unavailable also removes any way to reach its own settings/toggle control if that control only exists inside the "has data" render branch. Always keep a stable, always-rendered affordance (even a small "unavailable" state) rather than conditionally rendering the entire component away.
- A file-download pattern that works in every real browser (`<a download href="data:...">`) can silently fail inside Tauri's WebView2 shell with no console error at all. Any desktop save-to-disk feature needs a native path (dialog plugin + a Rust-side write, or the fs plugin with proper scope) rather than reusing the browser's download trick.

## Next checks

- Set the YouVersion app key under **Settings → LinkFlow** in wp-admin (app "LinkFlow Dashboard", registered 2026-08-01, non-commercial) so the Daily Inspiration bubble's verse mode uses the real YouVersion Verse of the Day instead of the `bible-api.com` fallback — status unconfirmed, re-check live.
- Add a user-facing device-management screen for listing and revoking desktop tokens (`GET/DELETE /desktop/devices` already exist server-side; no UI consumes them yet).
- Consider whether the temporary `SyncDiagnosticsPanel` can now be hidden behind a support-mode flag rather than always-visible, now that the write path, credential persistence, and hosted-page configuration bugs are all resolved and verified live.
- No further sync-architecture work is currently planned; see the 2026-08-01 architectural decision above for why continuous polling is intentionally out of scope.
- The in-app update feature is now fully verified end-to-end (see above) — no further work needed there unless a real feature release surfaces a new issue. Remember the 30-minute release-transient cache when testing future releases.
- Cat companion is ported and browser-verified (see "Cat companion" above) but not yet watched live with the Browser pane actually visible, and not yet part of a packaged desktop release — decide whether to cut a new version for it or bundle it with the next release.
