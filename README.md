# LinkFlow Dashboard

LinkFlow is a closed, per-user link workspace with two clients sharing one WordPress-hosted data service:

- A React 19/Vite interface packaged as a native Windows application with Tauri.
- An authenticated WordPress-hosted interface provided by the same plugin bundle.
- A private REST API and per-user revision history stored by the WordPress plugin.

There are no public workspaces, public URLs, or shared tabs.

## Current releases

| Component | Version | Source |
| --- | ---: | --- |
| WordPress plugin | 0.4.27 (live on `controll.co.za`) | `wordpress-plugin/linkflow-dashboard/` |
| Windows desktop app | 0.1.10 | `linkflow-dashboard/src-tauri/` |

Source is hosted on GitHub: [`vincentrathbone-web/linkflow-dashboard`](https://github.com/vincentrathbone-web/linkflow-dashboard) (private repo).

The desktop app authenticates once with the user's normal WordPress credentials. The plugin exchanges them for a LinkFlow-only device token. The raw token is stored in Windows Credential Manager; WordPress stores only its SHA-256 hash.

The account dropdown (both clients) shows the signed-in user's email under their display name, so accounts sharing a display name (e.g. duplicate test accounts) can still be told apart.

## Cloud write contract

Client changes are cached locally immediately and, after an 800 ms debounce, sent to:

```text
POST /wp-json/linkflow/v1/workspace
X-LinkFlow-Token: <device token>
X-LinkFlow-Version: <current version>
Content-Type: application/json
```

The server sanitizes the complete workspace, saves it under the authenticated WordPress user, increments its version, and records a recoverable revision. `GET /workspace` loads the current cloud copy. The expected-version header prevents silent overwrites from another device.

The 0.4.5/0.1.2 diagnostic release adds an always-visible, persistent synchronization console. It correlates client and server activity with request IDs and records authentication mode, local-cache changes, workspace fingerprints, debounce decisions, HTTP status/headers/body, server database versions, and write results. Passwords, tokens, authorization headers, nonces, and secrets are redacted. At this stage the cloud workspace is pulled during client initialization; continuous downward polling is not yet active and is intentionally called out by the diagnostics.

## Theming

All colors and fonts are CSS custom properties (`--bg-surface`, `--text-main`, `--font-heading`, `--font-body`, etc.), mapped into Tailwind v4's `@theme` block so utility classes stay theme-responsive. Hardcoded `slate-*`/`font-sans` classes are not permitted outside `index.css` itself. Font pairs (heading font + separate body font, loaded live from Google Fonts) and accent color presets are both curated from established sources — see `linkflow-dashboard/src/data/fontPairs.ts` and `accentColors.ts` — not picked arbitrarily.

## Daily inspiration

An optional bubble on the Dashboard shows a daily motivational quote or Bible verse, user-toggleable (Quote / Verse / Off, cycled by clicking the bubble). Both feeds are fetched server-side by the WordPress plugin (`GET /wp-json/linkflow/v1/daily-inspiration?type=quote|verse`), cached per day, and never called directly from the browser:

- **Quote:** [ZenQuotes](https://zenquotes.io/), no key required.
- **Verse:** the official YouVersion Verse of the Day, if a free YouVersion Platform app key is set under **Settings → LinkFlow** in wp-admin; otherwise falls back automatically to a curated reference list resolved against [bible-api.com](https://bible-api.com/) (also no key required).

## Virtual pet

An optional animated cat (desktop and hosted web, since it's shared React code) wanders the Dashboard, idles, climbs onto/off section cards, and can be dragged and dropped — ported into `linkflow-dashboard/src/cat/` from the standalone [`linkflow-cat-companion`](https://github.com/vincentrathbone-web/linkflow-cat-companion) prototype (private repo, own development history). Pure SVG, no image assets. Called "Virtual Pet" in the UI (the code keeps the internal `cat`/`Cat` naming). Two toggles, same state: a quick switch at the top of the Theme dropdown, and one in Settings → Workspace Preferences. Per-device, defaults on. Shipped in desktop 0.1.10 — see the desktop README's changelog.

## In-app updates

The desktop client checks for updates via `@tauri-apps/plugin-updater` against `https://controll.co.za/wp-json/linkflow/v1/desktop/latest-release`, which the WordPress plugin backs with a server-side, authenticated proxy to the (private) GitHub Releases API — see `LinkFlow_Updates` in the plugin and `UpdateBanner.tsx` on the client. The GitHub token lives only in a WordPress option (Settings → LinkFlow), never on the client. **Verified working end-to-end on 2026-08-02** (0.1.8 → 0.1.9). Publishing a new release requires the release's `-setup.exe` and matching `-setup.exe.sig` (signed with the key in `~/.linkflow-updater-keys/` on this workstation) as GitHub Release assets — and remember the proxy's 30-minute release cache, which delays a freshly published release from being seen (`wp transient delete linkflow_latest_github_release` to force it).

## Build and package

From `linkflow-dashboard/`:

```powershell
npm install
npm run lint
npm run build:desktop
npm run tauri:dev
```

From the workspace root, build the WordPress release ZIP:

```powershell
.\package.ps1
```

The plugin slug and version come from `wordpress-plugin/linkflow-dashboard/package.json`. Upload the versioned release ZIP, `dist/linkflow-dashboard-vX.Y.Z.zip`, to WordPress. Its filename identifies the release, while the packager requires exactly one unversioned `linkflow-dashboard/` root, forward-slash ZIP paths, and the canonical `linkflow-dashboard/linkflow-dashboard.php` main file.

See [HANDOVER.md](./HANDOVER.md) for architecture, release instructions, operational notes, and lessons learned. See [block-elementor.md](./block-elementor.md) for the general, project-agnostic writeup of every WordPress/Elementor-hosted-page isolation bug fixed here (font/icon loading, native-control style bleed, the WP-admin-bar viewport-height trap, and the CSS-cascade-layers `!important` gotcha) — reusable checklist for embedding any JS app in a WordPress page.

## Release discipline

Every release must update the applicable version declarations and these documentation files:

- `README.md`
- `linkflow-dashboard/README.md`
- `wordpress-plugin/linkflow-dashboard/README.md`
- `HANDOVER.md`
- `AGENTS.md` when process or architectural rules change
- `block-elementor.md` when a new general WordPress/Elementor-embedding lesson is learned (keep it project-agnostic; project-specific detail belongs in the plugin README/HANDOVER instead)
