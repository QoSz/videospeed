# UI Modernization Design — Glassmorphism

**Date:** 2026-03-18
**Approach:** Targeted restructure (B) — CSS-heavy, lightweight code changes

## Design System

Shared CSS custom properties across all surfaces:

- **Glass effect:** `rgba(255,255,255,0.08)` bg + `blur(20px)` + `1px solid rgba(255,255,255,0.12)` border
- **Accent:** `linear-gradient(135deg, #667eea, #764ba2)` blue-violet
- **Dark base:** `#0f0f14` surface, `#f0f0f5` text
- **Light mode:** Higher white alpha for glass bg/border via `prefers-color-scheme`
- **Principle:** One glass pattern applied everywhere. Variables, not classes.

## Popup (280px)

- Dark base background, glass panel body
- Speed buttons: glass-styled, reset gets gradient fill
- Preset grid: glass buttons, active speed gets gradient + glow
- Footer: glass divider, green/red power stays, glass hover on gear
- System font stack replacing current
- Hover = brighten glass alpha (replaces ripple animation — less code)
- **Changes:** ~95% CSS, remove ripple pseudo-elements. No JS changes.

## Video Overlay Controller

- **Default:** Small frosted pill, just speed number (e.g. "1.75x"), ~40px tall
- **Hover:** Pill widens, 5 control buttons fade in. Same glass surface.
- Speed text: system font, gradient `background-clip: text`
- Buttons: white text, glass hover. Labels unchanged (`<<`, `-`, `+`, `>>`, `x`)
- Drag behavior unchanged, just `grab`/`grabbing` cursor
- **Changes:** Replace CSS string in shadow-dom.js. HTML structure identical. No JS logic changes.

## Options Page

- Dark base, centered max-width glass card
- Tabbed navigation: Shortcuts | Settings | Advanced — glass pill tabs, active = gradient
- Form inputs: glass background + subtle border, checkboxes as CSS toggle switches
- Shortcut rows: glass strips, gradient border on key input focus
- Save = gradient fill, Restore = glass outline
- **Changes:** Wrap sections in tab containers, ~10 lines tab-switching JS. Remove yellow advanced highlight + toggle. Less CSS overall.

## Removals (less code)

- Ripple animation CSS + pseudo-elements
- Yellow advanced feature highlight
- Show/hide advanced toggle button + JS
- Monospace font declarations
- Blue `#2196f3` hover color system
- Multiple opacity state classes on overlay

## Constraints

- Keep all existing JS logic (save/restore, messaging, drag, wheel)
- Keep shadow DOM isolation for overlay
- Keep all site-specific overrides in inject.css
- Lightweight changes — do more with less code
