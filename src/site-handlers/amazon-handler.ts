/**
 * Amazon Prime Video handler
 */

import { BaseSiteHandler, ControllerPosition } from './base-handler';

export class AmazonHandler extends BaseSiteHandler {
  static matches(): boolean {
    const h = location.hostname;
    return (
      h === 'www.amazon.com' ||
      h === 'www.primevideo.com' ||
      h.endsWith('.amazon.com') ||
      h.endsWith('.primevideo.com')
    );
  }

  getControllerPosition(
    parent: HTMLElement,
    video: HTMLMediaElement
  ): ControllerPosition {
    if (!video.classList.contains('vjs-tech')) {
      if (!parent.parentElement) {
        return super.getControllerPosition(parent, video);
      }

      return {
        insertionPoint: parent.parentElement,
        insertionMethod: 'beforeParent',
        targetParent: parent.parentElement,
      };
    }

    return super.getControllerPosition(parent, video);
  }

  shouldIgnoreVideo(video: HTMLMediaElement): boolean {
    if (video.readyState < 2) {
      return false;
    }

    const rect = video.getBoundingClientRect();
    return rect.width < 200 || rect.height < 100;
  }

  getVideoContainerSelectors(): string[] {
    return [
      '.dv-player-container',
      '.webPlayerContainer',
      '[data-testid="video-player"]',
    ];
  }
}

window.VSC.AmazonHandler = AmazonHandler;
