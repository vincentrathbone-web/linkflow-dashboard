# LinkFlow agent instructions

## Product boundaries

- LinkFlow is private-only. Do not add public workspaces, public URLs, anonymous endpoints, or a Shared tab.
- WordPress is the cloud identity/data service. Tauri is the primary Windows interface and must not render the WordPress page, theme, or Elementor.
- All workspace and device operations must remain scoped to the authenticated WordPress user.

## Cloud contract

- Desktop and hosted changes write through authenticated `POST /wp-json/linkflow/v1/workspace` requests after the current 800 ms debounce.
- Send device credentials in `X-LinkFlow-Token`; shared hosting may strip `Authorization`.
- Preserve `X-LinkFlow-Version` optimistic concurrency and the bounded revision history.
- While the temporary diagnostic release is active, preserve correlated `X-LinkFlow-Request-ID` logging and redact all passwords, tokens, authorization values, nonces, and secrets.
- Do not introduce polling as a substitute for diagnosing or fixing the POST write path.
- Downward sync (server to an already-open client) is intentionally startup-only, not continuous. The desktop app is the primary, authoritative client; its debounced `POST` is the real-time synchronization contract, and the server exists as the recovery/device-switch path so a user moving to another device or the hosted page sees their last-saved state instead of starting over. Do not add continuous polling/push to "fix" this without a concrete multi-device-concurrent-editing requirement.
- Stored bookmarks may target localhost, private networks, or custom ports. Validate HTTP/HTTPS syntax, but do not use WordPress's outbound-request validator for stored links.

## Versions and releases

- Keep plugin and desktop versions independent and explicit.
- Treat `wordpress-plugin/linkflow-dashboard/package.json` as the WordPress plugin slug/version source of truth.
- Update every applicable version source: plugin header/constant/package script for WordPress; `package.json`, `Cargo.toml`, and `tauri.conf.json` for desktop.
- Preserve prior versioned ZIPs and installers.
- Hand off `dist/linkflow-dashboard-vX.Y.Z.zip` for WordPress installation. The filename carries the version, but the internal plugin root must stay `linkflow-dashboard/`.
- Reject any plugin ZIP whose entries do not all use the single `linkflow-dashboard/` root or whose main file is not `linkflow-dashboard/linkflow-dashboard.php`.
- Reject any plugin ZIP that contains `\\` in an entry name; use ZIP-standard forward slashes so Linux WordPress hosts extract the plugin bootstrap path correctly.
- Keep `LINKFLOW_DASHBOARD_DB_VERSION` independent of `LINKFLOW_DASHBOARD_VERSION`; update the schema revision only for real database changes and mark it complete only after every LinkFlow table exists.
- Verify PHP lint, TypeScript lint, Vite builds, ZIP contents, and native artifact paths before reporting completion.
- Use `tauri build --target x86_64-pc-windows-msvc` on this workstation; do not hand off a direct Cargo build as the production app.

## Documentation

- After every substantive change, update `README.md`, the relevant component README, and `HANDOVER.md`.
- Record version changes, deployment steps, pending work, and lessons learned.
- Keep documentation truthful about synchronization direction and frequency. A startup GET is not continuous downward synchronization.
- Update this `AGENTS.md` whenever a product boundary, architectural decision, or release process changes.
- Never call a release complete while its documentation still describes an obsolete authentication or synchronization flow.

## Handoff

- Lead with verified artifacts and exact paths.
- Separate completed work from deployment/testing still required.
- When coding is complete, suggest the next safe verification step.
