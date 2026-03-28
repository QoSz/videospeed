/**
 * Action handling system for Video Speed Controller
 */

import type { AdjustSpeedOptions } from '../types/controller.js';

class ActionHandler {
  readonly config: VSCVideoSpeedConfig;
  readonly eventManager: VSCEventManagerInterface;

  constructor(config: VSCVideoSpeedConfig, eventManager: VSCEventManagerInterface) {
    this.config = config;
    this.eventManager = eventManager;
  }

  /**
   * Execute an action on media elements
   */
  runAction(action: string, value: number | null, e?: Event | KeyboardEvent | null): void {
    // Use state manager for complete media discovery (includes shadow DOM)
    const mediaTags: HTMLMediaElement[] = window.VSC.stateManager
      ? window.VSC.stateManager.getAllMediaElements()
      : []; // No fallback - state manager should always be available

    // Get the controller that was used if called from a button press event
    let targetController: HTMLElement | null = null;
    if (e && e.target) {
      const rootNode = (e.target as Node).getRootNode();
      // Only get host if rootNode is a ShadowRoot (not Document)
      // Use duck-typing check instead of instanceof to work in both browser and JSDOM tests
      const isShadowRoot =
        rootNode && (rootNode as ShadowRoot).host && rootNode !== document;
      targetController = isShadowRoot ? (rootNode as ShadowRoot).host as HTMLElement : null;
    }

    mediaTags.forEach((v) => {
      const controller = v.vsc?.div;

      if (!controller) {
        return;
      }

      // Don't change video speed if the video has a different controller
      // Only apply this check for button clicks (when targetController is set)
      if (e && targetController && !(targetController === controller)) {
        return;
      }

      if (!v.classList.contains('vsc-cancelled')) {
        this.executeAction(action, value ?? 0, v, e ?? undefined);
      }
    });
  }

  /**
   * Execute specific action on a video element
   */
  executeAction(action: string, value: number, video: HTMLMediaElement, e?: Event): void {
    const attachment = video.vsc;
    if (!attachment) {
      return;
    }

    switch (action) {
      case 'rewind':
        this.eventManager.showController(attachment.div);
        this.seek(video, -value);
        break;

      case 'advance':
        this.eventManager.showController(attachment.div);
        this.seek(video, value);
        break;

      case 'faster': {
        this.adjustSpeed(video, value, { relative: true });
        break;
      }

      case 'slower': {
        this.adjustSpeed(video, -value, { relative: true });
        break;
      }

      case 'reset':
        this.resetSpeed(video, value);
        break;

      case 'display': {
        const controller = attachment.div as VSCControllerElement;

        if (!controller) {
          window.VSC.logger.error('No controller found for video');
          return;
        }

        controller.classList.add('vsc-manual');
        controller.classList.toggle('vsc-hidden');

        // Clear any pending timers that might interfere with manual toggle
        // This prevents delays when manually hiding/showing the controller
        if (controller.blinkTimeOut !== undefined) {
          clearTimeout(controller.blinkTimeOut);
          controller.blinkTimeOut = undefined;
        }

        // Also clear EventManager timer if it exists
        if (this.eventManager && this.eventManager.timer) {
          clearTimeout(this.eventManager.timer);
          this.eventManager.timer = null;
        }

        // Remove vsc-show class immediately when manually hiding
        if (controller.classList.contains('vsc-hidden')) {
          controller.classList.remove('vsc-show');
        }
        break;
      }

      case 'blink':
        this.blinkController(attachment.div, value, video);
        break;

      case 'drag':
        window.VSC.DragHandler.handleDrag(video, e!);
        break;

      case 'fast':
        this.resetSpeed(video, value);
        break;

      case 'pause':
        this.eventManager.showController(attachment.div);
        this.pause(video);
        break;

      case 'muted':
        this.eventManager.showController(attachment.div);
        this.muted(video);
        break;

      case 'louder':
        this.eventManager.showController(attachment.div);
        this.volumeUp(video, value);
        break;

      case 'softer':
        this.eventManager.showController(attachment.div);
        this.volumeDown(video, value);
        break;

      case 'mark':
        this.eventManager.showController(attachment.div);
        this.setMark(video);
        break;

      case 'jump':
        this.eventManager.showController(attachment.div);
        this.jumpToMark(video);
        break;

      case 'SET_SPEED':
        window.VSC.logger.info(`Setting speed to: ${value}`);
        this.adjustSpeed(video, value, { source: 'internal' });
        break;

      case 'ADJUST_SPEED':
        window.VSC.logger.info(`Adjusting speed by: ${value}`);
        this.adjustSpeed(video, value, { relative: true, source: 'internal' });
        break;

      case 'RESET_SPEED': {
        window.VSC.logger.info('Resetting speed');
        const preferredSpeed = (this.config.getKeyBinding('fast') as number) || 1.0;
        this.adjustSpeed(video, preferredSpeed, { source: 'internal' });
        break;
      }

      default:
        window.VSC.logger.warn(`Unknown action: ${action}`);
    }
  }

