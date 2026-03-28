# Enterprise Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 131 TypeScript errors, fix bugs, remove dead code, and bring the codebase to enterprise-quality strict TypeScript with zero `any`, zero `ts-ignore`.

**Architecture:** The codebase uses a dual-context Chrome extension architecture with window.VSC namespace for page-context modules. Type definitions in `src/types/` feed into `src/types/globals.d.ts` which augments global scope. All modules register on `window.VSC` via side-effect imports.

**Tech Stack:** TypeScript 5.9, esbuild, ESLint with @typescript-eslint, Chrome Extension Manifest V3

---

### Task 1: Install @types/chrome and Fix ESLint for TypeScript

**Files:**
- Modify: `package.json`
- Modify: `.eslintrc.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install @types/chrome**

Run: `npm install --save-dev @types/chrome`

- [ ] **Step 2: Remove custom Chrome API types from globals.d.ts**

In `src/types/globals.d.ts`, delete the entire `namespace chrome { ... }` block (lines 24-99). The `@types/chrome` package provides these properly.

- [ ] **Step 3: Fix ESLint configuration for TypeScript**

Replace `.eslintrc.json` with:

```json
{
  "env": {
    "browser": true,
    "es2022": true,
    "node": true,
    "webextensions": true
  },
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "globals": {
    "chrome": "readonly"
  },
  "rules": {
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": "off",
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": "error",
    "curly": "error",
    "semi": ["error", "always"],
    "quotes": ["error", "single", { "avoidEscape": true }],
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-script-url": "error",
    "arrow-spacing": "error",
    "no-duplicate-imports": "error",
    "prefer-arrow-callback": "error",
    "prefer-template": "error",
    "no-unreachable": "error",
    "no-useless-return": "error"
  },
  "overrides": [
    {
      "files": ["src/**/*.ts"],
      "parser": "@typescript-eslint/parser",
      "parserOptions": {
        "ecmaVersion": 2022,
        "sourceType": "module",
        "project": "./tsconfig.json"
      },
      "extends": [
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking"
      ],
      "rules": {
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-non-null-assertion": "warn",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-call": "warn"
      }
    },
    {
      "files": ["tests/**/*.js"],
      "env": { "jest": true },
      "rules": { "no-unused-expressions": "off" }
    }
  ]
}
```

- [ ] **Step 4: Remove duplicate ESLint config from package.json**

Delete the `"eslintConfig": { ... }` block from `package.json` (lines 37-77). Keep only the `.eslintrc.json` file.

- [ ] **Step 5: Remove allowJs from tsconfig.json**

In `tsconfig.json`, remove `"allowJs": true` since all source files are now TypeScript.

- [ ] **Step 6: Verify ESLint can parse TypeScript files**

Run: `npx eslint src/background.ts --no-eslintrc -c .eslintrc.json`
Expected: No "Parsing error" - may have lint warnings but should parse successfully.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .eslintrc.json tsconfig.json
git commit -m "chore: install @types/chrome, configure ESLint for TypeScript"
```

---

### Task 2: Rebuild Type System - globals.d.ts

**Files:**
- Modify: `src/types/globals.d.ts`
- Modify: `src/types/controller.ts`
- Modify: `src/types/site-handler.ts`

The root cause of ~80% of errors is that globals.d.ts uses `unknown` for all constructor return types and parameters, and modules use type aliases that don't match the global definitions.

- [ ] **Step 1: Fix ControllerPosition to accept Node**

In `src/types/controller.ts`, change `insertionPoint` and `targetParent` to accept `Node`:

```typescript
export interface ControllerPosition {
  insertionPoint: HTMLElement | Node;
  insertionMethod: 'firstChild' | 'beforeParent' | 'afterParent';
  targetParent: HTMLElement | Node;
}
```

This fixes all site-handler assignment errors (TS2419) since handlers return `parent.parentNode` which is `Node`.

- [ ] **Step 2: Update ISiteHandler to match ControllerPosition**

