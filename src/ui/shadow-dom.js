/**
 * Shadow DOM creation and management
 */

window.VSC = window.VSC || {};

class ShadowDOMManager {
  // Shared CSSStyleSheet instance - created once, adopted by all shadow roots
  static _sharedSheet = null;

  // Whether adoptedStyleSheets API is available (not in JSDOM)
  static _supportsAdoptedSheets = typeof CSSStyleSheet !== 'undefined' &&
    'replaceSync' in CSSStyleSheet.prototype;

  /**
   * Get or create the shared stylesheet for all controller shadow roots.
   * Uses CSS custom properties for per-controller values (opacity, buttonSize).
   * @returns {CSSStyleSheet|null} Shared stylesheet (null if API unavailable)
   * @private
   */
  static _getSharedSheet() {
    if (!ShadowDOMManager._supportsAdoptedSheets) {
      return null;
    }
    if (!ShadowDOMManager._sharedSheet) {
      ShadowDOMManager._sharedSheet = new CSSStyleSheet();
      ShadowDOMManager._sharedSheet.replaceSync(ShadowDOMManager._getCSS());
    }
    return ShadowDOMManager._sharedSheet;
  }

  /**
   * Get the CSS string for controller shadow DOMs.
   * @returns {string} CSS text
   * @private
   */
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

  /**
   * Create shadow DOM for video controller
   * @param {HTMLElement} wrapper - Wrapper element
   * @param {Object} options - Configuration options
   * @returns {ShadowRoot} Created shadow root
   */
  static createShadowDOM(wrapper, options = {}) {
    const { top = '0px', left = '0px', speed = '1.00', opacity = 0.3, buttonSize = 14 } = options;

    const shadow = wrapper.attachShadow({ mode: 'open' });

    // Use adoptedStyleSheets when available (shared across all controllers),
    // fall back to inline <style> for environments without support (e.g., JSDOM)
    const sharedSheet = ShadowDOMManager._getSharedSheet();
    if (sharedSheet) {
      shadow.adoptedStyleSheets = [sharedSheet];
    } else {
      const style = document.createElement('style');
      style.textContent = ShadowDOMManager._getCSS();
      shadow.appendChild(style);
    }

    // Set per-controller CSS custom properties on host element
    wrapper.style.setProperty('--vsc-opacity', opacity);
    wrapper.style.setProperty('--vsc-button-size', `${buttonSize}px`);

    // Create controller div
    const controller = document.createElement('div');
    controller.id = 'controller';
    controller.style.cssText = `top:${top}; left:${left}; opacity:${opacity};`;

    // Create draggable speed indicator
    const draggable = document.createElement('span');
    draggable.setAttribute('data-action', 'drag');
    draggable.className = 'draggable';
    draggable.textContent = speed;
    controller.appendChild(draggable);

    // Create controls span
    const controls = document.createElement('span');
    controls.id = 'controls';

    // Create buttons
    const buttons = [
      { action: 'rewind', text: '\u00AB', class: 'rw' },
      { action: 'slower', text: '\u2212', class: '' },
      { action: 'faster', text: '+', class: '' },
      { action: 'advance', text: '\u00BB', class: 'rw' },
      { action: 'display', text: '\u00D7', class: 'hideButton' },
    ];

    buttons.forEach((btnConfig) => {
      const button = document.createElement('button');
      button.setAttribute('data-action', btnConfig.action);
      if (btnConfig.class) {
        button.className = btnConfig.class;
      }
      button.textContent = btnConfig.text;
      controls.appendChild(button);
    });

    controller.appendChild(controls);
    shadow.appendChild(controller);

    window.VSC.logger.debug('Shadow DOM created for video controller');
    return shadow;
  }

  /**
   * Get controller element from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Controller element
   */
  static getController(shadow) {
    return shadow.querySelector('#controller');
  }

  /**
   * Get controls container from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Controls element
   */
  static getControls(shadow) {
    return shadow.querySelector('#controls');
  }

  /**
   * Get draggable speed indicator from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Speed indicator element
   */
  static getSpeedIndicator(shadow) {
    return shadow.querySelector('.draggable');
  }

  /**
   * Get all buttons from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {NodeList} Button elements
   */
  static getButtons(shadow) {
    return shadow.querySelectorAll('button');
  }

  /**
   * Update speed display in shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @param {number} speed - New speed value
   */
  static updateSpeedDisplay(shadow, speed) {
    const speedIndicator = this.getSpeedIndicator(shadow);
    if (speedIndicator) {
      speedIndicator.textContent = window.VSC.Constants.formatSpeed(speed);
    }
  }

  /**
   * Calculate position for controller based on video element
   * @param {HTMLVideoElement} video - Video element
   * @returns {Object} Position object with top and left properties
   */
  static calculatePosition(video) {
    // getBoundingClientRect is relative to the viewport; style coordinates
    // are relative to offsetParent, so we adjust for that here. offsetParent
    // can be null if the video has `display: none` or is not yet in the DOM.
    const offsetParent = video.offsetParent;
    const rect = video.getBoundingClientRect();
    const offsetRect = offsetParent ? offsetParent.getBoundingClientRect() : null;
    const top = `${Math.max(rect.top - (offsetRect ? offsetRect.top : 0), 0)}px`;
    const left = `${Math.max(rect.left - (offsetRect ? offsetRect.left : 0), 0)}px`;

    return { top, left };
  }
}

// Create singleton instance
window.VSC.ShadowDOMManager = ShadowDOMManager;
