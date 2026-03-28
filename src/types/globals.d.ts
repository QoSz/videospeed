/**
 * Global type augmentations for Video Speed Controller
 */

import type { VSCAttachment, ControllerInfo, ControllerPosition, AdjustSpeedOptions } from './controller.js';
import type { VSCSettings, KeyBinding, SpeedLimits, ControllerSizeLimits } from './settings.js';
import type { VideoController } from '../core/video-controller.js';
import type { MediaElementObserver } from '../observers/media-observer.js';
import type { VideoMutationObserver } from '../observers/mutation-observer.js';
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

  /** Alias for site handler manager (used by media observer) */
  type VSCSiteHandler = VSCSiteHandlerManager;

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
    registerController(controller: { controllerId: string; video: HTMLMediaElement; remove(): void }): void;
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
    getKeyBinding(action: string, property?: string): KeyBinding[keyof KeyBinding] | undefined;
    getKeyBindingByKey(keyCode: number): KeyBinding | undefined;
    setKeyBinding(action: string, value: number): void;
  }

  // ── Forward-declared class interfaces ──

  interface VSCActionHandlerInterface {
    readonly config: VSCVideoSpeedConfig;
    readonly eventManager: VSCEventManagerInterface;
    runAction(action: string, value: number | null, e?: Event | KeyboardEvent | null): void;
    adjustSpeed(video: HTMLMediaElement, speed: number, options?: AdjustSpeedOptions): void;
    resetSpeed(video: HTMLMediaElement, speed: number): void;
    setSpeed(video: HTMLMediaElement, speed: number): void;
    showController(div: HTMLElement): void;
  }

  interface VSCEventManagerInterface {
    config: VSCVideoSpeedConfig;
    actionHandler: VSCActionHandlerInterface | null;
    timer: ReturnType<typeof setTimeout> | null;
    setupEventListeners(doc: Document): void;
    cleanup(): void;
    refreshCoolDown(): void;
    showController(controller: Element): void;
  }

  interface VSCControlsManagerInterface {
    setupControls(shadow: ShadowRoot, video: HTMLMediaElement): void;
  }

  interface VSCDebugHelperInterface {
    isActive: boolean;
    enable(): void;
    checkMedia(): void;
    checkMediaElements(): void;
    checkControllers(): void;
    testPopupCommunication(): void;
    testPopupMessageBridge(): void;
    forceShowControllers(): number;
    forceShowAudioControllers(): number;
    getElementVisibility(element: Element): {
      connected: boolean;
      display: string;
      visibility: string;
      opacity: string;
      width: number;
      height: number;
      isVisible: boolean;
    };
    monitorControllerChanges(): MutationObserver;
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
      actionHandler: VSCActionHandlerInterface,
      shouldStartHidden?: boolean
    ) => VideoController;
    ActionHandler: new (config: VSCVideoSpeedConfig, eventManager: VSCEventManagerInterface) => VSCActionHandlerInterface;
    EventManager: new (config: VSCVideoSpeedConfig, actionHandler: VSCActionHandlerInterface | null) => VSCEventManagerInterface;
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
    ControlsManager: new (actionHandler: VSCActionHandlerInterface, config: VSCVideoSpeedConfig) => VSCControlsManagerInterface;
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
    DebugHelper: new () => VSCDebugHelperInterface;
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

  interface VideoSpeedExtension {
    initialized: boolean;
    actionHandler: VSCActionHandlerInterface | null;
    mediaObserver: MediaElementObserver | null;
  }

  interface Window {
    VSC: VSCNamespace;
    VSC_controller: VideoSpeedExtension;
    VSC_settings: Record<string, unknown> | undefined;
    vscDebugHelper: VSCDebugHelperInterface | undefined;
    vscDebug: VSCDebugHelperInterface | undefined;
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
}

export {};
