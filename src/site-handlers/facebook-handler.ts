/**
 * Facebook-specific handler
 */

import { BaseSiteHandler, ControllerPosition } from './base-handler';

export class FacebookHandler extends BaseSiteHandler {
  static matches(): boolean {
    return location.hostname === 'www.facebook.com';
  }

  getControllerPosition(
    parent: HTMLElement,
    _video: HTMLMediaElement
  ): ControllerPosition {
    let targetParent: HTMLElement = parent;

    try {
      targetParent =
        parent.parentElement!.parentElement!.parentElement!.parentElement!
          .parentElement!.parentElement!.parentElement!;
    } catch {
      window.VSC.logger.warn(
        'Facebook DOM structure changed, using fallback positioning'
      );
      targetParent = parent.parentElement || parent;
    }

    return {
      insertionPoint: targetParent,
      insertionMethod: 'firstChild',
      targetParent: targetParent,
    };
  }

  shouldIgnoreVideo(video: HTMLMediaElement): boolean {
    return (
      video.closest('[data-story-id]') !== null ||
      video.closest('.story-bucket-container') !== null ||
      video.getAttribute('data-video-width') === '0'
    );
  }

  getVideoContainerSelectors(): string[] {
    return [
      '[data-video-id]',
      '.video-container',
      '.fbStoryVideoContainer',
      '[role="main"] video',
    ];
  }
}

window.VSC.FacebookHandler = FacebookHandler;