In `src/types/site-handler.ts`, the import already pulls from controller.ts, so the ControllerPosition type will be updated automatically. But verify the `detectSpecialVideos` parameter matches - it takes `Document | ShadowRoot` in practice:

```typescript
export interface ISiteHandler {
  hostname: string;
  getControllerPosition(parent: HTMLElement, video: HTMLMediaElement): ControllerPosition;
  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean;
  initialize(document: Document): void;
  cleanup(): void;
  shouldIgnoreVideo(video: HTMLMediaElement): boolean;
  getVideoContainerSelectors(): string[];
  detectSpecialVideos(root: Document | ShadowRoot): HTMLMediaElement[];
}
```

- [ ] **Step 3: Rewrite globals.d.ts with proper types**

Replace `src/types/globals.d.ts` entirely. Key changes:
- Remove chrome namespace (now from @types/chrome)
- Import actual class types using `import type`
- Replace all `unknown` constructor returns with proper class types
- Add missing type aliases (VSCConfig, VSCActionHandler, etc.)
- Add VSCMediaElement type alias
- Add netflix window property

```typescript
/**
 * Global type augmentations for Video Speed Controller
 */

import type { VSCAttachment, ControllerInfo, ControllerPosition, AdjustSpeedOptions } from './controller.js';
import type { VSCSettings, KeyBinding, SpeedLimits, ControllerSizeLimits } from './settings.js';
import type { ISiteHandler } from './site-handler.js';
import type { VideoController } from '../core/video-controller.js';
import type { MediaElementObserver } from '../observers/media-observer.js';
import type { VideoMutationObserver } from '../observers/mutation-observer.js';
import type { SiteHandlerManager } from '../site-handlers/index.js';
import type { BaseSiteHandler } from '../site-handlers/base-handler.js';

// ── HTMLMediaElement augmentation ──

declare global {
  /** Media element with optional VSC controller attachment */
  type VSCMediaElement = HTMLMediaElement & { vsc?: VSCAttachment };

  interface HTMLMediaElement {
    /** VSC controller attachment; present when a controller is bound */
    vsc?: VSCAttachment;
  }

  interface HTMLElement {
    /** Blink timeout ID used by controller show/hide animation */
    blinkTimeOut?: ReturnType<typeof setTimeout>;
  }

  // ── Type aliases used across modules ──

  /** Alias for VSCVideoSpeedConfig (used by observers/core modules) */
  type VSCConfig = VSCVideoSpeedConfig;

  /** Alias for action handler instance type */
  type VSCActionHandler = InstanceType<VSCNamespace['ActionHandler']>;

  /** Alias for event manager instance type */
  type VSCEventManager = InstanceType<VSCNamespace['EventManager']>;

  /** Alias for mutation observer instance type */
  type VSCVideoMutationObserver = InstanceType<VSCNamespace['VideoMutationObserver']>;

  /** Alias for media observer instance type */
  type VSCMediaElementObserver = InstanceType<VSCNamespace['MediaElementObserver']>;

  /** Alias for site handler (used by media observer) */
  type VSCSiteHandler = SiteHandlerManager;

  /** Alias for controller element type */
  type VSCControllerElement = HTMLElement & {
    blinkTimeOut?: ReturnType<typeof setTimeout>;
  };

  /** Alias for video element with controller */
  type VSCVideoElement = HTMLMediaElement & { vsc?: VSCAttachment };

  // ── Window.VSC namespace ──

  interface VSCConstants {
    DEFAULT_SETTINGS: VSCSettings;
    LOG_LEVELS: {
      NONE: 1;
      ERROR: 2;
      WARNING: 3;
      INFO: 4;
      DEBUG: 5;
      VERBOSE: 6;
    };
    MESSAGE_TYPES: {
      SET_SPEED: string;
      ADJUST_SPEED: string;
      RESET_SPEED: string;
      TOGGLE_DISPLAY: string;
    };
    SPEED_LIMITS: SpeedLimits;
    CONTROLLER_SIZE_LIMITS: ControllerSizeLimits;
    CUSTOM_ACTIONS_NO_VALUES: readonly string[];
    regStrip: RegExp;
    regEndsWithFlags: RegExp;
    formatSpeed(speed: number): string;
    [key: string]: unknown;
  }

  interface VSCLogger {
    verbosity: number;
    defaultLevel: number;
    setVerbosity(level: number): void;
    setDefaultLevel(level: number): void;
    pushContext(context: string | HTMLMediaElement): void;
    popContext(): void;
    withContext<T>(context: string | HTMLMediaElement, fn: () => T): T;
    log(message: string, level?: number): void;
    error(message: string): void;
    warn(message: string): void;
    info(message: string): void;
    debug(message: string): void;
    verbose(message: string): void;
  }

  interface VSCDomUtils {
    escapeStringRegExp(str: string): string;
    isBlacklisted(blacklist: string): boolean;
    inIframe(): boolean;
    getShadow(parent: Element, maxDepth?: number): Element[];
    findVideoParent(element: Element): Element;
    initializeWhenReady(document: Document, callback: (doc: Document) => void): void;
    findMediaElements(node: Element, audioEnabled?: boolean): HTMLMediaElement[];
    findShadowMedia(root: ShadowRoot | Document | Element, selector: string, results?: Element[]): Element[];
    [key: string]: unknown;
  }

  interface VSCStateManager {
    controllers: Map<string, ControllerInfo>;
    registerController(controller: { controllerId: string; video: HTMLMediaElement }): void;
    unregisterController(controllerId: string): void;
    getAllMediaElements(): HTMLMediaElement[];
    cleanupDisconnected(): void;
    getMediaByControllerId(controllerId: string): HTMLMediaElement | null;
    getFirstMedia(): HTMLMediaElement | null;
    hasControllers(): boolean;
    startPeriodicCleanup(): void;
    stopPeriodicCleanup(): void;
  }

  interface VSCSiteHandlerManager {
    currentHandler: BaseSiteHandler | null;
    getCurrentHandler(): BaseSiteHandler;
    initialize(document: Document): void;
    getControllerPosition(parent: HTMLElement, video: HTMLMediaElement): ControllerPosition;
    handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean;
    shouldIgnoreVideo(video: HTMLMediaElement): boolean;
    getVideoContainerSelectors(): string[];
    detectSpecialVideos(root: Document | ShadowRoot): HTMLMediaElement[];
    cleanup(): void;
  }

  interface VSCVideoSpeedConfig {
    settings: VSCSettings;
    load(): Promise<VSCSettings>;
    save(newSettings?: Partial<VSCSettings>): Promise<void>;
    getKeyBinding(action: string, property?: string): unknown;
    getKeyBindingByKey(keyCode: number): KeyBinding | undefined;
    setKeyBinding(action: string, value: number): void;
  }

  interface VSCNamespace {
    Constants: VSCConstants;
    logger: VSCLogger;
    DomUtils: VSCDomUtils;

    // Class constructors - typed with actual class types
    VideoController: new (
      target: HTMLMediaElement,
      parent: HTMLElement,
      config: VSCVideoSpeedConfig,
      actionHandler: ActionHandler,
      shouldStartHidden?: boolean
    ) => VideoController;
    ActionHandler: new (config: VSCVideoSpeedConfig, eventManager: EventManager) => ActionHandler;
    EventManager: new (config: VSCVideoSpeedConfig, actionHandler: ActionHandler | null) => EventManager;
    StorageManager: {
      get(defaults?: Partial<VSCSettings>): Promise<VSCSettings>;
      set(data: Partial<VSCSettings>): Promise<void>;
      remove(keys: string[]): Promise<void>;
      clear(): Promise<void>;
      onChanged(callback: (changes: Record<string, chrome.storage.StorageChange>) => void): void;
      onError(callback: (error: Error, data?: unknown) => void): void;
    };
    StateManager: new () => VSCStateManager;
    VideoSpeedConfig: new () => VSCVideoSpeedConfig;
    ControlsManager: new (actionHandler: ActionHandler, config: VSCVideoSpeedConfig) => ControlsManager;
    ShadowDOMManager: {
      createShadowDOM(
        wrapper: HTMLElement,
        options: { top: string; left: string; speed: string; opacity: number; buttonSize: number }
      ): ShadowRoot;
      calculatePosition(video: HTMLMediaElement): { top: string; left: string };
      getSpeedIndicator(shadow: ShadowRoot): HTMLElement | null;
    };
    DragHandler: {
      handleDrag(video: HTMLMediaElement, event: Event): void;
      forceReset(): void;
    };
    VSCControllerElement: typeof HTMLElement;
    DebugHelper: new () => DebugHelper;
    BaseSiteHandler: typeof BaseSiteHandler;
    NetflixHandler: (typeof BaseSiteHandler & { matches(): boolean }) | undefined;
    YouTubeHandler: (typeof BaseSiteHandler & { matches(): boolean }) | undefined;
    FacebookHandler: (typeof BaseSiteHandler & { matches(): boolean }) | undefined;
    AmazonHandler: (typeof BaseSiteHandler & { matches(): boolean }) | undefined;
    AppleHandler: (typeof BaseSiteHandler & { matches(): boolean }) | undefined;
    MediaElementObserver: new (config: VSCVideoSpeedConfig, siteHandlerManager: VSCSiteHandlerManager) => MediaElementObserver;
    VideoMutationObserver: new (
      config: VSCVideoSpeedConfig,
      onFound: (video: HTMLMediaElement, parent: HTMLElement) => void,
      onRemoved: (video: HTMLMediaElement) => void,
      mediaObserver: MediaElementObserver | null
    ) => VideoMutationObserver;

    // Singleton instances
    stateManager: VSCStateManager;
    siteHandlerManager: VSCSiteHandlerManager;
    videoSpeedConfig: VSCVideoSpeedConfig;

    // Convenience aliases
    inIframe(): boolean;

    // Runtime state
    initialized: boolean;
    _authNonce: string;
  }

  // Forward-declare class shapes for circular reference resolution
  interface ActionHandler {
    readonly config: VSCVideoSpeedConfig;
    readonly eventManager: EventManager;
    runAction(action: string, value: number | null, e?: Event | null): void;
    adjustSpeed(video: HTMLMediaElement, speed: number, options?: AdjustSpeedOptions): void;
    resetSpeed(video: HTMLMediaElement, speed: number): void;
    setSpeed(video: HTMLMediaElement, speed: number): void;
    showController(div: HTMLElement): void;
  }

  interface EventManager {
    actionHandler: ActionHandler | null;
    setupEventListeners(doc: Document): void;
    setupKeyboardShortcuts(doc: Document): void;
    cleanup(doc: Document): void;
  }

  interface ControlsManager {
    setupControls(shadow: ShadowRoot, video: HTMLMediaElement): void;
  }

  interface DebugHelper {
    checkMedia(): void;
    checkControllers(): void;
    testPopupCommunication(): void;
  }

  interface Window {
    VSC: VSCNamespace;
    VSC_controller: VideoSpeedExtension;
    VSC_settings: Record<string, unknown> | undefined;
    vscDebugHelper: DebugHelper | undefined;
    vscDebug: DebugHelper | undefined;
    netflix?: {
      appContext: {
        state: {
          playerApp: {
            getAPI(): {
              videoPlayer: {
                getAllPlayerSessionIds(): string[];
                getCurrentTimeBySessionId(id: string): number;
                getVideoPlayerBySessionId(id: string): { seek(ms: number): void };
              };
            };
          };
        };
      };
    };
  }

  interface VideoSpeedExtension {
    initialized: boolean;
    actionHandler: ActionHandler | null;
    mediaObserver: MediaElementObserver | null;
  }
}

export {};
```

