# Isolating a JS app inside a WordPress/Elementor page

A reusable recipe for embedding a React/Vue/whatever bundle into a WordPress
page (typically via a shortcode mount point like `<div id="app-root">`) while
running under a theme and/or Elementor, without the page bleeding into the
app or the app bleeding into the page. Written up after chasing all of these
independently on the LinkFlow Dashboard project; generalized so the same
checklist applies to any future WordPress-embedded app.

Assumes: a build tool that emits a CSS bundle (Tailwind v4 assumed below,
adjust for other frameworks), enqueued via `wp_enqueue_style`/`wp_enqueue_script`
into a page that may also load a theme's own global CSS and/or Elementor.

## 1. The base isolation wrapper

```css
#app-root {
	all: initial;
	display: block;
	isolation: isolate;
	contain: style;
	min-height: 100vh;
	font-family: var(--font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}

#app-root,
#app-root *,
#app-root *::before,
#app-root *::after {
	box-sizing: border-box;
}
```

- `all: initial` strips every inherited value a theme/page-builder could have
  set on an ancestor (font, color, line-height, list-style, form-control
  skins) before the app's own CSS applies.
- **It only resets the root element itself, not its descendants.** This is
  the single most important gotcha in this whole document — see sections 3
  and 5 below, both of which are consequences of it.
- **`all: initial` also resets `font-family`.** If you don't re-declare it
  explicitly (as above), the page shows a flash of the browser's default
  serif font until your bundle's own CSS finishes applying. Don't assume the
  reset is a no-op for anything you don't see an immediate visual bug for.
  **Reference the actual variable your app's runtime theming sets** (here,
  `--font-body`, set by the app itself when a user picks a font), not a
  plausible-looking name nothing ever sets. A CSS variable fallback (`var(--x,
  fallback)`) is silent when `--x` doesn't exist anywhere — it just always
  renders the fallback, with no error, until someone notices the "themeable"
  property never actually changes. This one is easy to ship without
  noticing: it looks completely correct and fixes the original flash-of-serif
  bug either way, and if your app has other elements with their own explicit,
  correctly-referenced font rule (e.g. headings with their own `--font-heading`
  reference), those will visibly keep working even while everything relying
  on inheritance from the root silently doesn't.
- `all` does **not** reset custom properties (CSS variables) — this is
  required if your app's theming (accent colors, dark mode, fonts) is driven
  by CSS custom properties set on `:root`, since those must still inherit
  down into this otherwise-reset subtree.
- `isolation: isolate` gives the subtree its own stacking context so the
  page's own overlays/animations can't land between your app's z-index
  layers.
- **Use `contain: style`, not `contain: layout` or `contain: layout style`,
  unless you've read section 5 and are certain you need it.** `layout` (and
  `paint`/`strict`/`content`) containment does more isolation, but it also
  makes this element the containing block for every `position: fixed`
  descendant — a change with enough non-obvious blast radius (see section 5)
  that it's rarely worth it. `style` containment alone (scoping counter/quote
  state to the subtree) doesn't have this side effect and is enough for most
  real isolation needs.

Enqueue this stylesheet as an explicit dependency of your bundle's own CSS
(`wp_enqueue_style('bundle-css', ..., array('isolation-css'), ...)`), so it
always loads first regardless of registration order or plugin/theme
enqueue-priority races.

## 2. Fonts and icon fonts aren't free

If your app was originally built for a native shell (Electron/Tauri/etc.)
that loads fonts via an HTML `<link>` in its own `index.html`, remember that
**WordPress never loads that file** — it enqueues your built JS/CSS bundle
directly into its own page. Anything your `index.html` was silently
providing (a Google Fonts `<link>`, a ligature icon font like Material
Symbols, a preload hint) needs its own explicit `wp_enqueue_style()` call in
the plugin, or it simply won't load on the WordPress-hosted page even though
it works everywhere else.

A ligature icon font (icon rendered as literal text like `close` or `search`
until the font loads) is an easy one to miss, because it fails silently and
looks like a content bug, not a loading bug, until you think to check
Network for the font request.

## 3. Native form controls inherit the page's styles, not just the theme's intent