  /**
   * Seek video by specified seconds
   */
  seek(video: HTMLMediaElement, seekSeconds: number): void {
    // Use site-specific seeking (handlers return true if they handle it)
    window.VSC.siteHandlerManager.handleSeek(video, seekSeconds);
  }

  /**
   * Toggle pause/play
   */
  pause(video: HTMLMediaElement): void {
    if (video.paused) {
      window.VSC.logger.debug('Resuming video');
      video.play();
    } else {
      window.VSC.logger.debug('Pausing video');
      video.pause();
    }
  }

  /**
   * Reset speed with memory toggle functionality
   */
  resetSpeed(video: HTMLMediaElement, target: number): void {
    if (!video.vsc) {
      window.VSC.logger.warn('resetSpeed called on video without controller');
      return;
    }

    const currentSpeed = video.playbackRate;

    if (currentSpeed === target) {
      // At target speed - restore remembered speed if we have one, otherwise reset to target
      if (video.vsc.speedBeforeReset !== null) {
        window.VSC.logger.info(`Restoring remembered speed: ${video.vsc.speedBeforeReset}`);
        const rememberedSpeed = video.vsc.speedBeforeReset;
        video.vsc.speedBeforeReset = null; // Clear memory after use
        this.adjustSpeed(video, rememberedSpeed);
      } else {
        window.VSC.logger.info(`Already at reset speed ${target}, no change`);
        // Already at target and nothing remembered - no action needed
      }
    } else {
      // Not at target speed - remember current and reset to target
      window.VSC.logger.info(`Remembering speed ${currentSpeed} and resetting to ${target}`);
      video.vsc.speedBeforeReset = currentSpeed;
      this.adjustSpeed(video, target);
    }
  }

  /**
   * Toggle mute
   */
  muted(video: HTMLMediaElement): void {
    video.muted = video.muted !== true;
  }

  /**
   * Increase volume
   */
  volumeUp(video: HTMLMediaElement, value: number): void {
    video.volume = Math.min(1, Number((video.volume + value).toFixed(2)));
  }

  /**
   * Decrease volume
   */
  volumeDown(video: HTMLMediaElement, value: number): void {
    video.volume = Math.max(0, Number((video.volume - value).toFixed(2)));
  }

  /**
   * Set time marker
   */
  setMark(video: HTMLMediaElement): void {
    const attachment = video.vsc;
    if (!attachment) { return; }
    window.VSC.logger.debug('Adding marker');
    attachment.mark = video.currentTime;
  }

  /**
   * Jump to time marker
   */
  jumpToMark(video: HTMLMediaElement): void {
    const attachment = video.vsc;
    if (!attachment) { return; }
    window.VSC.logger.debug('Recalling marker');
    if (typeof attachment.mark === 'number') {
      video.currentTime = attachment.mark;
    }
  }

  /**
   * Show controller briefly
   */
  blinkController(
    controller: VSCControllerElement,
    duration: number | undefined,
    video: HTMLMediaElement
  ): void {
    // Don't hide audio controllers after blinking - audio elements are often invisible by design
    // but should maintain visible controllers for user interaction
    const isAudioController = video.tagName === 'AUDIO';

    // Always clear any existing timeout first
    if (controller.blinkTimeOut !== undefined) {
      clearTimeout(controller.blinkTimeOut);
      controller.blinkTimeOut = undefined;
    }

    // Add vsc-show class to temporarily show controller
    // This overrides vsc-hidden via CSS specificity
    controller.classList.add('vsc-show');

    // For audio controllers, don't set timeout to hide again
    if (!isAudioController) {
      controller.blinkTimeOut = setTimeout(
        () => {
          controller.classList.remove('vsc-show');
          controller.blinkTimeOut = undefined;
        },
        duration ? duration : 2500
      );
    }
  }

  /**
   * Adjust video playback speed (absolute or relative)
   * Simplified to use proven working logic from setSpeed method
   */
  adjustSpeed(video: HTMLMediaElement, value: number, options: AdjustSpeedOptions = {}): void {
    if (!video || !video.vsc) {
      return;
    }
    if (typeof value !== 'number' || isNaN(value)) {
      return;
    }
    this._adjustSpeedInternal(video, value, options);
  }

  /**
   * Internal adjustSpeed implementation (context already set)
   */
  private _adjustSpeedInternal(
    video: HTMLMediaElement,
    value: number,
    options: AdjustSpeedOptions
  ): void {
    const { relative = false, source = 'internal' } = options;

    let targetSpeed: number;
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

  /**
   * Set video playback speed with complete state management
   * Unified implementation with all functionality - no fragmented logic
   */
  setSpeed(video: HTMLMediaElement, speed: number): void {
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

  /**
   * Show the controller element (delegates to eventManager)
   */
  showController(div: HTMLElement): void {
    this.eventManager.showController(div);
  }
}

// Export to window.VSC namespace
window.VSC.ActionHandler = ActionHandler;

export { ActionHandler };