- [ ] **Step 4: Run typecheck to verify reduction in errors**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`
Expected: Significant reduction from 131 errors. Remaining errors will be fixed in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add src/types/
git commit -m "refactor: rebuild type system with proper types, remove unknown"
```

---

### Task 3: Fix Core Module Type Errors

**Files:**
- Modify: `src/core/action-handler.ts`
- Modify: `src/core/settings.ts`
- Modify: `src/core/state-manager.ts`
- Modify: `src/core/storage-manager.ts`
- Modify: `src/core/video-controller.ts`

- [ ] **Step 1: Fix action-handler.ts type references**

Replace type names:
- `VideoSpeedConfig` -> `VSCVideoSpeedConfig` (lines 6, 9)
- `EventManager` -> already in global scope via globals.d.ts
- Add `AdjustSpeedOptions` import or use global
- Add `VSCControllerElement` usage for div casts

Fix `adjustSpeed` signature to accept `AdjustSpeedOptions`:
```typescript
adjustSpeed(video: HTMLMediaElement, speed: number, options?: AdjustSpeedOptions): void {
```

Fix the `runAction` calls that pass 2 args where 1 expected - check the actual method signatures.

- [ ] **Step 2: Fix settings.ts missing type imports**

Add imports at top of `src/core/settings.ts`:
```typescript
import type { VSCSettings, KeyBinding } from '../types/settings.js';
```

