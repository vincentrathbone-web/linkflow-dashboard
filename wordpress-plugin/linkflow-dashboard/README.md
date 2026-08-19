# LinkFlow Dashboard WordPress Plugin

Current version: **0.4.34**, live on `controll.co.za`.

LinkFlow provides a closed, authenticated cloud workspace for the hosted React interface and Windows desktop client. Each WordPress user has an isolated workspace and up to 20 recoverable revisions. There are no public or shared workspace endpoints.

## Installation

Install the packaged plugin ZIP, activate it, and optionally create a logged-in-only page containing:

```text
[linkflow_dashboard]
```

The hosted page is optional for desktop users. The Tauri client communicates directly with the REST API and does not render WordPress, the active theme, or Elementor.

## Authentication

`POST /linkflow/v1/desktop/session` exchanges a normal WordPress login for a random, per-device LinkFlow token over HTTPS. WordPress stores only the token's SHA-256 hash. The desktop client stores the raw token in Windows Credential Manager and sends it using `X-LinkFlow-Token`.

The custom header is intentional: some shared hosts strip the standard `Authorization` header before PHP receives it.

## Workspace API

- `GET /wp-json/linkflow/v1/me`
- `GET /wp-json/linkflow/v1/workspace`
- `POST /wp-json/linkflow/v1/workspace`
- `GET /wp-json/linkflow/v1/workspace/revisions`
- `POST /wp-json/linkflow/v1/workspace/revisions/{version}/restore`
- `GET /wp-json/linkflow/v1/desktop/devices`
- `DELETE /wp-json/linkflow/v1/desktop/devices/{id}`
- `GET /wp-json/linkflow/v1/daily-inspiration?type=quote|verse`

Workspace writes use optimistic concurrency through `X-LinkFlow-Version`. URLs are stored, not fetched by WordPress. Validation therefore requires well-formed HTTP/HTTPS syntax but correctly allows bookmarks targeting localhost, private networks, and custom ports. Bare domains are upgraded to HTTPS.

