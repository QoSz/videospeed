/**
 * Facebook-specific handler
 */

window.VSC = window.VSC || {};

class FacebookHandler extends window.VSC.BaseSiteHandler {
  /**
   * Check if this handler applies to Facebook
   * @returns {boolean} True if on Facebook
   */
  static matches() {
    return location.hostname === 'www.facebook.com';
  }

  /**
   * Get Facebook-specific controller positioning
   * @param {HTMLElement} parent - Parent element
   * @param {HTMLElement} video - Video element
   * @returns {Object} Positioning information
   */
  getControllerPosition(parent, _video) {
    // Facebook requires deep DOM traversal due to complex nesting
    // This is a monstrosity but new FB design does not have semantic handles
    let targetParent = parent;

    try {
      targetParent =
        parent.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement
          .parentElement;
    } catch (e) {
      window.VSC.logger.warn('Facebook DOM structure changed, using fallback positioning');
      targetParent = parent.parentElement;
    }

    return {
      insertionPoint: targetParent,
      insertionMethod: 'firstChild',
      targetParent: targetParent,
    };
  }

  /**
   * Check if video should be ignored on Facebook
   * @param {HTMLMediaElement} video - Video element
   * @returns {boolean} True if video should be ignored
   */
  shouldIgnoreVideo(video) {
    // Ignore story videos and other non-main content
    return (
      video.closest('[data-story-id]') !== null ||
      video.closest('.story-bucket-container') !== null ||
      video.getAttribute('data-video-width') === '0'
    );
  }

  /**
   * Get Facebook-specific video container selectors
   * @returns {Array<string>} CSS selectors
   */
  getVideoContainerSelectors() {
    return ['[data-video-id]', '.video-container', '.fbStoryVideoContainer', '[role="main"] video'];
  }

}

// Create singleton instance
window.VSC.FacebookHandler = FacebookHandler;
