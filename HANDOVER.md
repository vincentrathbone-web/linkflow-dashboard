# LinkFlow handover

Last updated: 2026-09-23

This file is a status/pending/lessons digest, not a changelog — full per-release detail lives in
[`linkflow-dashboard/README.md`](./linkflow-dashboard/README.md) (desktop) and
[`wordpress-plugin/linkflow-dashboard/README.md`](./wordpress-plugin/linkflow-dashboard/README.md) (plugin).

## Status

- Plugin **0.4.36** — live on `controll.co.za`, deployed for hands-on testing ahead of the next desktop
  build. Frontend-only (`LinkTile.tsx`/`index.css`, shared by both clients): link tile titles/
  descriptions wrap to a second line instead of truncating (`line-clamp-2`, `leading-tight`, `break-words`)
  and show the full text as a native tooltip on hover. Desktop is still **0.1.23** — this change hasn't
  been built into an installer yet; do that once the user confirms the wrapping/tooltip look right live.
- 0.4.36 itself is a same-day fix for a regression in 0.4.35: the `--link-text-scale` font-size slider
  scaled tile text from `transform-origin: left center` (copied from the left-aligned heading-scale
  rule), which visibly pushed enlarged text rightward off-center instead of growing evenly, since tile
  labels are center-aligned. Fixed to `transform-origin: center` for `.link-text-scale` only.
- Desktop **0.1.23** / plugin **0.4.34** (superseded by 0.4.36 above) — live (GitHub Release +
  `controll.co.za`). Adds Google avatar sync (`avatarUrl`, stored in user meta, no schema change) and a
  fade + bouncing down-arrow overflow cue on resized Timesheet/To-Do widgets.
- **Not yet hands-on confirmed:** the two 0.1.23 features above — code-complete, lint/build/PHP-lint
  clean, installer opened for the user, but not watched running.
- Everything through 0.1.22/0.4.33 is user-confirmed working: the Play/Pause/Stop timer (widget, main
  panel, tray), the floating widget + tray icon, hold-to-stop, minimize-to-tray, the always-on-top
  "what did you work on?" popup, the `panelLayout` upgrade self-heal, and the To-Do/Timesheet panels.

## Pending / next checks

- Confirm the 0.4.36 link-tile wrap/tooltip/scale fix looks right live, then build a matching desktop
  installer (this change is currently plugin-only; the desktop exe still ships the old single-line
  truncated titles).
- Confirm 0.1.23's Google avatar and widget-overflow-fade in the running app.
- `npm run tauri:dev` hangs (Vite serves fine on :3000, but Rust/`cargo` never starts compiling, no
  error) — undiagnosed. The signed-build path is reliable so this hasn't blocked a release; worth a
  look if dev mode is needed again.
- User wants signed installers copied to a root-level `dist/` after `tauri build`, instead of staying
  buried at `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/{msi,nsis}/` — matching how
  `package.ps1` already does this for the plugin ZIP. Not yet implemented.
- YouVersion app key is registered but hasn't been reconfirmed live in Settings → LinkFlow recently.

## Architecture — essentials not obvious from the code

- Desktop is the primary, authoritative client: an 800ms-debounced `POST /workspace` is the real sync
  path. The server does one cache-busted `GET` at startup only — no polling, no push. This is
  deliberate (recovery/device-switch path), not a gap to fix. See `AGENTS.md`.
- Auth: `POST /desktop/session` exchanges a WordPress login for a per-device token once; WordPress
  stores only its SHA-256 hash; Tauri keeps the raw token in Windows Credential Manager. Requests use
  `X-LinkFlow-Token`, not `Authorization` — shared hosts strip that header before PHP sees it.
- `LINKFLOW_DASHBOARD_DB_VERSION` (schema) is independent of the plugin release version — most
  releases, including all of 0.4.29-0.4.34, ship new workspace-document fields inside the existing
  `longtext` JSON blob with zero schema change.
- WordPress/Elementor CSS isolation bugs (hosted page only) never reproduce in local dev — no theme,
  no Elementor, no admin bar. Verify live, or build a standalone static-HTML repro first; see
  `block-elementor.md` for every isolation gotcha found so far.

## Deployment order

1. Bump versions — desktop: `package.json` + `Cargo.toml` + `tauri.conf.json` (all three); plugin: via
   `package.ps1`.
