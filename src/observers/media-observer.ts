/**
 * Media element observer for finding and tracking video/audio elements
 */

import type { VideoMutationObserver } from './mutation-observer';

export class MediaElementObserver {
  private readonly config: VSCConfig;
  private readonly siteHandler: VSCSiteHandler;
  /** Set by inject.js after mutation observer is created */
  public mutationObserver: VideoMutationObserver | null;

  constructor(config: VSCConfig, siteHandler: VSCSiteHandler) {
    this.config = config;
    this.siteHandler = siteHandler;
    this.mutationObserver = null;
  }

  /**
   * Scan document for existing media elements
   */
  scanForMedia(root: Document | ShadowRoot = document): HTMLMediaElement[] {
    const seen: Set<Element> = new Set();
    const mediaElements: HTMLMediaElement[] = [];
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';

    const regularMedia = root.querySelectorAll(mediaTagSelector);
    for (let i = 0; i < regularMedia.length; i++) {
      const el = regularMedia[i];
      if (el) {
        seen.add(el);
        mediaElements.push(el as HTMLMediaElement);
      }
    }

    if (this.mutationObserver) {
      for (const shadowRoot of this.mutationObserver.getKnownShadowRoots()) {
        const matches = shadowRoot.querySelectorAll(mediaTagSelector);
        for (let j = 0; j < matches.length; j++) {
          const match = matches[j];
          if (match && !seen.has(match)) {
            seen.add(match);
            mediaElements.push(match as HTMLMediaElement);
          }
        }
      }
    } else {
      const shadowMedia: Element[] = [];
      window.VSC.DomUtils.findShadowMedia(root as Document, mediaTagSelector, shadowMedia);
      for (let i = 0; i < shadowMedia.length; i++) {
        const el = shadowMedia[i];
        if (el && !seen.has(el)) {
          seen.add(el);
          mediaElements.push(el as HTMLMediaElement);
        }
      }
    }

    const siteSpecificMedia = this.siteHandler.detectSpecialVideos(root);
    for (let i = 0; i < siteSpecificMedia.length; i++) {
      const el = siteSpecificMedia[i];
      if (el && !seen.has(el)) {
        seen.add(el);
        mediaElements.push(el);
      }
    }

    const filteredMedia = mediaElements.filter((media: HTMLMediaElement): boolean => {
      return !this.siteHandler.shouldIgnoreVideo(media);
    });

    return filteredMedia;
  }

  /**
   * Lightweight scan that avoids expensive shadow DOM traversal.
   * Used during initial load to avoid blocking page performance.
   */
  scanForMediaLight(root: Document | ShadowRoot = document): HTMLMediaElement[] {
    const seen: Set<Element> = new Set();
    const mediaElements: HTMLMediaElement[] = [];
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';

    try {
      const regularMedia = root.querySelectorAll(mediaTagSelector);
      for (let i = 0; i < regularMedia.length; i++) {
        const el = regularMedia[i];
        if (el) {
          seen.add(el);
          mediaElements.push(el as HTMLMediaElement);
        }
      }

      const siteSpecificMedia = this.siteHandler.detectSpecialVideos(root);
      for (let i = 0; i < siteSpecificMedia.length; i++) {
        const el = siteSpecificMedia[i];
        if (el && !seen.has(el)) {
          seen.add(el);
          mediaElements.push(el);
        }
      }

      const filteredMedia = mediaElements.filter((media: HTMLMediaElement): boolean => {
        return !this.siteHandler.shouldIgnoreVideo(media);
      });

      return filteredMedia;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      window.VSC.logger.error(`Light media scan failed: ${message}`);
      return [];
    }
  }

  /**
   * Comprehensive scan for all media elements
   */
  scanAll(root: Document | ShadowRoot = document): HTMLMediaElement[] {
    const allMedia: HTMLMediaElement[] = [];

    const regularMedia = this.scanForMedia(root);
    allMedia.push(...regularMedia);

    const containerMedia = this.scanSiteSpecificContainers(root);
    allMedia.push(...containerMedia);

    const iframeMedia = this.scanIframes(root);
    allMedia.push(...iframeMedia);

    const uniqueMedia: HTMLMediaElement[] = [...new Set(allMedia)];

    return uniqueMedia;
  }

  /**
   * Scan iframes for media elements
   */
  scanIframes(root: Document | ShadowRoot = document): HTMLMediaElement[] {
    const mediaElements: HTMLMediaElement[] = [];
    const frameTags = root.querySelectorAll('iframe');

    for (let i = 0; i < frameTags.length; i++) {
      const frame = frameTags[i];
      if (!frame) {
        continue;
      }
      try {
        const childDocument = frame.contentDocument;
        if (childDocument) {
          const iframeMedia = this.scanForMedia(childDocument);
          mediaElements.push(...iframeMedia);
        }
      } catch {
        // Cross-origin iframe, ignore
      }
    }

    return mediaElements;
  }

  /**
   * Get media elements using site-specific container selectors
   */
  scanSiteSpecificContainers(root: Document | ShadowRoot = document): HTMLMediaElement[] {
    const mediaElements: HTMLMediaElement[] = [];
    const containerSelectors = this.siteHandler.getVideoContainerSelectors();
    const audioEnabled = this.config.settings.audioBoolean;

    for (let i = 0; i < containerSelectors.length; i++) {
      const selector = containerSelectors[i];
      if (!selector) {
        continue;
      }
      try {
        const containers = root.querySelectorAll(selector);
        for (let j = 0; j < containers.length; j++) {
          const container = containers[j];
          if (!container) {
            continue;
          }
          const containerMedia = window.VSC.DomUtils.findMediaElements(
            container,
            audioEnabled
          );
          mediaElements.push(...(containerMedia as HTMLMediaElement[]));
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        window.VSC.logger.warn(`Invalid selector "${selector}": ${message}`);
      }
    }

    return mediaElements;
  }

  /**
   * Check if media element is valid for controller attachment
   */
  isValidMediaElement(media: HTMLMediaElement): boolean {
    if (!media.isConnected) {
      return false;
    }

    if (media.tagName === 'AUDIO' && !this.config.settings.audioBoolean) {
      return false;
    }

    if (this.siteHandler.shouldIgnoreVideo(media)) {
      return false;
    }

    return true;
  }

  /**
   * Check if media element should start with hidden controller
   */
  shouldStartHidden(media: HTMLMediaElement): boolean {
    if (media.tagName === 'AUDIO') {
      if (!this.config.settings.audioBoolean) {
        return true;
      }
      if (
        media.hasAttribute('disabled') ||
        media.style.pointerEvents === 'none'
      ) {
        return true;
      }
      return false;
    }

    const style = media.style;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }

    return false;
  }

  /**
   * Find the best parent element for controller positioning
   */
  findControllerParent(video: HTMLMediaElement): HTMLElement {
    const parent = video.parentElement ?? document.body;
    const positioning = this.siteHandler.getControllerPosition(parent, video);
    return (positioning.targetParent as HTMLElement) ?? parent;
  }
}

window.VSC.MediaElementObserver = MediaElementObserver;
