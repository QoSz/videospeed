/**
 * Site handler factory and manager
 */

import { BaseSiteHandler, ControllerPosition } from './base-handler';
import { NetflixHandler } from './netflix-handler';
import { YouTubeHandler } from './youtube-handler';
import { FacebookHandler } from './facebook-handler';
import { AmazonHandler } from './amazon-handler';
import { AppleHandler } from './apple-handler';

type SiteHandlerClass = typeof BaseSiteHandler & {
  matches(): boolean;
};

export class SiteHandlerManager {
  currentHandler: BaseSiteHandler | null;
  private availableHandlers: SiteHandlerClass[];

  constructor() {
    this.currentHandler = null;
    this.availableHandlers = [
      NetflixHandler,
      YouTubeHandler,
      FacebookHandler,
      AmazonHandler,
      AppleHandler,
    ];
  }

  getCurrentHandler(): BaseSiteHandler {
    if (!this.currentHandler) {
      this.currentHandler = this.detectHandler();
    }
    return this.currentHandler;
  }

  private detectHandler(): BaseSiteHandler {
    for (const HandlerClass of this.availableHandlers) {
      if (HandlerClass.matches()) {
        window.VSC.logger.info(
          `Using ${HandlerClass.name} for ${location.hostname}`
        );
        return new HandlerClass();
      }
    }

    window.VSC.logger.debug(
      `Using BaseSiteHandler for ${location.hostname}`
    );
    return new BaseSiteHandler();
  }

  initialize(doc: Document): void {
    const handler = this.getCurrentHandler();
    handler.initialize(doc);
  }

  getControllerPosition(
    parent: HTMLElement,
    video: HTMLMediaElement
  ): ControllerPosition {
    const handler = this.getCurrentHandler();
    return handler.getControllerPosition(parent, video);
  }

  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean {
    const handler = this.getCurrentHandler();
    return handler.handleSeek(video, seekSeconds);
  }

  shouldIgnoreVideo(video: HTMLMediaElement): boolean {
    const handler = this.getCurrentHandler();
    return handler.shouldIgnoreVideo(video);
  }

  getVideoContainerSelectors(): string[] {
    const handler = this.getCurrentHandler();
    return handler.getVideoContainerSelectors();
  }

  detectSpecialVideos(doc: Document): HTMLMediaElement[] {
    const handler = this.getCurrentHandler();
    return handler.detectSpecialVideos(doc);
  }

  cleanup(): void {
    if (this.currentHandler) {
      this.currentHandler.cleanup();
      this.currentHandler = null;
    }
  }
}

window.VSC.siteHandlerManager = new SiteHandlerManager();