Because `all: initial` (section 1) only resets the root element, a
`<button>`/`<a>`/`<input>` deep inside your app subtree still picks up
whatever the page's theme or page-builder sets **globally** on those tags —
a border, a hover background/box-shadow, an unexpected line-height. Your own
CSS framework's reset (Tailwind's preflight, for example) is meant to strip
native control chrome, but don't assume it's `!important` — if your override
still loses even with one, see section 8: the reason can be CSS cascade
layers rather than a plain specificity fight.

Symptoms this produces: a visible border around buttons that never asked for
one, a hover state that turns a jarring theme-accent color instead of your
intended one, form controls whose text isn't vertically centered because the
theme's `line-height` inflated the box.

Fix: force your own reset, scoped to the app root, with `!important`:

```css
#app-root button,
#app-root input,
#app-root select,
#app-root textarea {
	font: inherit !important;
	color: inherit !important;
	line-height: inherit !important;
	background: none !important;
	border: none !important;
	border-radius: 0 !important;
	box-shadow: none !important;
	outline: none !important;
	padding: 0 !important;
	margin: 0 !important;
	appearance: none !important;
	-webkit-appearance: none !important;
}

#app-root a {
	color: inherit !important;
	text-decoration: none !important;
	background: none !important;
	border: none !important;
	box-shadow: none !important;
}

#app-root button:hover,
#app-root button:focus,
#app-root button:focus-visible,
#app-root a:hover,
#app-root a:focus,
#app-root a:focus-visible {
	background: inherit;
	border: inherit;
	box-shadow: inherit;
	outline: none !important;
}
```

(But read section 8 first if this doesn't actually win — it might not be a
specificity problem at all.)

## 4. Deploy the fix, then actually verify it live

A local dev server almost never reproduces any of these bugs, because it
doesn't load the theme, Elementor, or the WordPress admin bar at all. **Don't
trust a fix for a WordPress/Elementor-bleed issue until you've checked it on
the actual hosted page.** Package and deploy, then hard-refresh (and clear
any page/CDN cache) before concluding anything either way — don't skip
straight to "the fix didn't work" without first ruling out stale CSS/HTML
being served.

## 5. `contain: layout` quietly changes what "fixed" means — and it's rarely worth it

If your app has any `position: fixed` element (a full-screen overlay, a
floating companion/mascot, a toast anchored to the screen edge, a modal
backdrop, a "sticky" nav bar), be aware that `contain: layout` (or
`paint`/`strict`/`content`) on **any ancestor** — including the isolation
wrapper in section 1 — makes that ancestor the containing block for the
fixed element, instead of the real browser viewport. A fixed-position child
then positions itself relative to the ancestor's own box, not the window.

This bites in more than one direction, and fixing it for one symptom can
break another that was accidentally relying on the same bug:

