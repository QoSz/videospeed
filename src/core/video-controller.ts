/**
 * Video Controller class for managing individual video elements
 */

export class VideoController {
  video!: HTMLMediaElement;
  parent!: HTMLElement;
  config!: VSCVideoSpeedConfig;
  actionHandler!: VSCActionHandlerInterface;
  controlsManager!: VSCControlsManagerInterface;
  shouldStartHidden!: boolean;
  controllerId!: string;
  speedBeforeReset!: number | null;
  expectedSpeed!: number | null;
  mark: number | undefined;
  div!: HTMLElement;
  speedIndicator: HTMLElement | null = null;
  targetObserver: MutationObserver | null = null;
  _intersectionObserver: IntersectionObserver | null = null;
  _isIntersecting: boolean = true;
  _removed: boolean = false;

  /**
   * Get existing controller or create new one for a video element.
   * Preferred factory method that makes the singleton-per-video pattern explicit.
   */
  static getOrCreate(
    target: HTMLMediaElement,
    parent: HTMLElement,
    config: VSCVideoSpeedConfig,
    actionHandler: VSCActionHandlerInterface,
    shouldStartHidden: boolean = false
  ): VideoController {
    if (target.vsc) {
      return target.vsc as unknown as VideoController;
    }
    return new VideoController(target, parent, config, actionHandler, shouldStartHidden);
  }

  constructor(
    target: HTMLMediaElement,
    parent: HTMLElement,
    config: VSCVideoSpeedConfig,
    actionHandler: VSCActionHandlerInterface,
    shouldStartHidden: boolean = false
  ) {
    // Singleton pattern: return existing controller if already attached
    if (target.vsc) {
      return target.vsc as unknown as VideoController;
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
    this.expectedSpeed = null;

    // Attach controller to video element first (needed for adjustSpeed)
    target.vsc = this as unknown as NonNullable<HTMLMediaElement['vsc']>;

    // Register with state manager immediately after controller is attached
    if (window.VSC.stateManager) {
      window.VSC.stateManager.registerController(this as unknown as Parameters<typeof window.VSC.stateManager.registerController>[0]);
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
   */
  private initializeSpeed(): void {
    const targetSpeed = this.getTargetSpeed();

    // Set the initial expected speed for this video
    this.expectedSpeed = targetSpeed;

    // Use adjustSpeed for initial speed setting to ensure consistency
    if (this.actionHandler && targetSpeed !== this.video.playbackRate) {
      this.actionHandler.adjustSpeed(this.video, targetSpeed, { source: 'internal' });
    }
  }

  /**
   * Get target speed based on rememberSpeed setting
   */
  private getTargetSpeed(): number {
    return this.config.settings.lastSpeed || 1.0;
  }

  /**
   * Initialize video controller UI
   */
  private initializeControls(): HTMLElement {
    const document = this.video.ownerDocument;
    const speed = window.VSC.Constants.formatSpeed(this.video.playbackRate);
    const position = window.VSC.ShadowDOMManager.calculatePosition(this.video);

    // Create custom element wrapper to avoid CSS conflicts
    const wrapper = document.createElement('vsc-controller');

    // Apply all CSS classes at once to prevent race condition flash
    const cssClasses = ['vsc-controller'];

    // Only hide controller if video has no source AND is not ready/functional
    if (!this.video.currentSrc && !(this.video as HTMLVideoElement).src && this.video.readyState < 2) {
      cssClasses.push('vsc-nosource');
    }

    if (this.config.settings.startHidden || this.shouldStartHidden) {
      cssClasses.push('vsc-hidden');
    }

    // Apply all classes at once to prevent visible flash
    wrapper.className = cssClasses.join(' ');

    // Set positioning styles with calculated position
    wrapper.style.cssText = `
      position: absolute !important;
      z-index: 9999999 !important;
      top: ${position.top};
      left: ${position.left};
    `;

    // Create shadow DOM with relative positioning inside shadow root
    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, {
      top: '0px',
      left: '0px',
      speed: speed,
      opacity: this.config.settings.controllerOpacity,
      buttonSize: this.config.settings.controllerButtonSize,
    });

    // Set up control events
    this.controlsManager.setupControls(shadow, this.video);

    // Store speed indicator reference
    this.speedIndicator = window.VSC.ShadowDOMManager.getSpeedIndicator(shadow);

    // Insert into DOM based on site-specific rules
    this.insertIntoDOM(document, wrapper);

    return wrapper;
  }

  /**
   * Insert controller into DOM with site-specific positioning
   */
  private insertIntoDOM(document: Document, wrapper: HTMLElement): void {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(wrapper);

    // Get site-specific positioning information
    const positioning = window.VSC.siteHandlerManager.getControllerPosition(
      this.parent,
      this.video
    );

    switch (positioning.insertionMethod) {
      case 'beforeParent':
        positioning.insertionPoint.parentElement?.insertBefore(fragment, positioning.insertionPoint);
        break;

      case 'afterParent':
        positioning.insertionPoint.parentElement?.insertBefore(
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
   */
  private setupMutationObserver(): void {
    this.targetObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'src' || mutation.attributeName === 'currentSrc')
        ) {
          window.VSC.logger.debug('Mutation of A/V element detected');
          const target = mutation.target as HTMLMediaElement;
          if (!target.src && !target.currentSrc) {
            this.div.classList.add('vsc-nosource');
          } else {
            this.div.classList.remove('vsc-nosource');
          }
        }
      }
    });

    this.targetObserver.observe(this.video, {
      attributeFilter: ['src', 'currentSrc'],
    });
  }

