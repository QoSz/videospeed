# Performance Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip all animations, transitions, and unnecessary code from the extension to make every action as fast as possible.

**Architecture:** Remove CSS animations/transitions/backdrop-filter from controller shadow DOM, convert O(n) key binding lookups to O(1) Map, eliminate cleanup work from hot paths, remove dead code, and cut unnecessary getComputedStyle/requestIdleCallback overhead.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, esbuild

---

### Task 1: Strip all animations and expensive CSS from controller shadow DOM

**Files:**
- Modify: `src/ui/shadow-dom.js:37-186` (the `_getCSS()` method)

- [ ] **Step 1: Remove transitions, backdrop-filter, box-shadow from controller CSS**

Replace the entire `_getCSS()` return value. Changes:
- Remove `backdrop-filter: blur(20px)` and `-webkit-backdrop-filter: blur(20px)` (GPU-intensive)
- Remove `transition: all 0.25s ease` from `#controller` (adds 250ms delay to every state change)
- Remove `transition: opacity 0.2s ease` from `#controls` (adds 200ms delay)
- Remove `transition: all 0.15s ease` from `button` (adds 150ms delay)
- Remove `box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3)` from `#controller:hover`
- Remove `border: 1px solid rgba(255, 255, 255, 0.1)` decorative border
- Remove `border-color` hover change
- Use solid opaque background instead of translucent+blur
- Change `border-radius: 24px` to `6px` (less GPU compositing)
- Show `#controls` immediately on hover (no fade)

```javascript
static _getCSS() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
      }

      #controller {
        position: absolute;
        top: 0;
        left: 0;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 6px;
        padding: 4px 10px;
        margin: 10px 10px 10px 15px;
        cursor: default;
        z-index: 9999999;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
      }

      #controller:hover {
        background: rgba(0, 0, 0, 0.9);
      }

      :host(:hover) #controls {
        display: inline-flex;
      }

      :host(.vsc-hidden) #controller,
      :host(.vsc-nosource) #controller {
        display: none !important;
      }

      :host(.vsc-manual:not(.vsc-hidden)) #controller {
        display: inline-flex !important;
      }

      :host(.vsc-show) #controller {
        display: inline-flex !important;
      }

      .draggable {
        cursor: grab;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.4em;
        height: 1.4em;
        text-align: center;
        vertical-align: middle;
        font-weight: 700;
        font-size: var(--vsc-button-size, 14px);
        color: rgba(255, 255, 255, 0.9);
        letter-spacing: -0.02em;
      }

      .draggable:active {
        cursor: grabbing;
      }

      #controls {
        display: none;
        align-items: center;
        gap: 2px;
        margin-left: 4px;
        font-size: var(--vsc-button-size, 14px);
        line-height: var(--vsc-button-size, 14px);
      }

      #controller.dragging {
        cursor: grabbing;
      }

      #controller.dragging #controls {
        display: inline-flex;
      }

      #controller:hover > .draggable {
        margin-right: 2px;
      }

      button {
        cursor: pointer;
        color: rgba(255, 255, 255, 0.9);
        background: transparent;
        border: none;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: inherit;
        line-height: inherit;
        font-family: inherit;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.6em;
      }

      button:focus {
        outline: none;
      }

      button:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.15);
      }

      button:active {
        background: rgba(255, 255, 255, 0.25);
      }

      button.rw {
        color: rgba(255, 255, 255, 0.7);
      }

      button.rw:hover {
        color: #fff;
      }

      button.hideButton {
        color: rgba(255, 255, 255, 0.6);
        margin-left: 4px;
      }

      button.hideButton:hover {
        color: #fff;
      }
      `;
  }
```

- [ ] **Step 2: Run build and unit tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all unit tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/shadow-dom.js
git commit -m "perf: strip animations, transitions, backdrop-filter from controller CSS"
```

---

### Task 2: Remove YouTube autohide transition from inject.css

**Files:**
- Modify: `src/styles/inject.css:21-25`

- [ ] **Step 1: Remove the CSS transition on autohide**

Replace the `.ytp-autohide vsc-controller` rule to hide instantly instead of animating:

```css
.ytp-autohide vsc-controller {
  visibility: hidden;
  opacity: 0;
}
```

