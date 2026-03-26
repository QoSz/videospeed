/**
 * Event management system for Video Speed Controller
 */

window.VSC = window.VSC || {};

class EventManager {
  constructor(config, actionHandler) {
    this.config = config;
    this.actionHandler = actionHandler;
    this.listeners = new Map();
    // Separate boolean flag from timer ID for clarity
    this.coolDownActive = false;
    this.coolDownTimer = null;
    this.showTimers = new WeakMap();

    // Event deduplication to prevent duplicate key processing
    this.lastKeyEventSignature = null;
  }

  /**
   * Set up all event listeners
   * @param {Document} document - Document to attach events to
   */
  setupEventListeners(document) {
    this.setupKeyboardShortcuts(document);
    this.setupRateChangeListener(document);
  }

  /**
   * Set up keyboard shortcuts
   * @param {Document} document - Document to attach events to
   */
  setupKeyboardShortcuts(document) {
    const docs = [document];

    try {
      if (window.VSC.inIframe()) {
        docs.push(window.top.document);
      }
    } catch (e) {
      // Cross-origin iframe - ignore
    }

    docs.forEach((doc) => {
      const keydownHandler = (event) => this.handleKeydown(event);
      doc.addEventListener('keydown', keydownHandler, true);

      // Store reference for cleanup
      if (!this.listeners.has(doc)) {
        this.listeners.set(doc, []);
      }
      this.listeners.get(doc).push({
        type: 'keydown',
        handler: keydownHandler,
        useCapture: true,
      });
    });
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} event - Keyboard event
   * @private
   */
  handleKeydown(event) {
    const keyCode = event.keyCode;

    // Event deduplication - prevent same key event from being processed multiple times
    const eventSignature = `${keyCode}_${event.timeStamp}_${event.type}`;

    if (this.lastKeyEventSignature === eventSignature) {
      return;
    }

    this.lastKeyEventSignature = eventSignature;

    // Ignore if following modifier is active
    if (this.hasActiveModifier(event)) {
      return;
    }

    // Ignore keydown event if typing in an input box
    if (this.isTypingContext(event.target)) {
      return false;
    }

    // Ignore keydown event if no media elements are present
    if (!window.VSC.stateManager?.hasControllers()) {
      return false;
    }

    // Find matching key binding
    const keyBinding = this.config.getKeyBindingByKey(keyCode);

    if (keyBinding) {
      this.actionHandler.runAction(keyBinding.action, keyBinding.value, event);

      if (keyBinding.force === true || keyBinding.force === 'true') {
        // Disable website's key bindings
        event.preventDefault();
        event.stopPropagation();
      }
    }

    return false;
  }

  /**
   * Check if any modifier keys are active
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {boolean} True if modifiers are active
   * @private
   */
  hasActiveModifier(event) {
    return (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.getModifierState &&
        (event.getModifierState('Fn') ||
          event.getModifierState('Hyper') ||
          event.getModifierState('OS')))
    );
  }

  /**
   * Check if user is typing in an input context
   * @param {Element} target - Event target
   * @returns {boolean} True if typing context
   * @private
   */
  isTypingContext(target) {
    return (
      target.nodeName === 'INPUT' || target.nodeName === 'TEXTAREA' || target.isContentEditable
    );
  }

  /**
   * Set up rate change event listener
   * @param {Document} document - Document to attach events to
   */
  setupRateChangeListener(document) {
    const rateChangeHandler = (event) => this.handleRateChange(event);
    document.addEventListener('ratechange', rateChangeHandler, true);

    // Store reference for cleanup
    if (!this.listeners.has(document)) {
      this.listeners.set(document, []);
    }
    this.listeners.get(document).push({
      type: 'ratechange',
      handler: rateChangeHandler,
      useCapture: true,
    });
  }

  /**
   * Handle rate change events
   * @param {Event} event - Rate change event
   * @private
   */
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

  /**
   * Start cooldown period to prevent event spam
   */
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

  /**
   * Show controller temporarily during speed changes or other automatic actions
   * @param {Element} controller - Controller element
   */
  showController(controller) {
    if (this.config.settings.startHidden && !controller.classList.contains('vsc-manual')) {
      return;
    }

    controller.classList.add('vsc-show');

    const existingTimer = this.showTimers.get(controller);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.showTimers.set(
      controller,
      setTimeout(() => {
        controller.classList.remove('vsc-show');
        this.showTimers.delete(controller);
      }, 2000)
    );
  }

  /**
   * Clean up all event listeners
   */
  cleanup() {
    this.listeners.forEach((eventList, doc) => {
      eventList.forEach(({ type, handler, useCapture }) => {
        try {
          doc.removeEventListener(type, handler, useCapture);
        } catch (e) {
          window.VSC.logger.warn(`Failed to remove event listener: ${e.message}`);
        }
      });
    });

    this.listeners.clear();

    if (this.coolDownTimer) {
      clearTimeout(this.coolDownTimer);
      this.coolDownTimer = null;
      this.coolDownActive = false;
    }

    // Note: showTimers (WeakMap) entries are cleaned up automatically
    // when controller elements are garbage collected
  }
}

// Cooldown duration (ms) for ratechange handling
EventManager.COOLDOWN_MS = 200;

// Create singleton instance
window.VSC.EventManager = EventManager;
