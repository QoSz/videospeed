/**
 * Debug helper for diagnosing Video Speed Controller issues
 * Add this to help troubleshoot controller visibility and popup communication
 */

import { LOG_LEVELS } from './constants';

interface ElementVisibilityInfo {
  connected: boolean;
  display: string;
  visibility: string;
  opacity: string;
  width: number;
  height: number;
  isVisible: boolean;
}

export class DebugHelper {
  public isActive: boolean;

  constructor() {
    this.isActive = false;
  }

  /**
   * Enable debug mode with enhanced logging
   */
  enable(): void {
    this.isActive = true;
    console.log('VSC Debug Mode Enabled');

    // Override logger to be more verbose
    if (window.VSC.logger && window.VSC.Constants.LOG_LEVELS) {
      window.VSC.logger.setVerbosity(LOG_LEVELS.DEBUG);
    }

    // Expose debug instance globally
    window.vscDebug = this;

    console.log(
      'Debug functions available: vscDebug.checkMediaElements(), vscDebug.checkControllers(), vscDebug.testPopupCommunication(), vscDebug.testPopupMessageBridge(), vscDebug.forceShowControllers(), vscDebug.forceShowAudioControllers()'
    );
  }

  /**
   * Alias for checkMediaElements (satisfies VSCDebugHelperInterface)
   */
  checkMedia(): void {
    this.checkMediaElements();
  }

  /**
   * Check all media elements and their detection status
   */
  checkMediaElements(): void {
    console.group('Media Elements Analysis');

    // Check basic video/audio elements
    const videos = document.querySelectorAll('video');
    const audios = document.querySelectorAll('audio');

    console.log(
      `Found ${videos.length} video elements, ${audios.length} audio elements`
    );

    const allMedia: VSCMediaElement[] = [
      ...(Array.from(videos) as VSCMediaElement[]),
      ...(Array.from(audios) as VSCMediaElement[]),
    ];

    allMedia.forEach((media, index) => {
      console.group(`${media.tagName} #${index + 1}`);
      console.log('Element:', media);
      console.log('Connected to DOM:', media.isConnected);
      console.log('Has VSC controller:', !!media.vsc);
      console.log(
        'Current source:',
        media.currentSrc || media.src || 'No source'
      );
      console.log('Ready state:', media.readyState);
      console.log('Paused:', media.paused);
      console.log('Duration:', media.duration);

      // Check computed styles
      const style = window.getComputedStyle(media);
      console.log('Computed styles:', {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        width: style.width,
        height: style.height,
      });

      // Check bounding rect
      const rect = media.getBoundingClientRect();
      console.log('Bounding rect:', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        visible: rect.width > 0 && rect.height > 0,
      });

      // Check if would be detected by VSC
      const vscCtrl = window.VSC_controller as Window['VSC_controller'];
      if (
        window.VSC.MediaElementObserver &&
        vscCtrl?.mediaObserver
      ) {
        const observer = vscCtrl.mediaObserver;
        console.log('VSC would detect:', observer.isValidMediaElement(media));
        console.log(
          'VSC would start hidden:',
          observer.shouldStartHidden(media)
        );
      }

      console.groupEnd();
    });

    // Check for media in shadow DOMs
    this.checkShadowDOMMedia();