Remove the `transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);` line.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/styles/inject.css
git commit -m "perf: remove transition from YouTube autohide CSS"
```

---

### Task 3: Build key binding Map for O(1) lookups in settings.js

**Files:**
- Modify: `src/core/settings.js`

Currently `keyBindings.find()` runs O(n) on every keypress. Build a `Map<keyCode, binding>` once when settings load, and rebuild it when bindings change.

- [ ] **Step 1: Add keyBindingsByKey Map to VideoSpeedConfig**

After `this.SAVE_DELAY = 1000;` in the constructor (line 13), add:

```javascript
this._keyBindingsByKey = null; // Lazily built Map<keyCode, binding>
this._keyBindingsByAction = null; // Lazily built Map<action, binding>
```

- [ ] **Step 2: Add _buildKeyBindingMaps() method**

After the constructor, add:

```javascript
/**
 * Build lookup maps from keyBindings array. Called lazily on first access.
 * @private
 */
_buildKeyBindingMaps() {
  this._keyBindingsByKey = new Map();
  this._keyBindingsByAction = new Map();
  for (const binding of this.settings.keyBindings) {
    this._keyBindingsByKey.set(binding.key, binding);
    this._keyBindingsByAction.set(binding.action, binding);
  }
}
```

- [ ] **Step 3: Add getKeyBindingByKey() method for O(1) keyCode lookup**

```javascript
/**
 * Get key binding by keyCode (O(1) lookup)
 * @param {number} keyCode - Key code
 * @returns {Object|undefined} Key binding or undefined
 */
getKeyBindingByKey(keyCode) {
  if (!this._keyBindingsByKey) {
    this._buildKeyBindingMaps();
  }
  return this._keyBindingsByKey.get(keyCode);
}
```

- [ ] **Step 4: Refactor existing getKeyBinding() to use Map**

Replace the existing `getKeyBinding` method (lines 124-132):

```javascript
getKeyBinding(action, property = 'value') {
  if (!this._keyBindingsByAction) {
    this._buildKeyBindingMaps();
  }
  const binding = this._keyBindingsByAction.get(action);
  return binding ? binding[property] : false;
}
```

- [ ] **Step 5: Invalidate maps when bindings change**

In the `save()` method, after `this.settings = { ...this.settings, ...newSettings };` (line 76), add:

```javascript
// Invalidate lookup maps if keyBindings changed
if (newSettings.keyBindings) {
  this._keyBindingsByKey = null;
  this._keyBindingsByAction = null;
}
```

Also in `setKeyBinding()`, after `binding.value = value;` (line 155), add:

```javascript
// Invalidate maps since a binding changed
this._keyBindingsByKey = null;
this._keyBindingsByAction = null;
```

- [ ] **Step 6: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/settings.js
git commit -m "perf: O(1) key binding lookup via Map instead of O(n) find()"
```

---

### Task 4: Use O(1) key binding lookup in event-manager.js and remove logger overhead

**Files:**
- Modify: `src/utils/event-manager.js:66-111`

- [ ] **Step 1: Replace find() with getKeyBindingByKey() in handleKeydown**

Replace line 97:
```javascript
const keyBinding = this.config.settings.keyBindings.find((item) => item.key === keyCode);
```

With:
```javascript
const keyBinding = this.config.getKeyBindingByKey(keyCode);
```

- [ ] **Step 2: Remove verbose logging from keydown hot path**

Remove line 69:
```javascript
window.VSC.logger.verbose(`Processing keydown event: key=${event.key}, keyCode=${keyCode}`);
```

And remove line 82:
```javascript
window.VSC.logger.debug(`Keydown event ignored due to active modifier: ${keyCode}`);
```

And remove line 108:
```javascript
window.VSC.logger.verbose(`No key binding found for keyCode: ${keyCode}`);
```

These log on every single keypress (30-100/sec during key repeat) and the string interpolation runs even when logging is disabled.

- [ ] **Step 3: Remove excessive logging from showController**

Replace lines 275-283 (the entire showController logging block) so only the class toggle logic remains:

```javascript
  showController(controller) {
    if (this.config.settings.startHidden && !controller.classList.contains('vsc-manual')) {
      return;
    }

    controller.classList.add('vsc-show');

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      controller.classList.remove('vsc-show');
      this.timer = null;
    }, 2000);
  }
```

