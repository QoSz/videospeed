# UI Modernization — Glassmorphism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize all 3 UI surfaces (popup, video overlay, options page) with a glassmorphism design using blue-violet gradient accent.

**Architecture:** CSS-heavy approach. Replace stylesheets for popup and options. Replace inline CSS string in shadow-dom.js. Add minimal tab-switching JS to options page (~10 lines). No changes to messaging, storage, or controller logic.

**Tech Stack:** CSS (custom properties, backdrop-filter, gradients), vanilla JS for tab switching.

**Design doc:** `docs/plans/2026-03-18-ui-modernization-design.md`

---

### Task 1: Modernize Popup CSS

**Files:**
- Modify: `src/ui/popup/popup.css` (full replacement)

- [ ] **Step 1: Replace popup.css with glassmorphism design**

Replace the entire CSS file. Key changes:
- New CSS variables: glass-bg, glass-blur, glass-border, accent-gradient, dark surface colors
- Light mode overrides via `prefers-color-scheme: light`
- Body: dark base `#0f0f14`, system font stack
- `.popup-container`: glass panel (backdrop-filter, translucent bg, subtle border)
- `.control-btn`: glass-styled buttons with hover = brighten alpha
- `.reset-btn`: blue-violet gradient fill (`linear-gradient(135deg, #667eea, #764ba2)`)
- `.preset-btn`: glass buttons, `.active` gets gradient + glow (`box-shadow`)
- `.footer`: glass border-top, glass hover on icon buttons
- Remove: ripple `::before` pseudo-elements, `translateY` hover transforms, Material Design variables
- Keep: `.hide`, `@keyframes slideIn`, focus-visible outlines, responsive media query

- [ ] **Step 2: Build and visually verify popup**

Run: `npm run build`
Load unpacked extension from `dist/` in Chrome, click extension icon, verify:
- Dark glass background renders
- Speed buttons have glass effect
- Reset button shows blue-violet gradient
- Hover brightens buttons
- Power/settings icons visible and clickable
- Light mode switches correctly

- [ ] **Step 3: Commit**

```bash
git add src/ui/popup/popup.css
git commit -m "feat(ui): modernize popup with glassmorphism design"
```

---

### Task 2: Modernize Video Overlay Controller

**Files:**
- Modify: `src/ui/shadow-dom.js:21-147` (CSS string only)

- [ ] **Step 1: Replace the CSS string in shadow-dom.js**

Replace the `style.textContent` template literal. Key changes:
- `#controller`: frosted glass bg (`rgba(255,255,255,0.08)`), `backdrop-filter: blur(20px)`, border `1px solid rgba(255,255,255,0.12)`, `border-radius: 24px`, compact padding
- `.draggable`: system font, gradient text via `background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`
- `#controls`: `display: none` by default, opacity fade-in transition, buttons appear inline
- `:host(:hover) #controller`: slight glow, show controls with smooth width expansion
- `button`: transparent bg, white text, glass hover (`rgba(255,255,255,0.15)`), rounded, no border. Remove old blue `#2196f3` and monospace font.
- `.draggable` width: `auto` with `min-width` so pill shrinks to content
- Keep: all `:host(.vsc-hidden)`, `:host(.vsc-nosource)`, `:host(.vsc-manual)`, `:host(.vsc-show)` rules (same selectors, same logic)
- Keep: `.dragging` cursor rules
- Do NOT change any DOM structure or element IDs — only the CSS string

- [ ] **Step 2: Build and visually verify overlay**

Run: `npm run build`
Load extension, go to a video page (e.g. YouTube), verify:
- Small frosted pill shows speed number
- Hover expands to show control buttons
- Buttons work (slower, faster, rewind, advance, hide)
- Drag still works
- Pill doesn't obstruct video

- [ ] **Step 3: Commit**

```bash
git add src/ui/shadow-dom.js
git commit -m "feat(ui): modernize video overlay as glassmorphism pill"
```

---

### Task 3: Modernize Options Page

**Files:**
- Modify: `src/ui/options/options.html` (add tab nav, wrap sections)
- Modify: `src/ui/options/options.css` (full replacement)
- Modify: `src/ui/options/options.js` (add ~10 lines for tab switching)

- [ ] **Step 1: Update options.html with tab structure**

Add a `<nav class="tabs">` after header with 3 tab buttons. Wrap existing sections in `<div class="tab-content" data-tab="...">` containers:
- Tab "shortcuts": the `#customs` section
- Tab "settings": the "Other" section + button-group + status
- Tab "help": the Help & Support section

Remove the `#experimental` button (advanced features will live under Settings tab, always visible).
Remove the `<div class="row advanced-feature">` wrapper classes — these inputs become normal rows in the Settings tab.

- [ ] **Step 2: Replace options.css with glassmorphism design**

Replace the entire CSS file. Key changes:
- Same glass variables as popup (dark base, glass-bg, glass-blur, accent-gradient)
- `html`: dark base `#0f0f14`, system font stack
- `body`: centered content, max-width 720px
- `header`: glass panel with gradient text for h1
- `.tabs`: flex row of glass pill buttons, active tab gets gradient fill
- `.tab-content`: hidden by default, `.tab-content.active` shown
- Form inputs: glass background (`rgba(255,255,255,0.06)`), subtle border, gradient border on focus
- Checkboxes: CSS toggle switch using `label` + hidden input (purely CSS, existing `<input type="checkbox">` unchanged)
- `.row.customs`: glass strip background per row
- Buttons: `#save` gets gradient fill, `#restore` gets glass outline
- Remove: ripple pseudo-elements, yellow advanced-feature highlights, Material Design variables
- Keep: responsive media query, `.removeParent` positioning, `.customKey` text-shadow trick

- [ ] **Step 3: Add tab switching JS to options.js**

Add to the `DOMContentLoaded` handler, after `restore_options()`:

```javascript
// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`.tab-content[data-tab="${btn.dataset.tab}"]`).classList.add('active');
  });
});
```

Remove the `show_experimental()` function and its event listener (advanced features are now always visible in Settings tab). Remove the `#experimental` button listener.

- [ ] **Step 4: Build and visually verify options page**

Run: `npm run build`
Open options page (`chrome-extension://<id>/ui/options/options.html`), verify:
- Dark glass background
- Tabs switch correctly (Shortcuts, Settings, Help)
- Shortcuts: key recording works, add/remove custom shortcuts works
- Settings: checkboxes toggle, inputs accept values, all formerly-advanced inputs are visible
- Save/Restore work correctly
- Responsive layout at narrow widths

- [ ] **Step 5: Run existing tests**

Run: `npm test`
Expected: All unit and integration tests pass. Fix any failures caused by DOM structure changes (unlikely since tests mock the DOM).

- [ ] **Step 6: Commit**

```bash
git add src/ui/options/options.html src/ui/options/options.css src/ui/options/options.js
git commit -m "feat(ui): modernize options page with glassmorphism tabs"
```
