/**
 * Video Speed Controller State Manager
 * Tracks media elements for popup and keyboard commands.
 */

import type { ControllerInfo } from '../types/controller.js';

export class VSCStateManager {
  readonly controllers: Map<string, ControllerInfo> = new Map();
  private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    window.VSC.logger?.debug('VSCStateManager initialized');
  }

  /**
   * Register a new controller
   */
  registerController(controller: { controllerId: string; video: HTMLMediaElement; remove(): void }): void {
    if (!controller || !controller.controllerId) {
      window.VSC.logger?.warn('Invalid controller registration attempt');
      return;
    }

    const controllerInfo: ControllerInfo = {
      controller: controller,
      element: controller.video,
      tagName: controller.video?.tagName ?? '',
      videoSrc: controller.video?.src || controller.video?.currentSrc || '',
      created: Date.now(),
    };

    this.controllers.set(controller.controllerId, controllerInfo);
    window.VSC.logger?.debug(
      `Controller registered: ${controller.controllerId}`
    );
  }

  /**
   * Unregister a controller
   */
  unregisterController(controllerId: string): void {
    if (this.controllers.has(controllerId)) {
      this.controllers.delete(controllerId);
      window.VSC.logger?.debug(
        `Controller unregistered: ${controllerId}`
      );
    }
  }

  /**
   * Get all registered media elements (hot path - no cleanup)
   */
  getAllMediaElements(): HTMLMediaElement[] {
    const elements: HTMLMediaElement[] = [];
    for (const [, info] of this.controllers) {
      const video = info.controller?.video || info.element;
      if (video && video.isConnected) {
        elements.push(video);
      }
    }
    return elements;
  }

  /**
   * Remove disconnected controllers. Called periodically, not on every action.
   */
  cleanupDisconnected(): void {
    const disconnectedIds: string[] = [];
    for (const [id, info] of this.controllers) {
      const video = info.controller?.video || info.element;
      if (!video || !video.isConnected) {
        disconnectedIds.push(id);
      }
    }
    for (const id of disconnectedIds) {
      const info = this.controllers.get(id);
      if (info?.controller?.remove) {
        info.controller.remove();
      } else {
        this.controllers.delete(id);
      }
    }
  }

  /**
   * Get a media element by controller ID
   */
  getMediaByControllerId(controllerId: string): HTMLMediaElement | null {
    const info = this.controllers.get(controllerId);
    return info?.controller?.video || info?.element || null;
  }

  /**
   * Get the first available media element
   */
  getFirstMedia(): HTMLMediaElement | null {
    const elements = this.getAllMediaElements();
    return elements[0] || null;
  }

  /**
   * Check if any controllers are registered
   */
  hasControllers(): boolean {
    return this.controllers.size > 0;
  }

  /**
   * Start periodic cleanup of disconnected controllers.
   * Runs every 30 seconds to avoid accumulating stale entries.
   */
  startPeriodicCleanup(): void {
    if (this._cleanupInterval) {
      return;
    }
    this._cleanupInterval = setInterval(
      () => this.cleanupDisconnected(),
      30000
    );
  }

  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

// Create singleton instance
window.VSC.StateManager = VSCStateManager;
window.VSC.stateManager = new VSCStateManager();
window.VSC.stateManager.startPeriodicCleanup();