**Deployed 0.4.28 (2026-08-18):** the workspace document gained three optional top-level fields — `todos`, `timesheet`, and `panelLayout` (per-user to-do list, start/stop timesheet, and drag/resize layout for their two Dashboard side panels; all single-user only, no cross-account assignment or sharing). No new table, endpoint, or `LINKFLOW_DASHBOARD_DB_VERSION` bump — all three fields live inside the same `workspace` JSON blob and ride the existing version/revision machinery untouched (confirmed post-deploy: `linkflow_dashboard_db_version` option and the three `linkflow_*` tables are unchanged). `sanitize_workspace()` whitelists them: up to 500 todos (id, text ≤500 chars, `done`, optional `priority` in `low|medium|high`, optional ISO `dueDate`), up to 2000 timesheet sessions (id, ISO `start`/`end`, `durationSeconds`, plus `currentSessionStart`, `sessionStartedAt`, `pausedElapsedMs` (added 0.4.32, backing the desktop app's pause/resume timer), and `weeklyTargetHours` clamped 0-168), and up to 20 `panelLayout` widget entries (`id` in `todo`/`timesheet`, `column` in `left`/`right`, `order`, `heightUnits` clamped 6-60 — mirrors `WIDGET_MIN_ROWS`/`WIDGET_MAX_ROWS` in the frontend's `gridConstants.ts`, keep in sync). Malformed input is rejected the same way malformed sections/links are (a 400 `WP_Error`), not silently dropped; all three fields are optional at the top level so a workspace saved before this shipped still round-trips. See the version history entry below for the deploy record. **A real authenticated save/load round-trip is now confirmed working** (2026-08-19, by the user's own hands-on testing) — this surfaced one real bug (an older client's save could silently wipe these fields for a newer client on the same account), fixed in 0.4.30, see below.

**Deployed 0.4.29 (2026-08-18):** each timesheet session gained an optional `activity` field (freeform text, ≤1000 chars, `sanitize_textarea_field()`), logged via a "what did you work on?" prompt shown right after clocking out. Same optional-field, reject-don't-drop-malformed-input pattern as everything else here. (Manual time entry, the Today-vs-week progress bar, the "Timer Started/Stopped" wording, and the session-copy-to-clipboard button also shipped in 0.4.29 but are entirely frontend — nothing else changed server-side for them.) **Confirmed working by the user as of 2026-08-19.**

## Daily inspiration

`GET /daily-inspiration` returns a cached-per-day quote or Bible verse for the Dashboard bubble. It always fetches server-side (never exposes a third-party API or key to the browser) and caches the result in a WordPress transient until local midnight:

- `type=quote` → [ZenQuotes](https://zenquotes.io/) `/api/today`. No key.
- `type=verse` → the official YouVersion Verse of the Day (`/v1/verse_of_the_days/{day}` then `/v1/bibles/3034/passages/{passage_id}`, Berean Standard Bible — public domain), if an app key is set on **Settings → LinkFlow**. Falls back automatically to a curated ~60-reference list resolved against [bible-api.com](https://bible-api.com/) (no key) if no key is set or the YouVersion request fails.

The YouVersion app key is a free, non-commercial developer key from [platform.youversion.com](https://platform.youversion.com) (`LinkFlow Dashboard` app, registered 2026-08-01). It's stored in the `linkflow_youversion_app_key` WordPress option via the new Settings page — never in a file, never sent to the client.

## In-app updates

`LinkFlow_Updates` (`includes/class-linkflow-updates.php`) proxies GitHub Releases for the desktop client's `@tauri-apps/plugin-updater` check, because the source repo (`vincentrathbone-web/linkflow-dashboard`) is private and Tauri's updater plugin sends a plain unauthenticated request. Two public endpoints do the authenticated GitHub calls server-side:

- `GET /desktop/latest-release?current_version=X.Y.Z` — 204 if already current, otherwise a version/notes/platforms manifest pointing at the download endpoint, including the release's minisign signature fetched from the matching `-setup.exe.sig` asset.
- `GET /desktop/latest-release/download?asset=<name>` — streams a single release asset's bytes, authenticated with the stored token.

The GitHub token is a fine-grained PAT (Contents: Read-only, scoped to just this repo) stored in the `linkflow_github_release_token` WordPress option via **Settings → LinkFlow**, entered directly in wp-admin — never in a file, never sent to the client. The latest-release lookup is cached in a transient for 30 minutes.

For this proxy to return anything other than 204, a GitHub Release must exist with both a signed `-setup.exe` and its `-setup.exe.sig`. **Verified working end-to-end on 2026-08-02** (desktop 0.1.8 detected, downloaded, and installed the 0.1.9 GitHub Release). Note the 30-minute transient cache on the latest-release lookup: a just-published release won't be picked up until the cache expires or `wp transient delete linkflow_latest_github_release` is run.

## Packaging

Run `./package.ps1` from the workspace root. It reads the slug/version from this plugin's `package.json`, bumps the patch version, builds the Vite assets, and creates one validated versioned install archive under `dist/`: `linkflow-dashboard-vX.Y.Z.zip`. The ZIP filename carries the release version, but the only internal root remains `linkflow-dashboard/`.

## Version history

This is the canonical plugin changelog. The desktop client keeps its own in
[`linkflow-dashboard/README.md`](../../linkflow-dashboard/README.md); where a plugin release shipped
alongside a desktop release, the pairing is noted here.

### 2026-08-19 (fifth entry)

- **0.4.34:** Added `LinkFlow_Google::get_avatar_url( $user_id )` (reads a new `linkflow_google_avatar` user meta key) and an `avatarUrl` field on the account info returned from `/me`, `/desktop/session`, the Google OAuth callback's hand-off to the desktop app, and the hosted page's injected `window.linkflowConfig`. `LinkFlow_Google::callback()` now captures Google's `picture` claim (from the `openid email profile` scope's id_token, or the `oauth2/v2/userinfo` fallback) and persists it via `update_user_meta()` the moment a Google sign-in completes, so it's available on every later request — password sign-ins, session restores — not just that OAuth round-trip. Backs the desktop client's new account-avatar display (see the desktop README's 0.1.23 changelog entry). No schema change: the URL lives in user meta, not a new column. Deployed via `wp plugin install <zip> --force` over SSH; confirmed post-deploy `wp plugin list` shows `active 0.4.34`, `linkflow_dashboard_db_version` unchanged (`1`), the three `linkflow_*` tables unchanged, and `GET /workspace` still 401s unauthenticated (route alive).

### 2026-08-19 (fourth entry)

- **0.4.33:** Version-only release, no PHP/server change — packaged specifically to pair with desktop 0.1.20, which closes the `panelLayout` "missing widget" gap flagged as not-yet-done in the 0.4.30 entry below. A new `reconcilePanelLayout()` in the frontend (`App.tsx`, shared by both the plugin build and the desktop client) now self-heals any widget id present in the app's default layout but absent from a loaded `panelLayout` — whether that's a stored `{"widgets": []}` from before 0.4.30, or, going forward, any future widget added while an account's stored layout still predates it — onto its default column, instead of leaving it permanently unrendered. Symptom this fixes: upgrading to a build with new widgets and having them not appear because the account's server-stored layout (correctly preserved by 0.4.30, but never *completed*) didn't know about them yet. Deployed via `wp plugin install <zip> --force` over SSH; confirmed post-deploy `wp plugin list` shows `active 0.4.33`, `linkflow_dashboard_db_version` unchanged (`1`), the three `linkflow_*` tables unchanged, and `GET /workspace` still 401s unauthenticated (route alive) — no schema drift, as expected for a version-only bump.

### 2026-08-19 (third entry)

- **0.4.32:** `sanitize_workspace()`'s timesheet block gained two new optional fields, `sessionStartedAt` and `pausedElapsedMs`, backing the desktop app's new Play/Pause/Stop timer (a session can now be genuinely paused, not just running/stopped — see the desktop README's 0.1.18 changelog entry for the full feature). Both follow the same "a key missing from the incoming request falls back to what was previously stored, not a hardcoded default" pattern established for the 0.4.30 data-loss fix — an older desktop client that predates pausing would otherwise silently wipe a paused-but-not-yet-logged session's banked time on its very next unrelated save. No schema change: both fields live inside the existing `timesheet` JSON blob. Deployed via `wp plugin install <zip> --force` over SSH; confirmed post-deploy `wp plugin list` shows `active 0.4.32`, `linkflow_dashboard_db_version` unchanged (`1`), the three `linkflow_*` tables unchanged, and `GET /workspace` still 401s unauthenticated (route alive).

### 2026-08-19 (second entry)

- **0.4.31:** Version-only release, no PHP/server change — packaged specifically to pair with desktop 0.1.17 (the floating-widget/tray/session-edit-delete polish fixes and the new "What's New" coach-mark tour, all frontend/Rust-only). Deployed via `wp plugin install <zip> --force` over SSH; confirmed post-deploy `wp plugin list` shows `active 0.4.31`, `linkflow_dashboard_db_version` unchanged (`1`), the three `linkflow_*` tables unchanged, and `GET /workspace` still 401s unauthenticated (route alive) — no schema drift, as expected for a version-only bump.

### 2026-08-19

- **0.4.30:** Fixed a data-loss bug: `sanitize_workspace()` treated `todos`/`timesheet`/`panelLayout` missing from an incoming save as "clear it," rather than "this client predates the field, leave it alone" — so a save from an old client (desktop 0.1.10, before this feature shipped) could silently wipe a newer client's data on the same account. `save_workspace()` now reads the current stored workspace before validating the incoming one and passes it to `sanitize_workspace()` as a fallback for any of those three fields the incoming request omits; an explicitly-sent empty value is still honored as an intentional clear. No schema change. See `HANDOVER.md` for the full incident writeup and the one affected account's data repair.

### 2026-08-18

- **0.4.28:** Added `todos`, `timesheet`, and `panelLayout` as three new optional top-level fields on the workspace document, backing the new To-Do List and Timesheet Dashboard side panels (grouped/prioritized tasks; start/stop clock with weekly progress and session log; drag-to-reposition/resize layout for both panels). See the "Workspace API" section above for the field-level detail. No schema change of any kind — verified post-deploy via `wp option get linkflow_dashboard_db_version` (still `1`) and `SHOW TABLES LIKE '%linkflow%'` (still the same three tables). Deployed via `wp plugin install <zip> --force` over SSH (the `linkflow` alias) rather than the wp-admin uploader. At deploy time, the actual authenticated save/load round-trip was not yet verified — deployment was confirmed by re-running `wp plugin list` (active, 0.4.28) and a `GET /workspace` 401-without-auth sanity check, not by a signed-in user's data actually round-tripping. **Update:** this surfaced a real data-loss bug once tested by hand, fixed in 0.4.30 below.
- **0.4.29:** Added an optional `activity` field (freeform text, ≤1000 chars) to each timesheet session in `sanitize_workspace()` — the only server-side change in this release. Everything else that shipped alongside it (a manual time-entry form, the Dashboard progress bar switching from a weekly to a daily view, "Timer Started"/"Timer Stopped" status wording, and a copy-sessions-to-clipboard button) is entirely frontend, reusing the exact same `TimesheetSession` shape the server already validated — no further plugin changes needed for those. Same deploy/verification method as 0.4.28 (`wp plugin install --force` over SSH; confirmed `active 0.4.29`, DB version and tables unchanged, route still responds). At deploy time, a real authenticated round-trip with the new `activity` field populated was not yet verified, and none of the frontend-only additions had been watched running in a real browser. **Update:** all confirmed working by the user as of 2026-08-19.

### 2026-08-03

Seven back-to-back fixes for WordPress/Elementor-hosted-page-only rendering gaps (none affect the desktop client, which never loads WordPress, the theme, or Elementor), plus one small shared feature. All CSS fixes are in `css/isolation.css` unless noted; the general technique behind each is written up for reuse in other projects at [`block-elementor.md`](../../block-elementor.md), which this round of fixes also substantially expanded.

- **0.4.27:** Fixed the top nav bar rendering partly hidden behind/under the WordPress admin toolbar, a regression introduced by 0.4.26's `contain: layout` removal (see below) — `TopNavBar`'s own `fixed` positioning now correctly tracks the true viewport top (which the admin toolbar also occupies, at a higher z-index), so it needed to know the toolbar's height and offset itself below it, the same way it used to (by accident) when `contain: layout` was still forcing it to track the root's own already-admin-bar-shifted box. Added a `--host-chrome-offset` custom property (0 by default, 32px/46px when `body.admin-bar` is present, mirroring WordPress core's own breakpoints) that `TopNavBar.tsx` consumes directly (`top: var(--host-chrome-offset, 0px)`) and `App.tsx`'s `<main>` consumes as extra `padding-top`, so the existing per-view spacing under the nav is preserved rather than partly eaten by the nav's own shift.
- **0.4.26:** Three unrelated fixes shipped together:
  - Fixed font pairs only changing heading text, not body text (menu, buttons, links, the Daily Inspiration quote) — a regression from 0.4.21's font-family fix, which referenced a CSS variable (`--font-sans`) that nothing in the app ever actually sets, so the root always silently fell back to its static default regardless of the user's chosen font pair. Headings looked unaffected only because they have their own explicit `font-family: var(--font-heading)` rule that wins by being a direct declaration rather than an inherited one. Now correctly references `--font-body`, the variable `App.tsx` actually sets from the font-pair picker.
  - Fixed the Theme/Settings modals (and any other `fixed inset-0`-centered overlay) rendering up to a page-length below the fold on any page with enough dashboard content to scroll. Root cause: `contain: layout` on `#linkflow-dashboard-root` (added for Elementor isolation, and the same mechanism behind 0.4.24/0.4.25's cat-clipping saga below) makes the root the containing block for every `position: fixed` descendant, so a modal meant to center on the visible screen was instead centering against the root's full *scrollable* height. Fixed by dropping `layout` from `contain` (now just `contain: style`) — which also made the entire 0.4.24/0.4.25 admin-bar/`min-h-screen`/cascade-layer workaround for the cat unnecessary, since `position: fixed` descendants now simply track the true viewport again like normal, with no admin-bar compensation CSS needed at all. That whole workaround was removed from `css/isolation.css` in this version.
  - Added the signed-in user's email address under their display name in the account dropdown (lighter, smaller text), so a display name shared by more than one WordPress account (e.g. duplicate test accounts) can still be told apart at a glance. `/me`, `desktop/session`, the Google OAuth callback, and the hosted-page's injected `window.linkflowConfig.user` all now include `email` alongside `id`/`displayName`.
- **0.4.25:** Fixed the Cat companion ("Virtual Pet") being clipped at the bottom of the viewport whenever the WordPress admin toolbar is showing, by adding a `@layer`-based override for Tailwind's `min-h-screen` utility (see 0.4.26 above for why this entire approach was later replaced with a much simpler fix — dropping `layout` from `contain` — once the same root cause was found to also break every modal). Left here for the historical record of *why* the simpler fix in 0.4.26 was the right call: per the CSS cascade-layers spec, `!important` priority is the *reverse* of normal priority (any layered rule beats any unlayered rule regardless of specificity), and Tailwind v4 generates its utilities inside `@layer utilities { ... !important }` — so a plain unlayered override, even with an id selector, could not win no matter how it was written; only declaring our own layer, before Tailwind's ever appears on the page, worked.
- **0.4.24:** First (incomplete) attempt at the admin-bar/cat-clipping fix above — added only a root-level `min-height` compensation, which didn't touch the real cause (an inner `min-h-screen` wrapper). Confirmed live via console diagnostics to still clip. Superseded by 0.4.25, and the whole approach superseded again by 0.4.26.
- **0.4.23:** Fixed a set of Elementor/theme global-style bleed-throughs, all caused by the same root gap: `all: initial` in `css/isolation.css` only resets the root element itself, not its descendants, so native `<button>`/`<a>` elements deep in the app still inherited the theme's own border/hover/line-height styles. Symptoms: a visible red border around the top-nav buttons, the Daily Inspiration bubble's hover state turning theme-accent pink/red instead of the app's own hover style, and the user-menu avatar's initials not vertically centered. Fixed with an explicit `!important` reset for native form controls and links, scoped under `#linkflow-dashboard-root`.
- **0.4.22:** Packaging-only bump between 0.4.21 and 0.4.23, no functional change.
- **0.4.21:** Two Elementor/theme-isolation gaps fixed, both only visible on the WordPress-hosted page (not the desktop client, which loads fonts via `index.html`):
  - `css/isolation.css`'s `all: initial` reset on `#linkflow-dashboard-root` left `font-family` unset, so text fell back to the browser's default serif (Times New Roman) until Tailwind's bundle CSS finished applying. Added an explicit `font-family: var(--font-sans, ...)` fallback on the root.
  - The app's icon markup is Material Symbols ligature text (e.g. `close`, `search`) that only renders as a glyph once the `Material Symbols Outlined` webfont has loaded. The desktop build gets that font from a `<link>` in `index.html`, but WordPress enqueues the built bundle directly and never loads `index.html`, so on the hosted page the icon text rendered literally instead of as icons. `enqueue_app()` now also enqueues the Material Symbols Google Fonts stylesheet directly.
- **0.4.20:** Packaging bump only, superseded by 0.4.21 above (never deployed).

### 2026-08-02

- **0.4.19:** Packaging/docs bump only — no PHP changes. Deployed to production to confirm the GitHub-release-proxy routes (`LinkFlow_Updates`, first shipped in 0.4.18/0.1.7-era work but not yet reflected in documentation until now) are live: `/desktop/latest-release` and `/desktop/latest-release/download`, both confirmed registered via the live REST route list post-deploy.

### 2026-08-01

- **0.4.18** (with desktop 0.1.6)**:** Added the Daily Inspiration bubble's backend: `GET /daily-inspiration`, server-side ZenQuotes + YouVersion/bible-api.com fetching with per-day transient caching, and a new **Settings → LinkFlow** wp-admin page (`LinkFlow_Settings`) for the optional YouVersion Platform app key. No workspace-schema or database changes.
- **0.4.17** (with desktop 0.1.5)**:** Frontend-only release. The always-visible sync diagnostics panel is no longer shown inline on top of the app; it now opens in its own window via a "Sync log" link in the top nav. No PHP changes.
- **0.4.16** (with desktop 0.1.4)**:** Frontend-only release shipping the new first-run onboarding wizard (bulk-paste links, then sort them into sections via drag-and-drop) and Google sign-in for the desktop client. No PHP changes in this release beyond the Google OAuth endpoints added in 0.4.13.
- **0.4.13:** Added Google sign-in for the desktop client (`LinkFlow_Google` class): `/desktop/google/start` and `/desktop/google/callback` REST routes, reusing the Google OAuth credentials already configured by the "WP Microsoft Auth" plugin. New users are auto-created (matched by email, falling back to a fresh subscriber account) rather than routed through that plugin's general site "complete profile" flow, which requires phone/company fields LinkFlow doesn't need. Also added `DELETE /desktop/session` so the desktop app can properly revoke its own device token on sign-out.
- **0.4.12** (with desktop 0.1.3)**:** Fixed the hosted web app never configuring a cloud backend. `wp_add_inline_script()` does not reliably attach inline content to a `type="module"` script on this WordPress core version — the module tag printed but its `window.linkflowConfig` companion script was silently dropped, so the hosted `[linkflow_dashboard]` page could load and appear to work while every edit stayed local-only and nothing ever reached the server. The config is now printed as a plain classic `<script>` tag directly in the shortcode's own HTML output, which always executes before a deferred module script regardless of DOM position.
- **0.4.10-0.4.11:** Packaging/version housekeeping while diagnosing the above; no functional change.
- **0.4.9 (production fix, 2026-08-01):** The live `controll.co.za` install had a corrupted plugin directory from a ZIP built before the 0.4.7 backslash fix (0.4.7-0.4.9's fix only guards packaging going forward; it does not repair an already-corrupted install). Every file under `wp-content/plugins/linkflow-dashboard/` had its Windows path separators baked into the literal filename (e.g. one file was literally named `linkflow-dashboard\linkflow-dashboard.php`), so WordPress could never find the real plugin header and activation silently failed. Fixed by replacing the install with a freshly validated 0.4.9 ZIP over SSH; all three tables created cleanly on activation.
- **0.4.9:** Decoupled the database schema revision from the plugin release version, verifies tables before marking setup complete, and reports a database-permission problem explicitly instead of treating a partial schema as installed. Hardened after a controlled Laragon install test.
- **0.4.8:** Made the versioned release ZIP the only install artifact. Its filename identifies the release; its internal root stays exactly `linkflow-dashboard/`.
- **0.4.7:** Write ZIP entries with forward slashes and reject any archive containing Windows backslashes, so Linux WordPress hosts extract the canonical bootstrap file correctly.
- **0.4.6:** Replaced the ad-hoc packager with the packaging-skill structure, a plugin-level version source, a stable install ZIP filename, and hard validation of the single `linkflow-dashboard/` internal root.
- **0.4.5** (with desktop 0.1.2)**:** Added temporary secret-free REST diagnostics, correlated request IDs, explicit authentication refusal details, database write evidence, workspace-version response headers, and no-cache response headers.
- **0.4.4** (with desktop 0.1.1)**:** Workspace writes are explicit authenticated POST requests. An accidentally started polling implementation was removed.
- **0.4.3:** Replaced the outbound-request URL validator with bookmark-appropriate HTTP/HTTPS validation.
- **0.4.2:** Migrated bare domains to HTTPS during workspace sanitization.
- **0.4.1:** Added `X-LinkFlow-Token` for shared-host compatibility.
- **0.4.0:** Added plugin-issued per-device authentication, device records, a rate-limited login exchange, and token revocation endpoints.

### 2026-07-31

- **0.3.6:** Final hosted-page CSS isolation experiment before Tauri became the primary client.
- **0.3.4-0.3.5:** Earlier page-scoped Elementor/theme isolation attempts.
- **0.3.3:** Corrected Vite bundles executing as classic scripts in WordPress.

## Lessons learned

- Do not use `wp_http_validate_url()` for stored bookmarks; it intentionally rejects private/local targets because it is designed for server-side HTTP requests.
- CORS preflight success does not prove that authentication headers reach PHP.
- Validate the token with `/me`, then validate the write path separately.
- The desktop write contract is POST; do not silently change it to polling or a different verb.
- REST diagnostics must show which WordPress user and workspace version were used without exposing the device token itself.
- Authenticated workspace GET responses should explicitly disable browser, proxy, and CDN caching while synchronization behavior is being verified.
- The release ZIP filename must include the version, but the archive's internal plugin root must never include it. Upload `linkflow-dashboard-vX.Y.Z.zip`; WordPress must extract `linkflow-dashboard/linkflow-dashboard.php`.
- A successful build is not a valid WordPress release until the ZIP is opened and every entry is proven to sit under the single canonical slug root.
- ZIP entry separators are part of the release contract: use `/`, never Windows `\\`, so the host extracts a real plugin directory tree.
- Database setup is schema-versioned, not package-versioned. A front-end or packaging release must not rerun table migrations.
- A validated packaging script only prevents *future* corrupted installs; it does not repair one already sitting on a server. When activation fails on a live install, inspect the actual deployed files (e.g. over SSH) rather than assuming the current packager is at fault.
- `wp_add_inline_script()` is not reliable for a script registered with `type="module"` on all WordPress core versions in use — the module tag can print while its attached inline content is silently dropped. Prefer printing required runtime config as a plain classic inline script in the shortcode's own HTML output instead of via the script-queue inline-attachment API.
- A page that renders without visible errors is not proof that its cloud configuration succeeded; a page can mount and run entirely on local cache while `window.linkflowConfig` is silently absent. Check the diagnostics panel's `cloudBackendPresentAtMount` value, not just that the page loads.
- YouVersion's `/v1/verse_of_the_days/{day}` uses 1-indexed day-of-year (January 1 = day 1), while PHP's `gmdate('z', ...)` is 0-indexed; convert with `+ 1` or the request silently returns the previous day's verse.
- Never call a third-party quote/verse API directly from the browser: ZenQuotes' free tier has no CORS headers (a direct client `fetch()` would be blocked), and an API key must never reach client JS. Always proxy through a WordPress REST endpoint that fetches server-side and caches the result.