Fix `save()` method signature that tries to pass `VSCSettings` to `Record<string, unknown>` - use proper StorageManager types.

Fix line 98 `.length` on `{}` - add proper type guard.
Fix line 241 implicit `any` on `item` parameter.
Fix line 316 implicit `any` on `x` parameter.

- [ ] **Step 3: Fix state-manager.ts missing types**

Add imports:
```typescript
import type { ControllerInfo } from '../types/controller.js';
```

Fix `VSCController` reference - should use the controller interface shape from ControllerInfo.

- [ ] **Step 4: Fix storage-manager.ts missing types**

Add imports:
```typescript
import type { VSCSettings } from '../types/settings.js';
```

Define `StorageChanges` type locally or import:
```typescript
type StorageChanges = Record<string, chrome.storage.StorageChange>;
```

Fix the `get()` method that expects 1 arg but gets 2 - align with chrome.storage.sync API.

- [ ] **Step 5: Fix video-controller.ts definite assignment**

For properties declared but not assigned in constructor (TS2564), use definite assignment assertion since they're assigned in a called method:

```typescript
video!: HTMLMediaElement;
parent!: HTMLElement;
```

Or better: assign in constructor directly from parameters.

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

- [ ] **Step 7: Commit**

```bash
git add src/core/
git commit -m "fix: resolve type errors in core modules"
```

