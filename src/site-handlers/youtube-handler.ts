/**
 * YouTube-specific handler
 */

import { BaseSiteHandler, ControllerPosition } from './base-handler';

export class YouTubeHandler extends BaseSiteHandler {
  static matches(): boolean {
    return location.hostname === 'www.youtube.com';
  }

  getControllerPosition(
    parent: HTMLElement,
    _video: HTMLMediaElement
  ): ControllerPosition {
    const targetParent = parent.parentElement;

    if (!targetParent) {
      return super.getControllerPosition(parent, _video);
    }

    return {
      insertionPoint: targetParent,
      insertionMethod: 'firstChild',
      targetParent: targetParent,
    };
  }

  shouldIgnoreVideo(video: HTMLMediaElement): boolean {
    return (
      video.classList.contains('video-thumbnail') ||
      (video.parentElement?.classList.contains('ytp-ad-player-overlay') ??
        false)
    );
  }

  getVideoContainerSelectors(): string[] {
    return ['.html5-video-player', '#movie_player', '.ytp-player-content'];
  }

  detectSpecialVideos(doc: Document): HTMLMediaElement[] {
    const videos: HTMLMediaElement[] = [];

    try {
      const iframes = doc.querySelectorAll<HTMLIFrameElement>(
        'iframe[src*="youtube.com"]'
      );
      iframes.forEach((iframe) => {
        try {
          const iframeDoc = iframe.contentDocument;
          if (iframeDoc) {
            const iframeVideos =
              iframeDoc.querySelectorAll<HTMLVideoElement>('video');
            videos.push(...Array.from(iframeVideos));
          }
        } catch {
          // Cross-origin iframe, ignore
        }
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      window.VSC.logger.debug(
        `Could not access YouTube iframe videos: ${message}`
      );
    }

    return videos;
  }
}

window.VSC.YouTubeHandler = YouTubeHandler;
