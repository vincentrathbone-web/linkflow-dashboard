# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the binding product/release rules for this project. Read it before changing anything; this file adds the operational detail behind it.

## What this is

One React codebase serving two clients over one WordPress-hosted data service:

- `linkflow-dashboard/src/` — shared React 19 + Vite + Tailwind 4 interface.
- `linkflow-dashboard/src-tauri/` — Rust/Tauri v2 Windows shell (the primary client).
- `wordpress-plugin/linkflow-dashboard/` — the WordPress plugin: REST API, per-user storage, device tokens, revision history.

Private-only by design: no public workspaces, no anonymous endpoints, no shared tab. Everything is scoped to an authenticated WordPress user.

## Commands

Frontend (from `linkflow-dashboard/`):

```bash
npm run lint          # tsc --noEmit — this is the only "test"; there is no test suite
```

```bash
npm run build:desktop # -> linkflow-dashboard/dist/ (Tauri frontend)
```

```bash
npm run build         # -> wordpress-plugin/linkflow-dashboard/build/ (plugin assets)
```

```bash
npm run tauri:dev     # dev shell; runs `npm run dev` on port 3000 first
```

Windows production installer — must use Tauri's packager, and must force the MSVC target on this workstation (an inherited GNU toolchain causes `dlltool.exe` failures):

```bash
npx tauri build --target x86_64-pc-windows-msvc
```

Output lands in `linkflow-dashboard/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`.

WordPress release ZIP (from the workspace root):

```bash
./package.ps1
```

`package.ps1` bumps the patch version (skip with `-NoBump`), rewrites the version in the plugin header, `LINKFLOW_DASHBOARD_VERSION`, and the plugin README, runs the Vite plugin build, stages the plugin, and writes `dist/linkflow-dashboard-vX.Y.Z.zip`. It then reopens the ZIP and hard-fails on backslash entries, a versioned internal root, a missing `linkflow-dashboard/linkflow-dashboard.php`, or more than one root folder — those checks encode real deployment failures and must not be relaxed.

The build mode is what selects the output directory (`vite.config.ts`): `--mode desktop` → `dist/`, anything else → the plugin `build/`. The plugin build deliberately does not empty its output directory (Windows can pin the cloud-synced `.vite` folder); stale assets are pruned afterwards by `package.ps1` using the Vite manifest.

## Data flow

**Auth.** `POST /wp-json/linkflow/v1/desktop/session` takes the user's real WordPress credentials once over HTTPS and returns a 256-bit hex device token. WordPress stores only its SHA-256 hash in `wp_linkflow_devices`; Tauri stores the raw token in Windows Credential Manager (service `za.co.controll.linkflow`, via `save_desktop_session`/`load_desktop_session` in `src-tauri/src/lib.rs`). Requests authenticate with `X-LinkFlow-Token`, not `Authorization` — shared hosts strip `Authorization` before PHP sees it. The plugin hooks `determine_current_user` and only honours the token for URIs containing `/linkflow/v1/`.

**Writes.** React state and localStorage update immediately; an 800 ms debounce in `App.tsx` then sends the *entire* workspace document (`{sections, links, theme}`) to `POST /workspace` with `X-LinkFlow-Version`. The server compares that against the stored version and returns 409 on mismatch; on success it bumps the version, writes a revision, and prunes to 20. Do not change this verb or replace the write path with polling.

**Reads.** A single cache-busted `GET /workspace` at initialization. There is no downward sync for an already-open client — do not describe it as if there were.

The hosted page (`[linkflow_dashboard]` shortcode) injects `window.linkflowConfig` with `restUrl` + `nonce`; the desktop client builds the same object with `restUrl` + `deviceToken`. `linkflowApi.ts` picks the auth mode from whichever fields are present, so both clients share one request path.

## Constraints that are easy to break

- **Stored bookmarks may point at localhost, private networks, and custom ports.** `sanitize_workspace()` validates HTTP/HTTPS syntax only; never reintroduce `wp_http_validate_url()`, which is for outbound server requests.
- **CORS.** `allow_tauri_origin()` whitelists `tauri://localhost` and `http://tauri.localhost` and must expose/allow every `X-LinkFlow-*` header the client uses. Adding a new custom header means updating that list.
- **Schema version is separate from plugin version.** `LINKFLOW_DASHBOARD_DB_VERSION` gates `dbDelta`; a packaging or frontend release must not rerun migrations.
- **Versions are independent.** Plugin version lives in `wordpress-plugin/linkflow-dashboard/package.json` (source of truth, propagated by `package.ps1`). Desktop version must be updated in all three of `linkflow-dashboard/package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- **Tauri must never render the WordPress page, theme, or Elementor.** The plugin's Elementor style-dequeuing exists only for the optional hosted page.

## Temporary diagnostics

`SyncDiagnosticsPanel.tsx` + `lib/syncDiagnostics.ts` on the client and `request_diagnostics()`/`diagnostic_response()` on the server form a deliberately verbose, always-visible sync console (500 entries in localStorage, correlated by `X-LinkFlow-Request-ID`). It is scaffolding for diagnosing the POST path and is meant to be removed or hidden behind a support mode once downward sync is verified.

Redaction happens at the logging boundary in `sanitizeForLog()` (key-name matching plus `Bearer` and URL-parameter patterns) before anything is persisted or displayed. Any new logging must route through `logSync` so it inherits that, and must never log a usable password, token, authorization value, or nonce.

## Documentation duty

Every substantive change updates `README.md`, the relevant component README (`linkflow-dashboard/README.md`, `wordpress-plugin/linkflow-dashboard/README.md`), and `HANDOVER.md` — including version, deployment steps, pending work, and lessons learned. Update `AGENTS.md` when a product boundary or release process changes. Verify PHP lint, `npm run lint`, the Vite builds, ZIP contents, and native artifact paths before reporting anything complete.
