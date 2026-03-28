/**
 * Event management system for Video Speed Controller
 */

import type { AdjustSpeedOptions } from '../types/controller.js';

interface ListenerEntry {
  readonly type: string;
  readonly handler: EventListener;
  readonly useCapture: boolean;
}

export class EventManager {
  static readonly COOLDOWN_MS: number = 200;

  config: VSCVideoSpeedConfig;
  actionHandler: VSCActionHandlerInterface | null;
  timer: ReturnType<typeof setTimeout> | null;
  private readonly _listeners: Map<Document, ListenerEntry[]>;
  private _coolDownActive: boolean;
  private _coolDownTimer: ReturnType<typeof setTimeout> | null;
  private readonly _showTimers: WeakMap<Element, ReturnType<typeof setTimeout>>;
  private _lastKeyEventSignature: string | null;

  constructor(config: VSCVideoSpeedConfig, actionHandler: VSCActionHandlerInterface | null) {
    this.config = config;
    this.actionHandler = actionHandler;
    this.timer = null;
    this._listeners = new Map();
    this._coolDownActive = false;
    this._coolDownTimer = null;
    this._showTimers = new WeakMap();
    this._lastKeyEventSignature = null;
  }

  /**
   * Set up all event listeners
   */
  setupEventListeners(doc: Document): void {
    this.setupKeyboardShortcuts(doc);
    this.setupRateChangeListener(doc);
  }

  /**
   * Set up keyboard shortcuts
   */
  setupKeyboardShortcuts(doc: Document): void {
    const docs: Document[] = [doc];

    try {
      if (window.VSC.DomUtils &&
        typeof (window.VSC.DomUtils as Record<string, unknown>).inIframe === 'function' &&
        (window.VSC.DomUtils as { inIframe: () => boolean }).inIframe()
      ) {
        docs.push(window.top!.document);
      }
    } catch {
      // Cross-origin iframe - ignore
    }

    docs.forEach((d) => {
      const keydownHandler = (event: Event): void => {
        this.handleKeydown(event as KeyboardEvent);
      };
      d.addEventListener('keydown', keydownHandler, true);

      if (!this._listeners.has(d)) {
        this._listeners.set(d, []);
      }
      this._listeners.get(d)!.push({
        type: 'keydown',
        handler: keydownHandler,
        useCapture: true,
      });
    });
  }

  /**
   * Handle keydown events
   */
  handleKeydown(event: KeyboardEvent): false | void {
    const keyCode = event.keyCode;

    const eventSignature = `${keyCode}_${event.timeStamp}_${event.type}`;

    if (this._lastKeyEventSignature === eventSignature) {
      return;
    }

    this._lastKeyEventSignature = eventSignature;

    if (this.hasActiveModifier(event)) {
      return;
    }

    if (this.isTypingContext(event.target as Element)) {
      return false;
    }

    const stateManager = window.VSC.stateManager as
      | { hasControllers(): boolean }
      | undefined;
    if (!stateManager?.hasControllers()) {
      return false;
    }

    const keyBinding = this.config.getKeyBindingByKey(keyCode);

    if (keyBinding) {
      this.actionHandler?.runAction(keyBinding.action, keyBinding.value, event);

      if (keyBinding.force === true) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    return false;
  }

  /**
   * Check if any modifier keys are active
   */
  private hasActiveModifier(event: KeyboardEvent): boolean {
    return (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (typeof event.getModifierState === 'function' &&
        (event.getModifierState('Fn') ||
          event.getModifierState('Hyper') ||
          event.getModifierState('OS')))
    );
  }

  /**
   * Check if user is typing in an input context
   */
  private isTypingContext(target: Element): boolean {
    return (
      target.nodeName === 'INPUT' ||
      target.nodeName === 'TEXTAREA' ||
      (target as HTMLElement).isContentEditable
    );
  }

  /**
   * Set up rate change event listener
   */
  private setupRateChangeListener(doc: Document): void {
    const rateChangeHandler = (event: Event): void => {
      this.handleRateChange(event);
    };
    doc.addEventListener('ratechange', rateChangeHandler, true);

    if (!this._listeners.has(doc)) {
      this._listeners.set(doc, []);
    }
    this._listeners.get(doc)!.push({
      type: 'ratechange',
      handler: rateChangeHandler,
      useCapture: true,
    });
  }

  /**
   * Handle rate change events
   */
  handleRateChange(event: Event): void {
    if (this._coolDownActive) {
      const video = (event.composedPath ? event.composedPath()[0] : event.target) as
        | HTMLMediaElement
        | undefined;

      if (video && video.vsc && video.vsc.expectedSpeed !== null) {
        const expectedSpeed = video.vsc.expectedSpeed as number;
        if (Math.abs(video.playbackRate - expectedSpeed) > 0.001) {
          video.playbackRate = expectedSpeed;
        }
      }

      event.stopImmediatePropagation();
      return;
    }

    const video = (event.composedPath ? event.composedPath()[0] : event.target) as
      | HTMLMediaElement
      | undefined;

    if (!video?.vsc) {
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

    const rawExternalRate =
      typeof video.playbackRate === 'number' ? video.playbackRate : NaN;
    const constants = window.VSC.Constants as Record<string, unknown>;
    const speedLimits = constants.SPEED_LIMITS as { MIN: number; MAX: number };
    const min = speedLimits.MIN;
    if (!isNaN(rawExternalRate) && rawExternalRate <= min) {
      event.stopImmediatePropagation();
      return;
    }

    if (this.actionHandler) {
      const options: AdjustSpeedOptions = { source: 'external' };
      this.actionHandler.adjustSpeed(video, video.playbackRate, options);
    }

    event.stopImmediatePropagation();
  }

  /**
   * Start cooldown period to prevent event spam
   */
  refreshCoolDown(): void {
    if (this._coolDownTimer) {
      clearTimeout(this._coolDownTimer);
    }

    this._coolDownActive = true;

    this._coolDownTimer = setTimeout(() => {
      this._coolDownActive = false;
      this._coolDownTimer = null;
    }, EventManager.COOLDOWN_MS);
  }

  /**
   * Show controller temporarily during speed changes or other automatic actions
   */
  showController(controller: Element): void {
    if (
      this.config.settings.startHidden &&
      !controller.classList.contains('vsc-manual')
    ) {
      return;
    }

    controller.classList.add('vsc-show');

    const existingTimer = this._showTimers.get(controller);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this._showTimers.set(
      controller,
      setTimeout(() => {
        controller.classList.remove('vsc-show');
        this._showTimers.delete(controller);
      }, 2000)
    );
  }

  /**
   * Clean up all event listeners
   */
  cleanup(): void {
    this._listeners.forEach((eventList, doc) => {
      eventList.forEach(({ type, handler, useCapture }) => {
        try {
          doc.removeEventListener(type, handler, useCapture);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          window.VSC.logger?.warn(`Failed to remove event listener: ${message}`);
        }
      });
    });

    this._listeners.clear();

    if (this._coolDownTimer) {
      clearTimeout(this._coolDownTimer);
      this._coolDownTimer = null;
      this._coolDownActive = false;
    }
  }
}

// Runtime namespace assignment
window.VSC = window.VSC || ({} as VSCNamespace);
window.VSC.EventManager = EventManager;