    console.groupEnd();
  }

  /**
   * Check shadow DOM for hidden media elements
   */
  private checkShadowDOMMedia(): void {
    console.group('Shadow DOM Media Check');

    let shadowMediaCount = 0;
    const checkElement = (element: Element): void => {
      if (element.shadowRoot) {
        const shadowMedia = element.shadowRoot.querySelectorAll('video, audio');
        if (shadowMedia.length > 0) {
          console.log(
            `Found ${shadowMedia.length} media elements in shadow DOM of:`,
            element
          );
          shadowMediaCount += shadowMedia.length;
          shadowMedia.forEach((media, index) => {
            console.log(`  Shadow media #${index + 1}:`, media);
          });
        }
        // Recursively check shadow roots
        element.shadowRoot.querySelectorAll('*').forEach(checkElement);
      }
    };

    document.querySelectorAll('*').forEach(checkElement);
    console.log(`Total shadow DOM media elements: ${shadowMediaCount}`);

    console.groupEnd();
  }

  /**
   * Check all controllers and their visibility status
   */
  checkControllers(): void {
    console.group('Controllers Analysis');

    const controllers = document.querySelectorAll('vsc-controller');
    console.log(`Found ${controllers.length} VSC controllers`);

    controllers.forEach((controller, index) => {
      console.group(`Controller #${index + 1}`);
      console.log('Element:', controller);
      console.log('Classes:', controller.className);

      const style = window.getComputedStyle(controller);
      console.log('Computed styles:', {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        top: style.top,
        left: style.left,
        zIndex: style.zIndex,
      });

      // Check if hidden by VSC classes
      const isHidden = controller.classList.contains('vsc-hidden');
      const isManual = controller.classList.contains('vsc-manual');
      const hasNoSource = controller.classList.contains('vsc-nosource');

      console.log('VSC State:', {
        hidden: isHidden,
        manual: isManual,
        noSource: hasNoSource,
        effectivelyVisible: !isHidden && style.display !== 'none',
      });

      // Find associated video
      let associatedVideo: VSCMediaElement | null = null;
      const mediaElements = document.querySelectorAll(
        'video, audio'
      ) as NodeListOf<VSCMediaElement>;
      mediaElements.forEach((media) => {
        if (media.vsc && media.vsc.div === controller) {
          associatedVideo = media;
        }
      });

      if (associatedVideo) {
        console.log('Associated media:', associatedVideo);
        console.log(
          'Media visibility would be:',
          this.getElementVisibility(associatedVideo)
        );
      } else {
        console.log('No associated media found');
      }

      console.groupEnd();
    });

    console.groupEnd();
  }

  /**
   * Test popup communication
   */
  testPopupCommunication(): void {
    console.group('Popup Communication Test');

    // Test if message bridge is working
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      console.log('Chrome runtime available');
    } else {
      console.log(
        'Chrome runtime not available (expected in page context)'
      );
    }

    // Test direct VSC message handling
    console.log('Testing direct VSC message handling...');

    // Check if videos would respond
    const videos = document.querySelectorAll(
      'video, audio'
    ) as NodeListOf<VSCMediaElement>;
    console.log(`Found ${videos.length} media elements to control`);

    videos.forEach((video, index) => {
      console.log(`Media #${index + 1}:`, {
        element: video,
        hasController: !!video.vsc,
        currentSpeed: video.playbackRate,
        canControl: !video.classList.contains('vsc-cancelled'),
      });
    });

    // Test simulated popup messages directly
    if (window.VSC_controller?.actionHandler) {
      console.log(
        'Action handler available, testing speed controls...'
      );

      // Test speed adjustment
      const testSpeed = 1.5;
      console.log(`Testing speed change to ${testSpeed}x`);

      videos.forEach((video, index) => {
        if (video.vsc) {
          console.log(
            `Applying speed ${testSpeed} to media #${index + 1} via action handler`
          );
          window.VSC_controller!.actionHandler!.adjustSpeed(
            video,
            testSpeed
          );
        } else {
          console.log(
            `Applying speed ${testSpeed} to media #${index + 1} directly`
          );
          video.playbackRate = testSpeed;
        }
      });

      // Reset after 2 seconds
      setTimeout(() => {
        console.log('Resetting speed to 1.0x');
        videos.forEach((video) => {
          if (video.vsc) {
            window.VSC_controller!.actionHandler!.adjustSpeed(video, 1.0);
          } else {
            video.playbackRate = 1.0;
          }
        });
      }, 2000);
    } else {
      console.log('Action handler not available');
    }

    console.groupEnd();
  }

  /**
   * Test the complete popup message bridge by simulating the message flow
   */
  testPopupMessageBridge(): void {
    console.group('Testing Complete Popup Message Bridge');

    // Test if we can simulate the exact message flow from popup -> content script -> page context
    const testMessages = [
      { type: 'VSC_SET_SPEED', payload: { speed: 1.25 } },
      { type: 'VSC_ADJUST_SPEED', payload: { delta: 0.25 } },
      { type: 'VSC_RESET_SPEED' },
    ];

    console.log('Testing message bridge by simulating popup messages...');

    testMessages.forEach((message, index) => {
      setTimeout(() => {
        console.log(
          `Debug: Simulating popup message ${index + 1}:`,
          message
        );

        // Dispatch the same event that content script would dispatch
        window.dispatchEvent(
          new CustomEvent('VSC_MESSAGE', {
            detail: message,
          })
        );
      }, index * 1500); // 1.5 second delays
    });

    console.log('Messages will be sent with 1.5 second intervals...');
    console.groupEnd();
  }

  /**
   * Force show all controllers for debugging
   */
  forceShowControllers(): number {
    console.log('Force showing all controllers');

    const controllers = document.querySelectorAll('vsc-controller');
    controllers.forEach((controller, index) => {
      const el = controller as HTMLElement;
      // Remove all hiding classes
      el.classList.remove('vsc-hidden', 'vsc-nosource');
      el.classList.add('vsc-manual', 'vsc-show');

      // Force visibility styles
      el.style.display = 'block';
      el.style.visibility = 'visible';
      el.style.opacity = '1';

      console.log(`Controller #${index + 1} forced visible`);
    });

    return controllers.length;
  }

  /**
   * Force show audio controllers specifically
   */
  forceShowAudioControllers(): number {
    console.log('Force showing audio controllers');

    const audioElements = document.querySelectorAll(
      'audio'
    ) as NodeListOf<VSCMediaElement>;
    let controllersShown = 0;

    audioElements.forEach((audio, index) => {
      if (audio.vsc && audio.vsc.div) {
        const controller = audio.vsc.div as HTMLElement;

        // Remove all hiding classes
        controller.classList.remove('vsc-hidden', 'vsc-nosource');
        controller.classList.add('vsc-manual', 'vsc-show');

        // Force visibility styles
        controller.style.display = 'block';
        controller.style.visibility = 'visible';
        controller.style.opacity = '1';

        console.log(`Audio controller #${index + 1} forced visible`);
        controllersShown++;
      } else {
        console.log(`Audio #${index + 1} has no controller attached`);
      }
    });

    return controllersShown;
  }

  /**
   * Get detailed visibility information for an element
   */
  getElementVisibility(element: Element): ElementVisibilityInfo {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      connected: element.isConnected,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      width: rect.width,
      height: rect.height,
      isVisible:
        element.isConnected &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        rect.width > 0 &&
        rect.height > 0,
    };
  }

  /**
   * Monitor controller visibility changes
   */
  monitorControllerChanges(): MutationObserver {
    console.log('Starting controller visibility monitoring');

    const observer = new MutationObserver((mutations: MutationRecord[]) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'class' ||
            mutation.attributeName === 'style')
        ) {
          const target = mutation.target as Element;
          if (target.tagName === 'VSC-CONTROLLER') {
            console.log('Controller visibility changed:', {
              element: target,
              classes: target.className,
              hidden: target.classList.contains('vsc-hidden'),
              manual: target.classList.contains('vsc-manual'),
            });
          }
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class', 'style'],
    });

    return observer;
  }
}

// Create global debug helper instance
window.VSC = window.VSC || ({} as Window['VSC']);
window.VSC.DebugHelper = DebugHelper;
window.vscDebugHelper = new DebugHelper();

// Debug mode can be enabled manually by calling: window.vscDebugHelper.enable()