- [ ] **Step 4: Remove excessive logging from refreshCoolDown**

Replace lines 245-263:

```javascript
  refreshCoolDown() {
    if (this.coolDownTimer) {
      clearTimeout(this.coolDownTimer);
    }

    this.coolDownActive = true;

    this.coolDownTimer = setTimeout(() => {
      this.coolDownActive = false;
      this.coolDownTimer = null;
    }, EventManager.COOLDOWN_MS);
  }
```

- [ ] **Step 5: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/event-manager.js
git commit -m "perf: O(1) key lookup, remove hot-path logging from event manager"
```

---

### Task 5: Remove cleanup from getAllMediaElements hot path

**Files:**
- Modify: `src/core/state-manager.js:54-83`

`getAllMediaElements()` is called on every keyboard action. It currently runs a cleanup loop that calls `controller.remove()` (heavy DOM operations). Move cleanup to a separate method called less frequently.

- [ ] **Step 1: Split getAllMediaElements into fast path + separate cleanup**

Replace the `getAllMediaElements` method (lines 54-83):

```javascript
  /**
   * Get all registered media elements (hot path - no cleanup)
   * @returns {Array<HTMLMediaElement>} Array of connected media elements
   */
  getAllMediaElements() {
    const elements = [];
    for (const [_id, info] of this.controllers) {
      const video = info.controller?.video || info.element;
      if (video && video.isConnected) {
        elements.push(video);
      }
    }
    return elements;
  }

  /**
   * Remove disconnected controllers. Called periodically, not on every action.
   */
  cleanupDisconnected() {
    const disconnectedIds = [];
    for (const [id, info] of this.controllers) {
      const video = info.controller?.video || info.element;
      if (!video || !video.isConnected) {
        disconnectedIds.push(id);
      }
    }
    for (const id of disconnectedIds) {
      const info = this.controllers.get(id);
      if (info?.controller?.remove) {
        info.controller.remove();
      } else {
        this.controllers.delete(id);
      }
    }
  }
```

- [ ] **Step 2: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/state-manager.js
git commit -m "perf: remove cleanup from getAllMediaElements hot path"
```

---

### Task 6: Replace requestIdleCallback with direct call in mutation observer

**Files:**
- Modify: `src/observers/mutation-observer.js:26-33,325-331`

`requestIdleCallback` adds scheduling overhead and up to 2000ms delay for mutation processing. Mutations need to be processed promptly to detect new videos.

- [ ] **Step 1: Remove requestIdleCallback from main observer**

Replace lines 26-34:

```javascript
    this.observer = new MutationObserver((mutations) => {
      this.processMutations(mutations);
    });
```

- [ ] **Step 2: Remove requestIdleCallback from shadow root observer**

Replace lines 325-332:

```javascript
    const shadowObserver = new MutationObserver((mutations) => {
      this.processMutations(mutations);
    });
```

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/observers/mutation-observer.js
git commit -m "perf: remove requestIdleCallback wrapper from mutation observers"
```

---

### Task 7: Remove getComputedStyle from video-controller hot path

**Files:**
- Modify: `src/core/video-controller.js:362-385`

`getComputedStyle()` forces a reflow. The IntersectionObserver already provides visibility state. Inline style check catches most cases; remove the expensive fallback.

- [ ] **Step 1: Remove getComputedStyle call from isVideoVisible**

Replace lines 362-385:

```javascript
  isVideoVisible() {
    if (!this.video.isConnected) {
      return false;
    }

    // Use cached IntersectionObserver state (zero layout cost)
    if (!this._isIntersecting) {
      return false;
    }

    // Check inline style (free - no reflow)
    const inlineStyle = this.video.style;
    if (inlineStyle.display === 'none' || inlineStyle.visibility === 'hidden' || inlineStyle.opacity === '0') {
      return false;
    }

    return true;
  }
```

- [ ] **Step 2: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/video-controller.js
git commit -m "perf: remove getComputedStyle from isVideoVisible, rely on IntersectionObserver"
```

---

### Task 8: Remove getComputedStyle from media-observer shouldStartHidden

**Files:**
- Modify: `src/observers/media-observer.js:208-240`

Called for every video during init scan. Use inline style check instead.

- [ ] **Step 1: Replace getComputedStyle with inline style check**