---

### Task 4: Fix Observer Type Errors

**Files:**
- Modify: `src/observers/media-observer.ts`
- Modify: `src/observers/mutation-observer.ts`

- [ ] **Step 1: Fix media-observer.ts**

The `VSCConfig` and `VSCSiteHandler` types are now global aliases. The `noUncheckedIndexedAccess` errors need bounds-checked array access:

For every `array[i]` access, add non-null assertion or guard:
```typescript
// Before:
seen.add(regularMedia[i]);
// After:
const el = regularMedia[i];
if (el) {
  seen.add(el);
  mediaElements.push(el as HTMLMediaElement);
}
```

Fix `frameTags[i].contentDocument` - add null check.
Fix `HTMLAudioElement.disabled` - remove, it doesn't exist. Use `media.getAttribute('disabled') !== null` instead.
Fix `findControllerParent` null check on `video.parentElement`.

- [ ] **Step 2: Fix mutation-observer.ts**

Same `noUncheckedIndexedAccess` pattern. Fix all array accesses.
Add `VSCMediaElement` - now a global type alias.
Fix `mutations[i]` access with null guard.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

- [ ] **Step 4: Commit**

```bash
git add src/observers/
git commit -m "fix: resolve type errors in observer modules"
```

---

### Task 5: Fix Site Handler Type Errors

