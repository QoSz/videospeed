/**
 * Drag functionality for video controller
 */

window.VSC = window.VSC || {};

class DragHandler {
  static _isDragging = false;
  static _rafId = null;
  static _dragTimeoutId = null;
  static _onMove = null;
  static _onStop = null;

  /**
   * Reset stuck drag state. Called as a safety measure when
   * _isDragging is true at the start of a new drag or on timeout.
   */
  static _forceReset() {
    if (DragHandler._onMove) {
      window.removeEventListener('mousemove', DragHandler._onMove);
      DragHandler._onMove = null;
    }
    if (DragHandler._onStop) {
      window.removeEventListener('mouseup', DragHandler._onStop);
      DragHandler._onStop = null;
    }
    if (DragHandler._rafId !== null) {
      cancelAnimationFrame(DragHandler._rafId);
      DragHandler._rafId = null;
    }
    if (DragHandler._dragTimeoutId !== null) {
      clearTimeout(DragHandler._dragTimeoutId);
      DragHandler._dragTimeoutId = null;
    }
    DragHandler._isDragging = false;
  }

  /**
   * Handle dragging of video controller
   * @param {HTMLVideoElement} video - Video element
   * @param {MouseEvent} e - Mouse event
   */
  static handleDrag(video, e) {
    // If _isDragging is stuck from a previous interrupted drag, reset it
    if (DragHandler._isDragging) {
      DragHandler._forceReset();
    }

    // Validate required elements exist
    if (!video?.vsc?.div) {
      window.VSC.logger.warn('handleDrag: video controller not found');
      return;
    }

    const controller = video.vsc.div;

    if (!controller.shadowRoot) {
      window.VSC.logger.warn('handleDrag: controller shadowRoot not found');
      return;
    }

    const shadowController = controller.shadowRoot.querySelector('#controller');
    if (!shadowController) {
      window.VSC.logger.warn('handleDrag: shadow controller element not found');
      return;
    }

    DragHandler._isDragging = true;
    video.classList.add('vcs-dragging');
    shadowController.classList.add('dragging');

    // Safety timeout: auto-reset if drag is not completed within 10 seconds
    DragHandler._dragTimeoutId = setTimeout(() => {
      if (DragHandler._isDragging) {
        DragHandler._forceReset();
        shadowController.classList.remove('dragging');
        video.classList.remove('vcs-dragging');
        shadowController.style.transform = '';
      }
    }, 10000);

    const initialMouseX = e.clientX;
    const initialMouseY = e.clientY;
    const initialLeft = parseInt(shadowController.style.left) || 0;
    const initialTop = parseInt(shadowController.style.top) || 0;
    let lastDx = 0;
    let lastDy = 0;

    const onMove = (e) => {
      lastDx = e.clientX - initialMouseX;
      lastDy = e.clientY - initialMouseY;

      if (DragHandler._rafId === null) {
        DragHandler._rafId = requestAnimationFrame(() => {
          DragHandler._rafId = null;
          shadowController.style.transform = `translate(${lastDx}px, ${lastDy}px)`;
        });
      }
    };

    const onStop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onStop);
      DragHandler._onMove = null;
      DragHandler._onStop = null;

      if (DragHandler._dragTimeoutId !== null) {
        clearTimeout(DragHandler._dragTimeoutId);
        DragHandler._dragTimeoutId = null;
      }

      if (DragHandler._rafId !== null) {
        cancelAnimationFrame(DragHandler._rafId);
        DragHandler._rafId = null;
      }

      // Commit final position to left/top and clear transform
      shadowController.style.left = `${initialLeft + lastDx}px`;
      shadowController.style.top = `${initialTop + lastDy}px`;
      shadowController.style.transform = '';

      shadowController.classList.remove('dragging');
      video.classList.remove('vcs-dragging');
      DragHandler._isDragging = false;

      window.VSC.logger.debug('Drag operation completed');
    };

    // Attach to window so drag works even when cursor leaves the video area
    DragHandler._onMove = onMove;
    DragHandler._onStop = onStop;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onStop);

    window.VSC.logger.debug('Drag operation started');
  }
}

// Create singleton instance
window.VSC.DragHandler = DragHandler;
