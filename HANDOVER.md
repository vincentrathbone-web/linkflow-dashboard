# LinkFlow handover

Last updated: 2026-08-19

This file is a status/pending/lessons digest, not a changelog — full per-release detail lives in
[`linkflow-dashboard/README.md`](./linkflow-dashboard/README.md) (desktop) and
[`wordpress-plugin/linkflow-dashboard/README.md`](./wordpress-plugin/linkflow-dashboard/README.md) (plugin).

## Status

- Desktop **0.1.23** / plugin **0.4.34** — live (GitHub Release + `controll.co.za`). Adds Google avatar
  sync (`avatarUrl`, stored in user meta, no schema change) and a fade + bouncing down-arrow overflow
  cue on resized Timesheet/To-Do widgets.
- **Not yet hands-on confirmed:** the two 0.1.23 features above — code-complete, lint/build/PHP-lint
  clean, installer opened for the user, but not watched running.
- Everything through 0.1.22/0.4.33 is user-confirmed working: the Play/Pause/Stop timer (widget, main
  panel, tray), the floating widget + tray icon, hold-to-stop, minimize-to-tray, the always-on-top
  "what did you work on?" popup, the `panelLayout` upgrade self-heal, and the To-Do/Timesheet panels.

## Pending / next checks

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
4. Plugin, if PHP changed: `./package.ps1` → `scp` the ZIP to the server → `wp plugin install <zip>
   --force` → verify `wp plugin list` (active/version), DB version, tables, and a still-401ing
   `/workspace` unauthenticated.
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

## Repository layout

```text
LinkFlow Dashboard/
├── linkflow-dashboard/                  React/Vite + Tauri source (src/, src-tauri/, dist/)
├── wordpress-plugin/linkflow-dashboard/ Installable plugin source
├── dist/                                Versioned WordPress plugin ZIPs
├── package.ps1                          Plugin build/package script
├── README.md / HANDOVER.md / AGENTS.md
```
