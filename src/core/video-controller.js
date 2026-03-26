/**
 * Video Controller class for managing individual video elements
 * 
 */

window.VSC = window.VSC || {};

class VideoController {
  /**
   * Get existing controller or create new one for a video element.
   * Preferred factory method that makes the singleton-per-video pattern explicit.
   * @param {HTMLMediaElement} target - Video/audio element
   * @param {HTMLElement} parent - Parent element for positioning
   * @param {Object} config - Configuration object
   * @param {ActionHandler} actionHandler - Action handler instance
   * @param {boolean} shouldStartHidden - Whether controller should start hidden
   * @returns {VideoController} Controller instance (existing or new)
   */
  static getOrCreate(target, parent, config, actionHandler, shouldStartHidden = false) {
    if (target.vsc) {
      return target.vsc;
    }
    return new VideoController(target, parent, config, actionHandler, shouldStartHidden);
  }

  constructor(target, parent, config, actionHandler, shouldStartHidden = false) {
    // Singleton pattern: return existing controller if already attached
    // Note: This return-from-constructor pattern ensures one controller per video
    if (target.vsc) {
      return target.vsc;
    }

    this.video = target;
    this.parent = target.parentElement || parent;
    this.config = config;
    this.actionHandler = actionHandler;
    this.controlsManager = new window.VSC.ControlsManager(actionHandler, config);
    this.shouldStartHidden = shouldStartHidden;

    // Generate unique controller ID for badge tracking
    this.controllerId = this.generateControllerId(target);

    // Transient reset memory (not persisted, instance-specific)
    this.speedBeforeReset = null;

    // Per-video expected speed tracking
    // This is the authoritative speed for THIS video, used during cooldown
    // to verify/restore speed without cross-video contamination
    this.expectedSpeed = null;

    // Attach controller to video element first (needed for adjustSpeed)
    target.vsc = this;

    // Register with state manager immediately after controller is attached
    if (window.VSC.stateManager) {
      window.VSC.stateManager.registerController(this);
    } else {
      window.VSC.logger.error('StateManager not available during VideoController initialization');
    }

    // Initialize speed
    this.initializeSpeed();

    // Create UI
    this.div = this.initializeControls();

    // Set up mutation observer for src changes
    this.setupMutationObserver();

    // Set up intersection observer for efficient visibility tracking
    this.setupIntersectionObserver();

  }

  /**
   * Initialize video speed based on settings
   * @private
   */
  initializeSpeed() {
    const targetSpeed = this.getTargetSpeed();

    // Set the initial expected speed for this video
    this.expectedSpeed = targetSpeed;

    // Use adjustSpeed for initial speed setting to ensure consistency
    if (this.actionHandler && targetSpeed !== this.video.playbackRate) {
      this.actionHandler.adjustSpeed(this.video, targetSpeed, { source: 'internal' });
    }
  }

  /**
   * Get target speed based on rememberSpeed setting and update reset binding
   * @returns {number} Target speed
   * @private
   */
  getTargetSpeed() {
    // Always start with current preferred speed (lastSpeed)
    // The difference is whether changes get saved back to lastSpeed
    const targetSpeed = this.config.settings.lastSpeed || 1.0;

    return targetSpeed;
  }

  /**
   * Initialize video controller UI
   * @returns {HTMLElement} Controller wrapper element
   * @private
   */
  initializeControls() {
    const document = this.video.ownerDocument;
    const speed = window.VSC.Constants.formatSpeed(this.video.playbackRate);
    const position = window.VSC.ShadowDOMManager.calculatePosition(this.video);

    // Create custom element wrapper to avoid CSS conflicts
    const wrapper = document.createElement('vsc-controller');

    // Apply all CSS classes at once to prevent race condition flash
    const cssClasses = ['vsc-controller'];

    // Only hide controller if video has no source AND is not ready/functional
    // This prevents hiding controllers for live streams or dynamically loaded videos
    if (!this.video.currentSrc && !this.video.src && this.video.readyState < 2) {
      cssClasses.push('vsc-nosource');
    }

    if (this.config.settings.startHidden || this.shouldStartHidden) {
      cssClasses.push('vsc-hidden');
    }
    // When startHidden=false, use natural visibility (no special class needed)

    // Apply all classes at once to prevent visible flash
    wrapper.className = cssClasses.join(' ');

    // Set positioning styles with calculated position
    // Only use positioning styles - rely on CSS classes for visibility
    const styleText = `
      position: absolute !important;
      z-index: 9999999 !important;
      top: ${position.top};
      left: ${position.left};
    `;

    wrapper.style.cssText = styleText;

    // Create shadow DOM with relative positioning inside shadow root
    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, {
      top: '0px', // Position relative to shadow root since wrapper is already positioned
      left: '0px', // Position relative to shadow root since wrapper is already positioned
      speed: speed,
      opacity: this.config.settings.controllerOpacity,
      buttonSize: this.config.settings.controllerButtonSize,
    });

    // Set up control events
    this.controlsManager.setupControlEvents(shadow, this.video);

    // Store speed indicator reference
    this.speedIndicator = window.VSC.ShadowDOMManager.getSpeedIndicator(shadow);

    // Insert into DOM based on site-specific rules
    this.insertIntoDOM(document, wrapper);

