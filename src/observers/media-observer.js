/**
 * Media element observer for finding and tracking video/audio elements
 */

window.VSC = window.VSC || {};

class MediaElementObserver {
  constructor(config, siteHandler) {
    this.config = config;
    this.siteHandler = siteHandler;
    // Set by inject.js after mutation observer is created
    this.mutationObserver = null;
  }

  /**
   * Scan document for existing media elements
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements
   */
  scanForMedia(document) {
    const seen = new Set();
    const mediaElements = [];
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';

    // Find regular media elements (querySelectorAll returns no duplicates)
    const regularMedia = document.querySelectorAll(mediaTagSelector);
    for (let i = 0; i < regularMedia.length; i++) {
      seen.add(regularMedia[i]);
      mediaElements.push(regularMedia[i]);
    }

    // Search shadow DOMs for media elements.
    // Prefer known shadow roots from mutation observer (O(k) where k = shadow roots)
    // over full-DOM scan with querySelectorAll('*') (O(n) where n = all elements).
    if (this.mutationObserver) {
      for (const shadowRoot of this.mutationObserver.getKnownShadowRoots()) {
        const matches = shadowRoot.querySelectorAll(mediaTagSelector);
        for (let j = 0; j < matches.length; j++) {
          if (!seen.has(matches[j])) {
            seen.add(matches[j]);
            mediaElements.push(matches[j]);
          }
        }
      }
    } else {
      // Fallback: recursive shadow DOM traversal when mutation observer not available
      const shadowMedia = [];
      window.VSC.DomUtils.findShadowMedia(document, mediaTagSelector, shadowMedia);
      for (let i = 0; i < shadowMedia.length; i++) {
        if (!seen.has(shadowMedia[i])) {
          seen.add(shadowMedia[i]);
          mediaElements.push(shadowMedia[i]);
        }
      }
    }

    // Find site-specific media elements, skip duplicates
    const siteSpecificMedia = this.siteHandler.detectSpecialVideos(document);
    for (let i = 0; i < siteSpecificMedia.length; i++) {
      if (!seen.has(siteSpecificMedia[i])) {
        seen.add(siteSpecificMedia[i]);
        mediaElements.push(siteSpecificMedia[i]);
      }
    }

    // Filter out ignored videos
    const filteredMedia = mediaElements.filter((media) => {
      return !this.siteHandler.shouldIgnoreVideo(media);
    });

    return filteredMedia;
  }

  /**
   * Lightweight scan that avoids expensive shadow DOM traversal
   * Used during initial load to avoid blocking page performance
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements
   */
  scanForMediaLight(document) {
    const seen = new Set();
    const mediaElements = [];
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';

    try {
      // Only do basic DOM query, no shadow DOM traversal
      const regularMedia = document.querySelectorAll(mediaTagSelector);
      for (let i = 0; i < regularMedia.length; i++) {
        seen.add(regularMedia[i]);
        mediaElements.push(regularMedia[i]);
      }

      // Find site-specific media elements, skip duplicates
      const siteSpecificMedia = this.siteHandler.detectSpecialVideos(document);
      for (let i = 0; i < siteSpecificMedia.length; i++) {
        if (!seen.has(siteSpecificMedia[i])) {
          seen.add(siteSpecificMedia[i]);
          mediaElements.push(siteSpecificMedia[i]);
        }
      }

      // Filter out ignored videos
      const filteredMedia = mediaElements.filter((media) => {
        return !this.siteHandler.shouldIgnoreVideo(media);
      });

      return filteredMedia;
    } catch (error) {
      window.VSC.logger.error(`Light media scan failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Scan iframes for media elements
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements in iframes
   */
  scanIframes(document) {
    const mediaElements = [];
    const frameTags = document.getElementsByTagName('iframe');

    for (let i = 0; i < frameTags.length; i++) {
      try {
        const childDocument = frameTags[i].contentDocument;
        if (childDocument) {
          const iframeMedia = this.scanForMedia(childDocument);
          mediaElements.push(...iframeMedia);
        }
      } catch (e) {
        // Cross-origin iframe, ignore
      }
    }

    return mediaElements;
  }

  /**
   * Get media elements using site-specific container selectors
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements
   */
  scanSiteSpecificContainers(document) {
    const mediaElements = [];
    const containerSelectors = this.siteHandler.getVideoContainerSelectors();
    const audioEnabled = this.config.settings.audioBoolean;

    containerSelectors.forEach((selector) => {
      try {
        const containers = document.querySelectorAll(selector);
        containers.forEach((container) => {
          const containerMedia = window.VSC.DomUtils.findMediaElements(container, audioEnabled);
          mediaElements.push(...containerMedia);
        });
      } catch (e) {
        window.VSC.logger.warn(`Invalid selector "${selector}": ${e.message}`);
      }
    });

    return mediaElements;
  }

  /**
   * Comprehensive scan for all media elements
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} All found media elements
   */
  scanAll(document) {
    const allMedia = [];

    // Regular scan
    const regularMedia = this.scanForMedia(document);
    allMedia.push(...regularMedia);

    // Site-specific container scan
    const containerMedia = this.scanSiteSpecificContainers(document);
    allMedia.push(...containerMedia);

    // Iframe scan
    const iframeMedia = this.scanIframes(document);
    allMedia.push(...iframeMedia);

    // Remove duplicates
    const uniqueMedia = [...new Set(allMedia)];

    return uniqueMedia;
  }

  /**
   * Check if media element is valid for controller attachment
   * @param {HTMLMediaElement} media - Media element to check
   * @returns {boolean} True if valid
   */
  isValidMediaElement(media) {
    // Skip videos that are not in the DOM
    if (!media.isConnected) {
      return false;
    }

    // Skip audio elements when audio support is disabled
    if (media.tagName === 'AUDIO' && !this.config.settings.audioBoolean) {
      return false;
    }

    // Let site handler have final say on whether to ignore this video
    if (this.siteHandler.shouldIgnoreVideo(media)) {
      return false;
    }

    // Accept all connected media elements that pass site handler validation
    // Visibility and size will be handled by controller initialization
    return true;
  }

  /**
   * Check if media element should start with hidden controller
   * @param {HTMLMediaElement} media - Media element to check
   * @returns {boolean} True if controller should start hidden
   */
  shouldStartHidden(media) {
    if (media.tagName === 'AUDIO') {
      if (!this.config.settings.audioBoolean) {
        return true;
      }
      if (media.disabled || media.style.pointerEvents === 'none') {
        return true;
      }
      return false;
    }

    // Check inline style (no reflow) - CSS-hidden elements will be caught by IntersectionObserver later
    const style = media.style;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }

    return false;
  }

  /**
   * Find the best parent element for controller positioning
   * @param {HTMLMediaElement} media - Media element
   * @returns {HTMLElement} Parent element for positioning
   */
  findControllerParent(media) {
    const positioning = this.siteHandler.getControllerPosition(media.parentElement, media);
    return positioning.targetParent || media.parentElement;
  }
}

// Create singleton instance
window.VSC.MediaElementObserver = MediaElementObserver;