Replace lines 208-240:

```javascript
  shouldStartHidden(media) {
    if (media.tagName === 'AUDIO') {
      if (!this.config.settings.audioBoolean) {
        return true;
      }
      if (media.disabled || media.style.pointerEvents === 'none') {
        return true;
      }
      return false;
    }

    // Check inline style (no reflow) - CSS-hidden elements will be caught by IntersectionObserver later
    const style = media.style;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }

    return false;
  }
```

- [ ] **Step 2: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/observers/media-observer.js
git commit -m "perf: remove getComputedStyle from shouldStartHidden"
```

---

### Task 9: Remove excessive debug logging from action-handler.js hot paths

**Files:**
- Modify: `src/core/action-handler.js`

- [ ] **Step 1: Remove debug logs from high-frequency paths**

Remove these lines that fire on every speed change:

Line 66: `window.VSC.logger.debug('Rewind');`
Line 72: `window.VSC.logger.debug('Fast forward');`
Line 78: `window.VSC.logger.debug('Increase speed');`
Line 84: `window.VSC.logger.debug('Decrease speed');`
Line 90: `window.VSC.logger.debug('Reset speed');`
Line 95: `window.VSC.logger.debug('Display action triggered');`
Line 128: `window.VSC.logger.debug('Showing controller momentarily');`
Line 314: `window.VSC.logger.debug('Showing controller temporarily with vsc-show class');`
Line 322: `window.VSC.logger.debug('Removing vsc-show class after timeout');`
Line 327: `window.VSC.logger.debug('Audio controller blink - keeping vsc-show class');`
Line 345: `window.VSC.logger.debug(\`adjustSpeed called: value=${value}, relative=${relative}, source=${source}\`);`
Line 375: `window.VSC.logger.debug(\`Relative speed calculation: ...\`);`
Line 379: `window.VSC.logger.debug(\`Absolute speed set: ${targetSpeed}\`);`
Line 395: `window.VSC.logger.debug(\`Force mode: blocking external change, restoring to ${targetSpeed}\`);`
Line 414: `window.VSC.logger.debug(\`Updating config.settings.lastSpeed from ... to ...\`);`
Line 447: `window.VSC.logger.debug(\`Saving lastSpeed ${numericSpeed} to Chrome storage\`);`
Line 452: `window.VSC.logger.debug('NOT saving to storage - rememberSpeed is false');`

Also remove the `window.VSC.logger.withContext` wrapper from `adjustSpeed` (line 342). Replace:

```javascript
  adjustSpeed(video, value, options = {}) {
    return window.VSC.logger.withContext(video, () => {
      const { relative = false, source = 'internal' } = options;

      window.VSC.logger.debug(`adjustSpeed called: value=${value}, relative=${relative}, source=${source}`);

      // Validate input
      if (!video || !video.vsc) {
        window.VSC.logger.warn('adjustSpeed called on video without controller');
        return;
      }

      if (typeof value !== 'number' || isNaN(value)) {
        window.VSC.logger.warn('adjustSpeed called with invalid value:', value);
        return;
      }

      return this._adjustSpeedInternal(video, value, options);
    });
  }
```

With:

```javascript
  adjustSpeed(video, value, options = {}) {
    if (!video || !video.vsc) {
      return;
    }
    if (typeof value !== 'number' || isNaN(value)) {
      return;
    }
    return this._adjustSpeedInternal(video, value, options);
  }
```

- [ ] **Step 2: Remove debug logs from _adjustSpeedInternal**

Replace the method (lines 366-399):

```javascript
  _adjustSpeedInternal(video, value, options) {
    const { relative = false, source = 'internal' } = options;

    let targetSpeed;
    if (relative) {
      const currentSpeed = video.playbackRate < 0.1 ? 0.0 : video.playbackRate;
      targetSpeed = currentSpeed + value;
    } else {
      targetSpeed = value;
    }

    targetSpeed = Math.min(
      Math.max(targetSpeed, window.VSC.Constants.SPEED_LIMITS.MIN),
      window.VSC.Constants.SPEED_LIMITS.MAX
    );

    targetSpeed = Number(targetSpeed.toFixed(2));

    if (source === 'external' && this.config.settings.forceLastSavedSpeed) {
      targetSpeed = this.config.settings.lastSpeed || 1.0;
    }

    this.setSpeed(video, targetSpeed);
  }
```

- [ ] **Step 3: Trim logging from setSpeed**

Replace lines 407-459:

```javascript
  setSpeed(video, speed) {
    const numericSpeed = Number(speed.toFixed(2));

    // 1. Update lastSpeed
    this.config.settings.lastSpeed = numericSpeed;

    // 2. Start cooldown before setting playbackRate
    if (this.eventManager) {
      this.eventManager.refreshCoolDown();
    }

    // 3. Update per-video expected speed
    if (video.vsc) {
      video.vsc.expectedSpeed = numericSpeed;
    }

    // 4. Set playback rate
    video.playbackRate = numericSpeed;

    // 5. Update UI indicator
    const speedIndicator = video.vsc?.speedIndicator;
    if (!speedIndicator) {
      return;
    }
    speedIndicator.textContent = numericSpeed.toFixed(2);

    // 6. Save to storage if rememberSpeed enabled
    if (this.config.settings.rememberSpeed) {
      this.config.save({ lastSpeed: numericSpeed });
    }

    // 7. Show controller briefly
    if (video.vsc?.div) {
      this.blinkController(video.vsc.div, undefined, video);
    }
  }
```

- [ ] **Step 4: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/action-handler.js
git commit -m "perf: remove debug logging from action handler hot paths"
```

---

### Task 10: Remove dead code from site handlers

**Files:**
- Modify: `src/site-handlers/youtube-handler.js` (remove empty stubs)
- Modify: `src/site-handlers/facebook-handler.js` (remove redundant cleanup override)

- [ ] **Step 1: Remove empty setupYouTubeCSS and dead onPlayerStateChange**

In `src/site-handlers/youtube-handler.js`:

Remove `setupYouTubeCSS()` method (lines 48-52) entirely.

Remove `this.setupYouTubeCSS();` call from `initialize()` (line 41), leaving:

```javascript
  initialize(document) {
    super.initialize(document);
  }
```

Remove `onPlayerStateChange()` method (lines 108-112) entirely - it's never called anywhere.

- [ ] **Step 2: Remove redundant cleanup override from FacebookHandler**

In `src/site-handlers/facebook-handler.js`, remove the `cleanup()` method (lines 68-70) entirely - it only calls `super.cleanup()` which is the default behavior.

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/site-handlers/youtube-handler.js src/site-handlers/facebook-handler.js
git commit -m "cleanup: remove dead code from YouTube and Facebook handlers"
```

---

### Task 11: Remove excessive logging from handleRateChange and other event-manager paths

**Files:**
- Modify: `src/utils/event-manager.js:168-240`

- [ ] **Step 1: Trim debug logging from handleRateChange**

Replace lines 168-240:

```javascript
  handleRateChange(event) {
    if (this.coolDownActive) {
      const video = event.composedPath ? event.composedPath()[0] : event.target;

      if (video && video.vsc && video.vsc.expectedSpeed !== null) {
        const expectedSpeed = video.vsc.expectedSpeed;
        if (Math.abs(video.playbackRate - expectedSpeed) > 0.001) {
          video.playbackRate = expectedSpeed;
        }
      }

      event.stopImmediatePropagation();
      return;
    }

    const video = event.composedPath ? event.composedPath()[0] : event.target;

    if (!video.vsc) {
      return;
    }

    if (this.config.settings.forceLastSavedSpeed) {
      const authoritativeSpeed = this.config.settings.lastSpeed || 1.0;
      video.playbackRate = authoritativeSpeed;
      event.stopImmediatePropagation();
      return;
    }

    if (video.readyState < 1) {
      event.stopImmediatePropagation();
      return;
    }

    const rawExternalRate = typeof video.playbackRate === 'number' ? video.playbackRate : NaN;
    const min = window.VSC.Constants.SPEED_LIMITS.MIN;
    if (!isNaN(rawExternalRate) && rawExternalRate <= min) {
      event.stopImmediatePropagation();
      return;
    }

    if (this.actionHandler) {
      this.actionHandler.adjustSpeed(video, video.playbackRate, {
        source: 'external',
      });
    }

    event.stopImmediatePropagation();
  }
```

- [ ] **Step 2: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/utils/event-manager.js
git commit -m "perf: remove debug logging from handleRateChange hot path"
```

---

### Task 12: Remove empty setupEventHandlers from video-controller.js

**Files:**
- Modify: `src/core/video-controller.js`

- [ ] **Step 1: Remove the empty setupEventHandlers method and its call**

The method at lines 230-247 does nothing but log. Remove the method entirely and remove the call on line 68:

```javascript
    // Set up event handlers
    this.setupEventHandlers();
```

- [ ] **Step 2: Remove excessive initialization logging**

Remove these lines from the constructor and related methods:
- Line 76: `window.VSC.logger.info('VideoController initialized for video element');`
- Line 86: `window.VSC.logger.debug(\`Setting initial playbackRate to: ${targetSpeed}\`);`
- Line 93: `window.VSC.logger.debug('Setting initial speed via adjustSpeed');`
- Line 127: `window.VSC.logger.debug('initializeControls Begin');`
- Line 133: `window.VSC.logger.debug(\`Speed variable set to: ${speed}\`);`
- Line 149: `window.VSC.logger.debug('Starting controller hidden');`
- Line 185: `window.VSC.logger.debug('initializeControls End');`
- Line 223: `window.VSC.logger.debug(\`Controller inserted using ${positioning.insertionMethod} method\`);`

- [ ] **Step 3: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/video-controller.js
git commit -m "perf: remove empty setupEventHandlers and excessive init logging"
```

---

### Task 13: Replace Array.prototype.forEach.call with for loop in media-observer

**Files:**
- Modify: `src/observers/media-observer.js:101-119`

- [ ] **Step 1: Replace forEach.call with for loop in scanIframes**

Replace lines 101-120:

```javascript
  scanIframes(document) {
    const mediaElements = [];
    const frameTags = document.getElementsByTagName('iframe');

    for (let i = 0; i < frameTags.length; i++) {
      try {
        const childDocument = frameTags[i].contentDocument;
        if (childDocument) {
          const iframeMedia = this.scanForMedia(childDocument);
          mediaElements.push(...iframeMedia);
        }
      } catch (e) {
        // Cross-origin iframe, ignore
      }
    }

    return mediaElements;
  }
```

- [ ] **Step 2: Also remove unnecessary Array.from() in scanForMediaLight**

Replace line 74:
```javascript
      const regularMedia = Array.from(document.querySelectorAll(mediaTagSelector));
      mediaElements.push(...regularMedia);
```

With:
```javascript
      const regularMedia = document.querySelectorAll(mediaTagSelector);
      for (let i = 0; i < regularMedia.length; i++) {
        mediaElements.push(regularMedia[i]);
      }
```

- [ ] **Step 3: Remove verbose logging from scan methods**

Remove line 55-57 (info log in scanForMedia):
```javascript
    window.VSC.logger.info(
      `Found ${filteredMedia.length} media elements (${mediaElements.length} total, ${mediaElements.length - filteredMedia.length} filtered out)`
    );
```

Remove line 86-88 (info log in scanForMediaLight):
```javascript
      window.VSC.logger.info(
        `Light scan found ${filteredMedia.length} media elements (${mediaElements.length} total, ${mediaElements.length - filteredMedia.length} filtered out)`
      );
```

Remove line 170 (info log in scanAll):
```javascript
    window.VSC.logger.info(`Total unique media elements found: ${uniqueMedia.length}`);
```

Remove debug logs from shouldStartHidden (lines 213, 220, 225-227, 234).

Remove debug logs from isValidMediaElement (lines 182, 188, 194).

- [ ] **Step 4: Run build and tests**

Run: `npm run build && npm run test:unit`
Expected: Build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/observers/media-observer.js
git commit -m "perf: replace forEach.call with for loop, remove verbose scan logging"
```

---

### Task 14: Run full test suite and verify build output

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All unit tests pass. Pre-existing integration failures may remain (6 known).

- [ ] **Step 2: Check build output size**

Run: `npm run build && ls -la dist/inject.js dist/content.js`
Expected: inject.js should be smaller than before due to removed code.

- [ ] **Step 3: Verify no regressions in E2E (if Puppeteer available)**

Run: `npm run test:e2e -- basic`
Expected: Basic E2E tests pass (skip if Puppeteer not available).
