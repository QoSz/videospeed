/**
 * Control button interactions and event handling
 */

const TOUCHPAD_THRESHOLD = 50 as const;

export class ControlsManager {
  private readonly actionHandler: VSCActionHandlerInterface;
  private readonly config: VSCVideoSpeedConfig;

  constructor(actionHandler: VSCActionHandlerInterface, config: VSCVideoSpeedConfig) {
    this.actionHandler = actionHandler;
    this.config = config;
  }

  /**
   * Set up control button event listeners
   */
  setupControls(shadow: ShadowRoot, video: HTMLMediaElement): void {
    this.setupDragHandler(shadow);
    this.setupButtonHandlers(shadow);
    this.setupWheelHandler(shadow, video);
    this.setupClickPrevention(shadow);
  }

  /**
   * Set up drag handler for speed indicator
   */
  private setupDragHandler(shadow: ShadowRoot): void {
    const draggable = shadow.querySelector('.draggable') as HTMLElement | null;
    if (!draggable) {
      return;
    }

    draggable.addEventListener(
      'mousedown',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        this.actionHandler.runAction(target.dataset['action'] ?? '', null, e);
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
  }

  /**
   * Set up button click handlers
   */
  private setupButtonHandlers(shadow: ShadowRoot): void {
    shadow.querySelectorAll('button').forEach((button: HTMLButtonElement) => {
      // Click handler
      button.addEventListener(
        'click',
        (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const bindingValue = this.config.getKeyBinding(target.dataset['action'] ?? '');
          this.actionHandler.runAction(
            target.dataset['action'] ?? '',
            typeof bindingValue === 'number' ? bindingValue : null,
            e
          );
          e.stopPropagation();
        },
        true
      );

      // Touch handler to prevent conflicts
      button.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          e.stopPropagation();
        },
        true
      );
    });
  }

  /**
   * Set up mouse wheel handler for speed control with touchpad filtering
   *
   * Cross-browser wheel event behavior:
   * - Chrome/Safari/Edge: ALL devices use DOM_DELTA_PIXEL (mouse wheels ~100px, touchpads ~1-15px)
   * - Firefox: Mouse wheels use DOM_DELTA_LINE, touchpads use DOM_DELTA_PIXEL
   *
   * Detection strategy: Use magnitude threshold in DOM_DELTA_PIXEL mode to distinguish
   * mouse wheels (+/-100px typical) from touchpads (+/-1-15px typical). Threshold of 50px
   * provides safety margin based on empirical browser testing.
   */
  private setupWheelHandler(shadow: ShadowRoot, video: HTMLMediaElement): void {
    const controller = shadow.querySelector('#controller') as HTMLElement | null;
    if (!controller) {
      return;
    }

    controller.addEventListener(
      'wheel',
      (event: WheelEvent) => {
        // Detect and filter touchpad events to prevent interference during page scrolling
        if (event.deltaMode === event.DOM_DELTA_PIXEL) {
          // Chrome/Safari/Edge: Use magnitude to distinguish mouse wheel (>50px) from touchpad (<50px)
          if (Math.abs(event.deltaY) < TOUCHPAD_THRESHOLD) {
            window.VSC.logger.debug(
              `Touchpad scroll detected (deltaY: ${event.deltaY}) - ignoring`
            );
            return;
          }
        }
        // Firefox: DOM_DELTA_LINE events are typically legitimate mouse wheels, allow them

        event.preventDefault();

        const delta = Math.sign(event.deltaY);
        const step = 0.1;
        const speedDelta = delta < 0 ? step : -step;

        this.actionHandler.adjustSpeed(video, speedDelta, { relative: true });

        window.VSC.logger.debug(
          `Wheel control: adjusting speed by ${speedDelta} (deltaMode: ${event.deltaMode}, deltaY: ${event.deltaY})`
        );
      },
      { passive: false }
    );
  }

  /**
   * Set up click prevention for controller container
   */
  private setupClickPrevention(shadow: ShadowRoot): void {
    const controller = shadow.querySelector('#controller') as HTMLElement | null;
    if (!controller) {
      return;
    }

    // Prevent clicks from bubbling up to page
    controller.addEventListener('click', (e: MouseEvent) => e.stopPropagation(), false);
    controller.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation(), false);
  }
}

window.VSC.ControlsManager = ControlsManager;
