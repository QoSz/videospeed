/**
 * Action handling system for Video Speed Controller
 * 
 */

window.VSC = window.VSC || {};

class ActionHandler {
  constructor(config, eventManager) {
    this.config = config;
    this.eventManager = eventManager;
  }

  /**
   * Execute an action on media elements
   * @param {string} action - Action to perform
   * @param {*} value - Action value
   * @param {Event} e - Event object (optional)
   */
  runAction(action, value, e) {
    // Use state manager for complete media discovery (includes shadow DOM)
    const mediaTags = window.VSC.stateManager ?
      window.VSC.stateManager.getAllMediaElements() :
      []; // No fallback - state manager should always be available

    // Get the controller that was used if called from a button press event
    let targetController = null;
    if (e && e.target) {
      const rootNode = e.target.getRootNode();
      // Only get host if rootNode is a ShadowRoot (not Document)
      // Use duck-typing check instead of instanceof to work in both browser and JSDOM tests
      const isShadowRoot = rootNode && rootNode.host && rootNode !== document;
      targetController = isShadowRoot ? rootNode.host : null;
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
        this.executeAction(action, value, v, e);
      }
    });
  }

  /**
   * Execute specific action on a video element
   * @param {string} action - Action to perform
   * @param {*} value - Action value
   * @param {HTMLMediaElement} video - Video element
   * @param {Event} e - Event object (optional)
   * @private
   */
  executeAction(action, value, video, e) {
    switch (action) {
      case 'rewind':
        this.eventManager.showController(video.vsc.div);
        this.seek(video, -value);
        break;

      case 'advance':
        this.eventManager.showController(video.vsc.div);
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
        const controller = video.vsc.div;

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
        this.blinkController(video.vsc.div, value, video);
        break;

      case 'drag':
        window.VSC.DragHandler.handleDrag(video, e);
        break;

      case 'fast':
        this.resetSpeed(video, value);
        break;

      case 'pause':
        this.eventManager.showController(video.vsc.div);
        this.pause(video);
        break;

      case 'muted':
        this.eventManager.showController(video.vsc.div);
        this.muted(video);
        break;

      case 'louder':
        this.eventManager.showController(video.vsc.div);
        this.volumeUp(video, value);
        break;

      case 'softer':
        this.eventManager.showController(video.vsc.div);
        this.volumeDown(video, value);
        break;

      case 'mark':
        this.eventManager.showController(video.vsc.div);
        this.setMark(video);
        break;

      case 'jump':
        this.eventManager.showController(video.vsc.div);
        this.jumpToMark(video);
        break;

      case 'SET_SPEED':
        window.VSC.logger.info('Setting speed to:', value);
        this.adjustSpeed(video, value, { source: 'internal' });
        break;

      case 'ADJUST_SPEED':
        window.VSC.logger.info('Adjusting speed by:', value);
        this.adjustSpeed(video, value, { relative: true, source: 'internal' });
        break;

      case 'RESET_SPEED': {
        window.VSC.logger.info('Resetting speed');
        const preferredSpeed = this.config.getKeyBinding('fast') || 1.0;
        this.adjustSpeed(video, preferredSpeed, { source: 'internal' });
        break;
      }

      default:
        window.VSC.logger.warn(`Unknown action: ${action}`);
    }
  }

  /**
   * Seek video by specified seconds
   * @param {HTMLMediaElement} video - Video element
   * @param {number} seekSeconds - Seconds to seek
   */
  seek(video, seekSeconds) {
    // Use site-specific seeking (handlers return true if they handle it)
    window.VSC.siteHandlerManager.handleSeek(video, seekSeconds);
  }

  /**
   * Toggle pause/play
   * @param {HTMLMediaElement} video - Video element
   */
  pause(video) {
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
   * @param {HTMLMediaElement} video - Video element
   * @param {number} target - Target speed (usually 1.0)
   */
  resetSpeed(video, target) {
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
   * @param {HTMLMediaElement} video - Video element
   */
  muted(video) {
    video.muted = video.muted !== true;
  }

  /**
   * Increase volume
   * @param {HTMLMediaElement} video - Video element
   * @param {number} value - Amount to increase
   */
  volumeUp(video, value) {
    video.volume = Math.min(1, Number((video.volume + value).toFixed(2)));
  }

  /**
   * Decrease volume
   * @param {HTMLMediaElement} video - Video element
   * @param {number} value - Amount to decrease
   */
  volumeDown(video, value) {
    video.volume = Math.max(0, Number((video.volume - value).toFixed(2)));
  }

  /**
   * Set time marker
   * @param {HTMLMediaElement} video - Video element
   */
  setMark(video) {
    window.VSC.logger.debug('Adding marker');
    video.vsc.mark = video.currentTime;
  }

  /**
   * Jump to time marker
   * @param {HTMLMediaElement} video - Video element
   */
  jumpToMark(video) {
    window.VSC.logger.debug('Recalling marker');
    if (typeof video.vsc.mark === 'number') {
      video.currentTime = video.vsc.mark;
    }
  }

  /**
   * Show controller briefly
   * @param {HTMLElement} controller - Controller element
   * @param {number} duration - Duration in ms (default 1000)
   * @param {HTMLMediaElement} video - Optional video element to avoid expensive lookup
   */
  blinkController(controller, duration, video) {
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
   *
   * @param {HTMLMediaElement} video - Target video element
   * @param {number} value - Speed value (absolute) or delta (relative)
   * @param {Object} options - Configuration options
   * @param {boolean} options.relative - If true, value is a delta; if false, absolute speed
   * @param {string} options.source - 'internal' (user action) or 'external' (site/other)
   */
  adjustSpeed(video, value, options = {}) {
    if (!video || !video.vsc) {
      return;
    }
    if (typeof value !== 'number' || isNaN(value)) {
      return;
    }
    return this._adjustSpeedInternal(video, value, options);
  }

  /**
   * Internal adjustSpeed implementation (context already set)
   * @private
   */
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

  /**
   * Set video playback speed with complete state management
   * Unified implementation with all functionality - no fragmented logic
   * @param {HTMLMediaElement} video - Video element
   * @param {number} speed - Target speed
   */
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

}

// Create singleton instance
window.VSC.ActionHandler = ActionHandler;
