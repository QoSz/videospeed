/**
 * Shadow DOM creation and management
 */

window.VSC = window.VSC || {};

class ShadowDOMManager {
  /**
   * Create shadow DOM for video controller
   * @param {HTMLElement} wrapper - Wrapper element
   * @param {Object} options - Configuration options
   * @returns {ShadowRoot} Created shadow root
   */
  static createShadowDOM(wrapper, options = {}) {
    const { top = '0px', left = '0px', speed = '1.00', opacity = 0.3, buttonSize = 14 } = options;

    const shadow = wrapper.attachShadow({ mode: 'open' });

    // Create style element with embedded CSS for immediate styling
    const style = document.createElement('style');
    style.textContent = `
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
        background: rgba(15, 15, 20, 0.65);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        border-radius: 24px;
        padding: 4px 10px;
        margin: 10px 10px 10px 15px;
        cursor: default;
        z-index: 9999999;
        white-space: nowrap;
        transition: all 0.25s ease;
        display: inline-flex;
        align-items: center;
      }

      #controller:hover {
        background: rgba(15, 15, 20, 0.75);
        border-color: rgba(255, 255, 255, 0.18);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
      }

      :host(:hover) #controls {
        display: inline-flex;
        opacity: 1;
      }

      :host(.vsc-hidden) #controller,
      :host(.vsc-nosource) #controller {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }

      :host(.vsc-manual:not(.vsc-hidden)) #controller {
        display: inline-flex !important;
        visibility: visible !important;
        opacity: ${opacity} !important;
      }

      :host(.vsc-show) #controller {
        display: inline-flex !important;
        visibility: visible !important;
        opacity: ${opacity} !important;
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
        font-size: ${buttonSize}px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
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
        opacity: 0;
        transition: opacity 0.2s ease;
        font-size: ${buttonSize}px;
        line-height: ${buttonSize}px;
      }

      #controller.dragging {
        cursor: grabbing;
      }

      #controller.dragging #controls {
        display: inline-flex;
        opacity: 1;
      }

      #controller:hover > .draggable {
        margin-right: 2px;
      }

      button {
        cursor: pointer;
        color: rgba(255, 255, 255, 0.75);
        background: transparent;
        border: none;
        border-radius: 8px;
        padding: 2px 6px;
        font-size: inherit;
        line-height: inherit;
        font-family: inherit;
        font-weight: 500;
        transition: all 0.15s ease;
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
        background: rgba(255, 255, 255, 0.12);
      }

      button:active {
        background: rgba(255, 255, 255, 0.2);
      }

      button.rw {
        color: rgba(255, 255, 255, 0.55);
      }

      button.rw:hover {
        color: #fff;
      }

      button.hideButton {
        color: rgba(255, 255, 255, 0.45);
        margin-left: 4px;
      }

      button.hideButton:hover {
        color: #fff;
      }
    `;
    shadow.appendChild(style);

    // Create controller div
    const controller = document.createElement('div');
    controller.id = 'controller';
    controller.style.cssText = `top:${top}; left:${left}; opacity:${opacity};`;

    // Create draggable speed indicator
    const draggable = document.createElement('span');
    draggable.setAttribute('data-action', 'drag');
    draggable.className = 'draggable';
    draggable.style.cssText = `font-size: ${buttonSize}px;`;
    draggable.textContent = speed;
    controller.appendChild(draggable);

    // Create controls span
    const controls = document.createElement('span');
    controls.id = 'controls';
    controls.style.cssText = `font-size: ${buttonSize}px; line-height: ${buttonSize}px;`;

    // Create buttons
    const buttons = [
      { action: 'rewind', text: '«', class: 'rw' },
      { action: 'slower', text: '−', class: '' },
      { action: 'faster', text: '+', class: '' },
      { action: 'advance', text: '»', class: 'rw' },
      { action: 'display', text: '×', class: 'hideButton' },
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
    const rect = video.getBoundingClientRect();

    // getBoundingClientRect is relative to the viewport; style coordinates
    // are relative to offsetParent, so we adjust for that here. offsetParent
    // can be null if the video has `display: none` or is not yet in the DOM.
    const offsetRect = video.offsetParent?.getBoundingClientRect();
    const top = `${Math.max(rect.top - (offsetRect?.top || 0), 0)}px`;
    const left = `${Math.max(rect.left - (offsetRect?.left || 0), 0)}px`;

    return { top, left };
  }
}

// Create singleton instance
window.VSC.ShadowDOMManager = ShadowDOMManager;