**Files:**
- Modify: `src/site-handlers/base-handler.ts`
- Modify: `src/site-handlers/index.ts`
- Modify: `src/site-handlers/scripts/netflix.ts`
- Modify: All other handler files

- [ ] **Step 1: Fix base-handler.ts**

Remove the duplicate `ControllerPosition` and `ISiteHandler` interfaces - import from types instead:

```typescript
import type { ControllerPosition } from '../types/controller.js';
import type { ISiteHandler } from '../types/site-handler.js';
```

Update `ControllerPosition` usage - `insertionPoint` and `targetParent` now accept `Node`.

Fix `detectSpecialVideos` parameter to accept `Document | ShadowRoot`.

- [ ] **Step 2: Fix all handler files**

Update imports in netflix-handler.ts, youtube-handler.ts, facebook-handler.ts, amazon-handler.ts, apple-handler.ts to import from types instead of base-handler.ts:

```typescript
import type { ControllerPosition } from '../types/controller.js';
import { BaseSiteHandler } from './base-handler.js';
```

Fix `detectSpecialVideos(doc: Document)` to `detectSpecialVideos(root: Document | ShadowRoot)` in youtube-handler.ts and apple-handler.ts.

- [ ] **Step 3: Fix netflix.ts window.netflix type**

The `window.netflix` type is now defined in globals.d.ts. Remove the `!` non-null assertion and add a proper guard:

```typescript
if (!window.netflix) return;
const videoPlayer = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
```

- [ ] **Step 4: Fix index.ts SiteHandlerManager assignment**

The `VSCSiteHandlerManager` interface now uses `BaseSiteHandler` instead of `ISiteHandler`, matching the actual implementation.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

- [ ] **Step 6: Commit**

```bash
git add src/site-handlers/
git commit -m "fix: resolve type errors in site handlers"
```

---

### Task 6: Fix UI Module Type Errors

**Files:**
- Modify: `src/ui/controls.ts`
- Modify: `src/ui/drag-handler.ts`
- Modify: `src/ui/options/options.ts`

- [ ] **Step 1: Fix controls.ts**

`ActionHandler` and `VSCConfig` are now global type aliases. Verify they resolve.

- [ ] **Step 2: Fix drag-handler.ts**

`VSCVideoElement` is now a global type alias. Verify it resolves.

- [ ] **Step 3: Fix options.ts**

Fix unused `_debouncedSave` variable (TS6133) - either use it or remove.

Fix event handler type narrowing (TS2345) - cast event handlers properly:
```typescript
// Before:
input.addEventListener('keydown', (e: KeyboardEvent) => { ... });
// After:
input.addEventListener('keydown', ((e: KeyboardEvent) => { ... }) as EventListener);
```

