/**
 * Base class for site-specific handlers
 */

export interface ControllerPosition {
  insertionPoint: HTMLElement | Node;
  insertionMethod: 'appendChild' | 'firstChild' | 'beforeParent' | 'afterParent';
  targetParent: HTMLElement | Node;
}

export interface ISiteHandler {
  hostname: string;
  getControllerPosition(
    parent: HTMLElement,
    video: HTMLMediaElement
  ): ControllerPosition;
  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean;
  initialize(doc: Document): void;
  cleanup(): void;
  shouldIgnoreVideo(video: HTMLMediaElement): boolean;
  getVideoContainerSelectors(): string[];
  detectSpecialVideos(doc: Document): HTMLMediaElement[];
}

export class BaseSiteHandler implements ISiteHandler {
  hostname: string;

  constructor() {
    this.hostname = location.hostname;
  }

  static matches(): boolean {
    return false;
  }

  getControllerPosition(
    parent: HTMLElement,
    _video: HTMLMediaElement
  ): ControllerPosition {
    return {
      insertionPoint: parent,
      insertionMethod: 'firstChild',
      targetParent: parent,
    };
  }

  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean {
    if (video.currentTime !== undefined && video.duration) {
      const newTime = Math.max(
        0,
        Math.min(video.duration, video.currentTime + seekSeconds)
      );
      video.currentTime = newTime;
    } else {
      video.currentTime += seekSeconds;
    }
    return true;
  }

  initialize(_doc: Document): void {
    window.VSC.logger.debug(
      `Initializing ${this.constructor.name} for ${this.hostname}`
    );
  }

  cleanup(): void {
    window.VSC.logger.debug(`Cleaning up ${this.constructor.name}`);
  }

  shouldIgnoreVideo(_video: HTMLMediaElement): boolean {
    return false;
  }

  getVideoContainerSelectors(): string[] {
    return [];
  }

  detectSpecialVideos(_doc: Document): HTMLMediaElement[] {
    return [];
  }
}

window.VSC.BaseSiteHandler = BaseSiteHandler;