  /**
   * Remove controller and clean up
   */
  remove(): void {
    if (this._removed) { return; }
    this._removed = true;

    window.VSC.logger.debug('Removing VideoController');

    // Clear any pending blink timer
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
   */
  private generateControllerId(target: HTMLMediaElement): string {
    const timestamp = Date.now();
    const src = target.currentSrc || (target as HTMLVideoElement).src || 'no-src';
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
   */
  private setupIntersectionObserver(): void {
    this._isIntersecting = true;
    this._intersectionObserver = null;

    if (typeof IntersectionObserver !== 'undefined') {
      this._isIntersecting = false;
      this._intersectionObserver = new IntersectionObserver(
        (entries) => {
          this._isIntersecting = entries[0]?.isIntersecting ?? false;
        },
        { threshold: 0 }
      );
      this._intersectionObserver.observe(this.video);
    }
  }

  /**
   * Check if the video element is currently visible
   */
  isVideoVisible(): boolean {
    if (!this.video.isConnected) {
      return false;
    }

    if (!this._isIntersecting) {
      return false;
    }

    const inlineStyle = this.video.style;
    if (inlineStyle.display === 'none' || inlineStyle.visibility === 'hidden' || inlineStyle.opacity === '0') {
      return false;
    }

    return true;
  }

  /**
   * Update controller visibility based on video visibility
   */
  updateVisibility(): void {
    const isVisible = this.isVideoVisible();
    const isCurrentlyHidden = this.div.classList.contains('vsc-hidden');

    // Special handling for audio elements
    if (this.video.tagName === 'AUDIO') {
      if (!this.config.settings.audioBoolean && !isCurrentlyHidden) {
        this.div.classList.add('vsc-hidden');
        window.VSC.logger.debug('Hiding audio controller - audio support disabled');
      } else if (
        this.config.settings.audioBoolean &&
        isCurrentlyHidden &&
        !this.div.classList.contains('vsc-manual')
      ) {
        this.div.classList.remove('vsc-hidden');
        window.VSC.logger.debug('Showing audio controller - audio support enabled');
      }
      return;
    }

    if (
      isVisible &&
      isCurrentlyHidden &&
      !this.div.classList.contains('vsc-manual') &&
      !this.config.settings.startHidden
    ) {
      this.div.classList.remove('vsc-hidden');
      window.VSC.logger.debug('Showing controller - video became visible');
    } else if (!isVisible && !isCurrentlyHidden) {
      this.div.classList.add('vsc-hidden');
      window.VSC.logger.debug('Hiding controller - video became invisible');
    }
  }
}

// Runtime compatibility
window.VSC.VideoController = VideoController as unknown as Window['VSC']['VideoController'];