Or better, accept `Event` and narrow inside:
```typescript
input.addEventListener('keydown', (e: Event) => {
  const ke = e as KeyboardEvent;
  // use ke
});
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

- [ ] **Step 5: Commit**

```bash
git add src/ui/
git commit -m "fix: resolve type errors in UI modules"
```

---

### Task 7: Fix Utility Module Type Errors

**Files:**
- Modify: `src/utils/constants.ts`
- Modify: `src/utils/debug-helper.ts`
- Modify: `src/utils/dom-utils.ts`
- Modify: `src/utils/event-manager.ts`

- [ ] **Step 1: Fix constants.ts**

Fix readonly array assignment (TS4104):
```typescript
// The CUSTOM_ACTIONS_NO_VALUES is readonly string[] but assigned to string[]
// Fix by making the type accept readonly:
CUSTOM_ACTIONS_NO_VALUES: readonly string[];  // already in globals.d.ts
```
Ensure the constant definition uses `as const` or `readonly`.

- [ ] **Step 2: Fix debug-helper.ts**

Remove the incorrect local `VSCMediaElement` interface (lines 8-13). Use the global `VSCMediaElement` type alias instead.

Fix property access on `{}` type - the `window.VSC` properties `mediaObserver` and `actionHandler` need proper typing from globals.d.ts.

- [ ] **Step 3: Fix dom-utils.ts**

Fix `VSCConstants` to `Record<string, unknown>` conversion errors - add index signature to VSCConstants (already done in new globals.d.ts via `[key: string]: unknown`).

Fix `Object is possibly undefined` on array access - add null guards.

- [ ] **Step 4: Fix event-manager.ts**

Fix `VSCDomUtils` and `VSCConstants` conversion errors - add index signatures (already done in new globals.d.ts).

Fix EventManager constructor assignment to `window.VSC.EventManager` - types should now match.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

- [ ] **Step 6: Commit**

```bash
git add src/utils/
git commit -m "fix: resolve type errors in utility modules"
```

---

### Task 8: Fix Entry Point and Content Script Type Errors

**Files:**
- Modify: `src/content/inject.ts`
- Modify: `src/content/injection-bridge.ts`
- Modify: `src/background.ts`
- Modify: `src/entries/inject-entry.ts`

- [ ] **Step 1: Fix inject.ts**

With globals.d.ts rebuilt, `VSCActionHandler`, `VSCEventManager`, `VSCVideoMutationObserver`, `VSCMediaElementObserver` are now global type aliases.

Remove unused `MESSAGE_TYPES` property (line 31) - it's assigned but never read.

Fix `this condition will always be true` (TS2774) - call the function:
```typescript
// Before:
if (this.initializeWhenReady) {  // always true, it's a function
// After - just call it directly, remove the guard:
this.initializeWhenReady(document, (doc: Document) => { ... });
```

Fix implicit `any` on `media` parameter in forEach callbacks - add type:
```typescript
lightMedia.forEach((media: HTMLMediaElement) => { ... });
```

Fix `video.vsc` assignment (line 279) - with proper return type from VideoController constructor.

Fix `.remove()` on VSCAttachment - add `remove()` method to VSCAttachment interface or use the controller's remove method.

Change `actionHandler` from `private` to public (or use a getter) so the IIFE message handler can access it.

Fix `window.VSC_controller` assignment - now typed as `VideoSpeedExtension` interface.

- [ ] **Step 2: Fix injection-bridge.ts**

Fix `chrome.runtime.MessageSender` - now provided by @types/chrome.
Fix message handler type - accept `unknown` and narrow:
```typescript
chrome.runtime.onMessage.addListener(
  (request: unknown, _sender, sendResponse) => {
    const msg = request as VSCRuntimeMessage;
    // ...
  }
);
```

- [ ] **Step 3: Fix background.ts**

Fix `IconPaths` index signature - add `[key: string]: string`:
```typescript
const path: Record<string, string> = { ... };
```

Fix `chrome.runtime.MessageSender` - now from @types/chrome.

Fix message handler type narrowing.

- [ ] **Step 4: Fix inject-entry.ts imports**

Change `.js` imports to `.ts` or remove extensions (esbuild resolves both):
```typescript
import '../utils/constants';
import '../utils/logger';
// etc.
```

- [ ] **Step 5: Run typecheck - expect 0 errors**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`
Expected: 0

- [ ] **Step 6: Commit**

```bash
git add src/content/ src/background.ts src/entries/
git commit -m "fix: resolve all remaining type errors"
```

---

### Task 9: Bug Fixes

**Files:**
- Modify: `src/utils/event-manager.ts`
- Modify: `src/content/inject.ts`
- Modify: `src/core/video-controller.ts`

- [ ] **Step 1: Add cleanup method to EventManager**

The EventManager stores listeners in a Map but never removes them. Add a `cleanup` method:

```typescript
cleanup(doc: Document): void {
  const entries = this._listeners.get(doc);
  if (entries) {
    for (const entry of entries) {
      doc.removeEventListener(entry.type, entry.handler, entry.options);
    }
    this._listeners.delete(doc);
  }
}
```

- [ ] **Step 2: Fix duplicate variable declaration in inject.ts**

Line 226-227 has duplicate `const hostname = window.location.hostname;`. Remove the duplicate.

- [ ] **Step 3: Fix duplicate console.error in inject.ts**

Lines 287-288 have duplicate `console.error('Failed to attach controller to video:', error);`. Remove the duplicate.

- [ ] **Step 4: Fix duplicate appendChild in inject.ts**

Lines 319-320 have duplicate `document.head.appendChild(link);`. Remove the duplicate.

- [ ] **Step 5: Replace non-null assertions with proper guards in action-handler.ts**

Replace `video.vsc!.div` patterns with safe access:
```typescript
const attachment = video.vsc;
if (!attachment) return;
const div = attachment.div;
```

- [ ] **Step 6: Run tests**

Run: `npm run build && npm run test:unit`

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "fix: memory leak in EventManager, duplicate code, null safety"
```

---

### Task 10: Dead Code Removal and Code Quality

**Files:**
- Modify: `src/content/inject.ts`
- Modify: `src/background.ts`
- Modify: `src/core/storage-manager.ts`
- Modify: Various files

- [ ] **Step 1: Remove unused MESSAGE_TYPES from inject.ts**

Delete the `MESSAGE_TYPES` property declaration and assignment since it's never read.

- [ ] **Step 2: Replace console.log/error with logger in background.ts**

Since background.ts runs in service worker context without window.VSC.logger, console calls are appropriate here. Add a comment explaining why.

- [ ] **Step 3: Replace console.error with logger in storage-manager.ts**

Replace direct `console.error()` calls with `window.VSC.logger.error()` where logger is available.

- [ ] **Step 4: Remove unused _debouncedSave in options.ts**

If `_debouncedSave` is assigned but never used, either wire it up or remove it.

- [ ] **Step 5: Run full build and tests**

Run: `npm run build && npm test`

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "cleanup: remove dead code, standardize logging"
```

---

### Task 11: Build Pipeline and Final Verification

**Files:**
- Modify: `package.json`
- Modify: `.pre-commit-config.yaml`

- [ ] **Step 1: Add typecheck to build pipeline**

In `package.json`, update the build script to include typecheck:
```json
"build": "tsc --noEmit && node scripts/build.mjs",
```

- [ ] **Step 2: Update pre-commit config versions**

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files

  - repo: https://github.com/prettier/prettier
    rev: v3.5.3
    hooks:
      - id: prettier
```

- [ ] **Step 3: Run full verification**

```bash
npm run typecheck  # 0 errors
npm run lint       # No parsing errors
npm run build      # Clean build
npm test           # Tests pass
```

- [ ] **Step 4: Commit**

```bash
git add package.json .pre-commit-config.yaml
git commit -m "chore: add typecheck to build, update pre-commit versions"
```

---

### Task 12: Final Type Audit - Zero any/unknown

**Files:**
- All `src/**/*.ts` files

- [ ] **Step 1: Grep for remaining `any` usage**

Run: `grep -rn ': any' src/ --include='*.ts'`
Run: `grep -rn 'as any' src/ --include='*.ts'`

Fix any occurrences by replacing with proper types.

- [ ] **Step 2: Grep for ts-ignore/ts-expect-error**

Run: `grep -rn '@ts-ignore\|@ts-expect-error' src/ --include='*.ts'`

Remove any occurrences and fix the underlying type issue.

- [ ] **Step 3: Grep for remaining `unknown` in constructors**

Run: `grep -n 'unknown' src/types/globals.d.ts`

Ensure only legitimate uses of `unknown` remain (e.g., `chrome.runtime.sendMessage` parameter).

- [ ] **Step 4: Final typecheck and build**

```bash
npm run typecheck && npm run build && npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "refactor: achieve strict typing - zero any, zero ts-ignore"
```