    return wrapper;
  }

  /**
   * Insert controller into DOM with site-specific positioning
   * @param {Document} document - Document object
   * @param {HTMLElement} wrapper - Wrapper element to insert
   * @private
   */
  insertIntoDOM(document, wrapper) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(wrapper);

    // Get site-specific positioning information
    const positioning = window.VSC.siteHandlerManager.getControllerPosition(
      this.parent,
      this.video
    );

    switch (positioning.insertionMethod) {
      case 'beforeParent':
        positioning.insertionPoint.parentElement.insertBefore(fragment, positioning.insertionPoint);
        break;

      case 'afterParent':
        positioning.insertionPoint.parentElement.insertBefore(
          fragment,
          positioning.insertionPoint.nextSibling
        );
        break;

      case 'firstChild':
      default:
        positioning.insertionPoint.insertBefore(fragment, positioning.insertionPoint.firstChild);
        break;
    }
  }

  /**
   * Set up mutation observer for src attribute changes
   * @private
   */
  setupMutationObserver() {
    this.targetObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'src' || mutation.attributeName === 'currentSrc')
        ) {
          window.VSC.logger.debug('Mutation of A/V element detected');
          const controller = this.div;
          if (!mutation.target.src && !mutation.target.currentSrc) {
            controller.classList.add('vsc-nosource');
          } else {
            controller.classList.remove('vsc-nosource');
          }
        }
      });
    });

    this.targetObserver.observe(this.video, {
      attributeFilter: ['src', 'currentSrc'],
    });
  }

  /**
   * Remove controller and clean up
   */
  remove() {
    if (this._removed) {return;}
    this._removed = true;

    window.VSC.logger.debug('Removing VideoController');

    // Clear any pending blink timer to prevent leaked references to detached shadow DOM
    if (this.div && this.div.blinkTimeOut !== undefined) {
      clearTimeout(this.div.blinkTimeOut);
      this.div.blinkTimeOut = undefined;
    }

    // Remove DOM element
    if (this.div && this.div.parentNode) {
      this.div.remove();
    }

    // Disconnect mutation observer
    if (this.targetObserver) {
      this.targetObserver.disconnect();
    }

    // Disconnect intersection observer
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
    }

    // Remove from state manager
    if (window.VSC.stateManager) {
      window.VSC.stateManager.unregisterController(this.controllerId);
    }

    // Remove reference from video element
    delete this.video.vsc;

    window.VSC.logger.debug('VideoController removed successfully');
  }

  /**
   * Generate unique controller ID for badge tracking
   * @param {HTMLElement} target - Video/audio element
   * @returns {string} Unique controller ID
   * @private
   */
  generateControllerId(target) {
    const timestamp = Date.now();
    const src = target.currentSrc || target.src || 'no-src';
    const tagName = target.tagName.toLowerCase();

    // Create a simple hash from src for uniqueness
    const srcHash = src.split('').reduce((hash, char) => {
      hash = (hash << 5) - hash + char.charCodeAt(0);
      return hash & hash; // Convert to 32-bit integer
    }, 0);

    const random = Math.floor(Math.random() * 1000);
    return `${tagName}-${Math.abs(srcHash)}-${timestamp}-${random}`;
  }

  /**
   * Set up IntersectionObserver for zero-cost visibility tracking.
   * Updates cached visibility state without triggering layout recalculation.
   * Falls back gracefully in environments without IntersectionObserver (e.g., JSDOM).
   * @private
   */
  setupIntersectionObserver() {
    // Default to true so visibility checks work without IntersectionObserver
    this._isIntersecting = true;
    this._intersectionObserver = null;

    if (typeof IntersectionObserver !== 'undefined') {
      this._isIntersecting = false;
      this._intersectionObserver = new IntersectionObserver(
        (entries) => {
          this._isIntersecting = entries[0].isIntersecting;
        },
        { threshold: 0 }
      );
      this._intersectionObserver.observe(this.video);
    }
  }

  /**
   * Check if the video element is currently visible
   * @returns {boolean} True if video is visible
   */
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

  /**
   * Update controller visibility based on video visibility
   * Called when video visibility changes
   */
  updateVisibility() {
    const isVisible = this.isVideoVisible();
    const isCurrentlyHidden = this.div.classList.contains('vsc-hidden');

    // Special handling for audio elements - don't hide controllers for functional audio
    if (this.video.tagName === 'AUDIO') {
      // For audio, only hide if manually hidden or if audio support is disabled
      if (!this.config.settings.audioBoolean && !isCurrentlyHidden) {
        this.div.classList.add('vsc-hidden');
        window.VSC.logger.debug('Hiding audio controller - audio support disabled');
      } else if (
        this.config.settings.audioBoolean &&
        isCurrentlyHidden &&
        !this.div.classList.contains('vsc-manual')
      ) {
        // Show audio controller if audio support is enabled and not manually hidden
        this.div.classList.remove('vsc-hidden');
        window.VSC.logger.debug('Showing audio controller - audio support enabled');
      }
      return;
    }

    // Original logic for video elements
    if (
      isVisible &&
      isCurrentlyHidden &&
      !this.div.classList.contains('vsc-manual') &&
      !this.config.settings.startHidden
    ) {
      // Video became visible and controller is hidden (but not manually hidden and not set to start hidden)
      this.div.classList.remove('vsc-hidden');
      window.VSC.logger.debug('Showing controller - video became visible');
    } else if (!isVisible && !isCurrentlyHidden) {
      // Video became invisible and controller is visible
      this.div.classList.add('vsc-hidden');
      window.VSC.logger.debug('Hiding controller - video became invisible');
    }
  }
}

// Create singleton instance
window.VSC.VideoController = VideoController;

// Global variables available for both browser and testing
