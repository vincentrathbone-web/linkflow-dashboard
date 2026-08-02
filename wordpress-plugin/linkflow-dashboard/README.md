# LinkFlow Dashboard WordPress Plugin

Current version: **0.4.18**.

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

## Daily inspiration

`GET /daily-inspiration` returns a cached-per-day quote or Bible verse for the Dashboard bubble. It always fetches server-side (never exposes a third-party API or key to the browser) and caches the result in a WordPress transient until local midnight:

- `type=quote` → [ZenQuotes](https://zenquotes.io/) `/api/today`. No key.
- `type=verse` → the official YouVersion Verse of the Day (`/v1/verse_of_the_days/{day}` then `/v1/bibles/3034/passages/{passage_id}`, Berean Standard Bible — public domain), if an app key is set on **Settings → LinkFlow**. Falls back automatically to a curated ~60-reference list resolved against [bible-api.com](https://bible-api.com/) (no key) if no key is set or the YouVersion request fails.

The YouVersion app key is a free, non-commercial developer key from [platform.youversion.com](https://platform.youversion.com) (`LinkFlow Dashboard` app, registered 2026-08-01). It's stored in the `linkflow_youversion_app_key` WordPress option via the new Settings page — never in a file, never sent to the client.

## Packaging

Run `./package.ps1` from the workspace root. It reads the slug/version from this plugin's `package.json`, bumps the patch version, builds the Vite assets, and creates one validated versioned install archive under `dist/`: `linkflow-dashboard-vX.Y.Z.zip`. The ZIP filename carries the release version, but the only internal root remains `linkflow-dashboard/`.

## Version history

This is the canonical plugin changelog. The desktop client keeps its own in
[`linkflow-dashboard/README.md`](../../linkflow-dashboard/README.md); where a plugin release shipped
alongside a desktop release, the pairing is noted here.

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
