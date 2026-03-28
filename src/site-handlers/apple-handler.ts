/**
 * Apple TV+ handler
 */

import { BaseSiteHandler, ControllerPosition } from './base-handler';

export class AppleHandler extends BaseSiteHandler {
  static matches(): boolean {
    return location.hostname === 'tv.apple.com';
  }

  getControllerPosition(
    parent: HTMLElement,
    _video: HTMLMediaElement
  ): ControllerPosition {
    if (!parent.parentNode) {
      return super.getControllerPosition(parent, _video);
    }

    return {
      insertionPoint: parent.parentNode,
      insertionMethod: 'firstChild',
      targetParent: parent.parentNode,
    };
  }

  getVideoContainerSelectors(): string[] {
    return [
      'apple-tv-plus-player',
      '[data-testid="player"]',
      '.video-container',
    ];
  }

  detectSpecialVideos(doc: Document): HTMLMediaElement[] {
    const applePlayer = doc.querySelector('apple-tv-plus-player');
    if (applePlayer && applePlayer.shadowRoot) {
      const videos =
        applePlayer.shadowRoot.querySelectorAll<HTMLVideoElement>('video');
      return Array.from(videos);
    }
    return [];
  }
}

window.VSC.AppleHandler = AppleHandler;