- **A viewport-anchored overlay clips.** Combined with `min-height: 100vh`
  on the containing ancestor, this becomes a real bug the moment that
  ancestor's box doesn't start at `y = 0` — which is exactly what happens
  under the WordPress admin bar (section 7): the ancestor's box is still
  exactly `100vh` tall, but starts 32/46px lower than the true viewport top,
  so its bottom edge silently overflows that same amount past the true
  viewport bottom. Anything anchored to "the bottom of the viewport" (a
  floating mascot's floor line, a toast) computes against a box that has
  already scrolled out of view, and appears clipped.
- **A centered modal renders far off-screen.** A `position: fixed; inset: 0`
  overlay meant to center its content on the *visible* screen instead centers
  against the containing ancestor's full box — which, once your app has
  enough content to make the page taller than one viewport, is the entire
  scrollable page height, not just what's currently visible. The modal can
  render most of a page-length below the fold, looking like a totally broken
  layout rather than an off-by-32px issue.
- **Fixing the above can break a nav bar that wants the opposite.** A
  top nav bar deliberately using `fixed; top: 0` to pin below the host page's
  own chrome (rather than to the bare browser viewport) can end up relying on
  `contain: layout`'s side effect by accident — the containing ancestor's box
  already started below the WordPress admin bar, so the nav "just worked" by
  coincidence. Remove the `contain: layout` side effect to fix the modal/
  overlay bugs above, and this nav bar now renders at the literal viewport
  top instead — which is exactly where the admin bar itself already is,
  fighting it for the same pixels and usually losing (the host page's own
  chrome has a much higher `z-index`). See the fix for this in section 6.

**The straightforward fix, and the one this project ended up shipping: don't
use `contain: layout` at all.** `contain: style` alone (see section 1)
doesn't establish a new containing block for `position: fixed`, so every
fixed element in your app keeps behaving normally — anchored to the true
viewport, exactly like it would with no isolation wrapper in the picture —
and none of the three bugs above happen in the first place. Reach for
`contain: layout`/`paint`/`strict`/`content` only if you have a specific,
verified need for the surrounding page's layout engine to be blocked from
reading your subtree (rare), and if you do, budget time for auditing *every*
`position: fixed` element in the app against all three bugs above, not just
the one you were originally trying to fix.

## 6. Not every `position: fixed` element wants the same reference frame

Once `position: fixed` correctly tracks the true browser viewport (the
default, and what you get by following section 5's advice), you'll find your
app's fixed elements actually split into two groups, and conflating them is
the next trap:

- **Viewport-anchored elements** — modals, toasts, full-screen overlays, a
  floating mascot — genuinely want the true, unadjusted viewport. A modal
  should center on whatever the user can actually see; a toast in the corner
  should sit in the corner of the real screen. These need nothing extra once
  section 5's fix is in place.
- **Host-chrome-aware elements** — a top nav bar, anything that means "the
  top/edge of the *app*," not "the top/edge of the *screen*" — need to know
  about any chrome the host page adds above/around the app, or they render
  underneath/behind it. WordPress's admin toolbar (section 7) is the
  motivating example, but the same idea applies to any host with its own
  persistent UI: an iframe with a parent toolbar, a different CMS's admin bar,
  a support-chat launcher that reserves screen space.

Solve the second group with a single CSS custom property that any
host-chrome-aware element consumes explicitly — don't rely on containment or
any other structural accident to get this right for you:

```css
body {
	--host-chrome-offset: 0px;
}
body.admin-bar {
	--host-chrome-offset: 32px;
}
@media screen and (max-width: 782px) {
	body.admin-bar {
		--host-chrome-offset: 46px;
	}
}
```

Then, only on the specific elements that need it:

```css
/* A nav bar that should sit just below any host chrome: */
.app-nav { position: fixed; top: var(--host-chrome-offset, 0px); }
```

```jsx
// Or inline, in a React/JSX component:
<nav style={{ position: 'fixed', top: 'var(--host-chrome-offset, 0px)' }}>
```

If normal-flow content sits below that nav and already reserves space for
its height (a `padding-top` sized to the nav's height), that padding also
needs the same extra offset added — the nav shifting down by
`--host-chrome-offset` otherwise eats into that reserved space by the same
amount:

```jsx
<main style={{ paddingTop: 'var(--host-chrome-offset, 0px)' }}>
```

This generalizes past WordPress: any embedding host with its own persistent
chrome is just a different value for the same custom property. The custom
property survives `all: initial` (section 1) and inherits normally, so
defining it once on `body` reaches every descendant that needs it.

## 7. The WordPress admin bar breaks every `100vh` assumption

When a logged-in user views any page, WordPress pushes the *entire page*
down via `margin-top: 32px !important` on `<html>` (46px at `max-width:
782px` — WordPress's own mobile breakpoint), and adds an `admin-bar` class
to `<body>`. Any element sized with `100vh` doesn't know about this push —
it renders a full viewport-height box starting 32/46px lower than before,
so its bottom edge silently extends that same amount past the real,
currently-visible viewport bottom. This isn't a layout bug in the traditional
sense — nothing overflows visibly wrong on inspection, it just requires
scrolling those extra pixels to see the true bottom of a box that a user
assumes is "the whole screen."

**If you followed section 5's advice and avoided `contain: layout`, this
mostly stops mattering for `position: fixed` elements** — they track the true
viewport regardless of any ancestor's height or top offset, admin bar or not.
It still matters for anything computing its own layout height directly from
`100vh` in normal document flow (a full-height loading/sign-in screen, for
instance) — that content genuinely does render below the fold by 32/46px
without a fix, since it isn't `position: fixed` and really is sized by its
own `100vh` box starting lower on the page than before. If you need to
compensate for that, the same `--host-chrome-offset` custom property from
section 6 is the right tool (`min-height: calc(100vh - var(--host-chrome-offset))`),
not a containment-dependent trick.

## 8. CSS cascade layers reverse `!important` priority — a Tailwind v4 trap

This one is still worth knowing even though it's no longer needed for the
specific bug that originally motivated it here (once you avoid `contain:
layout` per section 5, you'll rarely need to fight Tailwind's `min-h-screen`
utility at all) — it's a general trap for *any* override you write against a
`@layer`-based CSS framework, for any property, not just `min-height`.

This is the one that looks like a specificity bug but isn't, and will burn
real time if you don't know the rule: **Tailwind v4 (and any tool using
`@layer`) generates its utility classes inside a named CSS layer** (Tailwind
emits `@layer utilities { ... }`, confirmed by grepping the built bundle CSS
for `@layer`). If your override lives in a plain, unlayered stylesheet (the
isolation wrapper above, by default), the following is true regardless of
selector specificity:

> Per the CSS Cascade Layers spec, priority for `!important` declarations is
> the *reverse* of normal declarations: **any declaration inside a named
> layer beats any declaration with no layer at all** — full stop, before
> specificity is even considered. An unlayered `!important` rule, no matter
> how specific (even an ID selector), cannot out-rank a layered
> `.some-class { ... !important }` utility.

This is exactly why an override targeting a Tailwind utility class by exact
token — e.g. `#app-root [class~="min-h-screen"] { min-height: ... !important; }`
— can silently fail to apply even though it looks like it should win on
specificity (`#app-root [class~="..."]` vs. a bare `.class`). If your build
tool doesn't use layers, you'll never hit this. If it does (Tailwind v4 and
increasingly others), you must fight it with layers, not specificity:

```css
@layer host-overrides {
	body.admin-bar #app-root [class~="min-h-screen"] {
		min-height: calc(100vh - 32px) !important;
	}
}
```

Layer priority for `!important` is decided by **order of first declaration
on the page — earliest wins**. Since your isolation/override stylesheet is
already enqueued as a dependency that loads before the bundle CSS (section
1), declaring any uniquely-named layer in it — before the bundle's own
`@layer properties/theme/base/components/utilities` (or whatever your
framework calls its layers) has been declared anywhere on the page — makes
your layer outrank all of the framework's layers for `!important` purposes.
You don't need to match the framework's layer name; any layer beats no
layer, and being declared first among layers wins the `!important` tie.

**How to verify any of this without burning a deploy cycle**: don't test
against the live host page directly. Build a minimal static HTML file
reproducing just the mechanism in question (a `contain: layout` ancestor, a
`margin-top` shift, a competing `@layer utilities` rule) with a script tag
that reads back `getComputedStyle(...)` and `getBoundingClientRect()`
values, open it directly in a browser, and confirm the numbers before
shipping the real fix. This caught a wrong turn (a naive `!important`
override that looked right by every normal specificity rule) before it cost
another round-trip to production.

## Diagnostic checklist

When something in an embedded app looks subtly wrong only on the hosted
page and never in local dev:

1. Is it actually a loading problem, not a style problem? (Fonts, icon
   fonts — check Network, not just Elements.)
2. Is the property in question set on the exact element with the bug, or
   only on an ancestor `all: initial` doesn't reach past?
3. Is a page-builder/theme's bare-tag CSS (`button`, `a`) simply
   unopposed because your framework's reset for that tag isn't
   `!important`?
4. Is a `position: fixed` element's containing block actually the true
   viewport, or has an ancestor's `contain`/`transform`/`filter`/
   `will-change` silently made it something else?
5. Is the host page shifted by chrome your app's `100vh` math doesn't know
   about (admin bar, iframe toolbar, mobile browser UI)?
6. If an override with correct-looking higher specificity still loses: is
   the competing rule inside a `@layer`, making specificity irrelevant?
7. Have you actually deployed and hard-refreshed (bypassing any page/CDN
   cache) before concluding a fix didn't work?
8. Does a "themeable" CSS property actually change when the app's runtime
   theming changes it, or does it just look right because of a coincidental
   default? A `var(--x, fallback)` reference to a variable nothing ever sets
   is silent and easy to ship by accident (section 1).
9. Does this `position: fixed` element want the true viewport, or does it
   want to sit below the host page's own chrome? Fixing one kind by removing
   containment can break the other kind if they were both relying on the
   same accidental behavior (sections 5-6).
10. After any change to the isolation wrapper, did you re-check the *whole*
    page, not just the one symptom that was reported? Several of these bugs
    only appear once a previous, unrelated-looking fix changes the ground
    they were quietly standing on.