2. `npm run lint` / `cargo check` / both Vite build modes / PHP `php -l` on any changed PHP.
3. Desktop: `npx tauri build --target x86_64-pc-windows-msvc` (force MSVC — a stray GNU toolchain
   causes `dlltool.exe` failures) → `gh release create` (retry once if the permission classifier blocks
   it) → clear the `linkflow_latest_github_release` transient → curl-verify the update proxy.
4. Plugin, if PHP or shared-frontend code changed: `./package.ps1` → `scp` the ZIP to the server → `wp
   plugin install <zip> --force` → verify `wp plugin list` (active/version), DB version, tables, and a
   still-401ing `/workspace` unauthenticated. SSH access is a local `~/.ssh/config` alias (not checked
   into this repo — see the maintainer's machine-specific notes); an older README mention of a `linkflow`
   alias refers to a different machine/session. Server plugin path:
   `<home>/public_html/wp-content/plugins/linkflow-dashboard`. WP-CLI is at `/usr/local/bin/wp`.
5. Commit and push to `master` (direct commits, no PR — established repo convention).
6. Update this file, both component READMEs, and root `README.md`.

## Lessons learned (the ones worth remembering)

- **Silent Tauri/Windows failures, no error anywhere:** a bare `data-tauri-drag-region` only matches an
  exact click target, not descendants — use `="deep"` for anything with child content. A missing window
  capability (e.g. `core:window:allow-start-dragging`) makes the JS call a silent no-op. `tauri build`
  reads `TAURI_SIGNING_PRIVATE_KEY`, not `_PATH` (only the separate `signer sign` CLI takes that one).
  `wp_add_inline_script()` silently drops its payload on a `type="module"` tag — print runtime config
  as a plain classic inline `<script>` instead.
- **React/event races:** a `useCallback`-memoized handler's captured state can go stale mid-gesture when
  a fast async round-trip (e.g. an event-bus reply) updates that state before a trailing native event
  (e.g. `pointerup`) fires. Track "already resolved" in a ref — don't trust the closure's captured flag.
- **CSS containment/cascade traps:** `contain: layout` makes its element the containing block for every
  `position: fixed` descendant, not just the one being debugged — decide per-element whether it wants
  the true viewport or the host's chrome-aware frame. Tailwind v4 utilities live inside a `@layer`,
  which *reverses* `!important` priority — an unlayered override can't beat a layered `!important` no
  matter how specific its selector is.
- **Ops:** the update proxy caches GitHub's latest-release lookup for 30 minutes — clear
  `linkflow_latest_github_release` after publishing or a fresh release looks invisible. Never generate a
  signing key without saving its password immediately — there's no recovery, only rotation (harmless
  pre-release, breaks every installed client if done post-release). `keyring` needs the
  `windows-native` Cargo feature or it silently falls back to a non-persistent mock store.
- **Process:** type-checking and a successful build have caught none of the bugs that actually shipped
  on this project — drag hit-testing, tray click routing, event-timing races, CSS isolation. Every one
  was found by the user running the real build by hand. Don't report a UI/interaction change as done
  until it's been exercised live.
- **PowerShell encoding:** `package.ps1`'s version-bump step read `README.md` with `Get-Content -Raw`
  and no explicit `-Encoding`. Windows PowerShell 5.1 defaults a BOM-less UTF-8 file to the system ANSI
  codepage on that call, so every em dash/smart quote in the file got mangled into mojibake on write-back
  the first time this was run in this environment (2026-09-23, packaging 0.4.35). Fixed by adding
  `-Encoding UTF8` to every `Get-Content -Raw` call in the script. Always diff a script-touched doc file
  before committing — a successful packaging run is not proof the file it rewrote is still intact.
- **CSS transform-origin depends on alignment, not just element type:** `.link-text-scale`'s font-size
  slider (`index.css`) copied `transform-origin: left center` from the heading-scale rule without
  checking that headings are left-aligned and link tiles are center-aligned — scaling from the left edge
  of a centered, shrink-to-fit box visibly grows it off-center to the right. Match the transform origin
  to how the element is actually aligned in its container, not to a rule that happened to work elsewhere.

## Repository layout

```text
LinkFlow Dashboard/
├── linkflow-dashboard/                  React/Vite + Tauri source (src/, src-tauri/, dist/)
├── wordpress-plugin/linkflow-dashboard/ Installable plugin source
├── dist/                                Versioned WordPress plugin ZIPs
├── package.ps1                          Plugin build/package script
├── README.md / HANDOVER.md / AGENTS.md
```
