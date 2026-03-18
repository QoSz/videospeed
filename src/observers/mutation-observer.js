/**
 * DOM mutation observer for detecting video elements
 */

window.VSC = window.VSC || {};

class VideoMutationObserver {
  constructor(config, onVideoFound, onVideoRemoved, mediaObserver) {
    this.config = config;
    this.onVideoFound = onVideoFound;
    this.onVideoRemoved = onVideoRemoved;
    this.mediaObserver = mediaObserver;
    this.observer = null;
    // Map of shadowRoot → MutationObserver for proper cleanup
    this.shadowObservers = new Map();
  }

  /**
   * Start observing DOM mutations
   * @param {Document} document - Document to observe
   */
  start(document) {
    this.observer = new MutationObserver((mutations) => {
      // Process DOM nodes with reasonable delay
      requestIdleCallback(
        () => {
          this.processMutations(mutations);
        },
        { timeout: 2000 }
      );
    });

    const observerOptions = {
      attributeFilter: ['aria-hidden', 'data-focus-method', 'style', 'class'],
      childList: true,
      subtree: true,
    };

    this.observer.observe(document, observerOptions);
    window.VSC.logger.debug('Video mutation observer started');
  }

  /**
   * Process mutation events
   * @param {Array<MutationRecord>} mutations - Mutation records
   * @private
   */
  processMutations(mutations) {
    // Deduplicate: track nodes already processed to avoid redundant work
    const processedAdded = new WeakSet();
    const processedRemoved = new WeakSet();
    const processedAttributes = new WeakSet();

    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      switch (mutation.type) {
        case 'childList':
          this.processChildListMutation(mutation, processedAdded, processedRemoved);
          break;
        case 'attributes':
          if (!processedAttributes.has(mutation.target)) {
            processedAttributes.add(mutation.target);
            this.processAttributeMutation(mutation);
          }
          break;
      }
    }
  }

  /**
   * Process child list mutations (added/removed nodes)
   * @param {MutationRecord} mutation - Mutation record
   * @private
   */
  processChildListMutation(mutation, processedAdded, processedRemoved) {
    // Handle added nodes
    const addedNodes = mutation.addedNodes;
    for (let i = 0; i < addedNodes.length; i++) {
      const node = addedNodes[i];
      // Only process element nodes (nodeType 1)
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      if (processedAdded && processedAdded.has(node)) {
        continue;
      }
      if (processedAdded) {
        processedAdded.add(node);
      }

      if (node === document.documentElement) {
        // Document was replaced (e.g., watch.sling.com uses document.write)
        window.VSC.logger.debug('Document was replaced, reinitializing');
        this.onDocumentReplaced();
        continue;
      }

      this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, true);
    }

    // Handle removed nodes
    const removedNodes = mutation.removedNodes;
    for (let i = 0; i < removedNodes.length; i++) {
      const node = removedNodes[i];
      // Only process element nodes (nodeType 1)
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      if (processedRemoved && processedRemoved.has(node)) {
        continue;
      }
      if (processedRemoved) {
        processedRemoved.add(node);
      }
      this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, false);
    }
  }

  /**
   * Process attribute mutations
   * @param {MutationRecord} mutation - Mutation record
   * @private
   */
  processAttributeMutation(mutation) {
    // Handle style and class changes that might affect video visibility
    if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
      this.handleVisibilityChanges(mutation.target);
    }

    // Handle special cases like Apple TV+ player
    if (
      (mutation.target.attributes['aria-hidden'] &&
        mutation.target.attributes['aria-hidden'].value === 'false') ||
      mutation.target.nodeName === 'APPLE-TV-PLUS-PLAYER'
    ) {
      // Search within the mutated element's subtree (not the entire document),
      // including nested shadow roots for custom elements like Apple TV+ player
      const searchRoot = mutation.target;
      const videoNodes = [];
      if (searchRoot.querySelectorAll) {
        const direct = searchRoot.querySelectorAll('video');
        for (let i = 0; i < direct.length; i++) {
          videoNodes.push(direct[i]);
        }
      }
      // Recursively search shadow roots within the subtree
      window.VSC.DomUtils.findShadowMedia(searchRoot, 'video', videoNodes);

      for (const node of videoNodes) {
        // Only add vsc the first time for the apple-tv case
        if (node.vsc && mutation.target.nodeName === 'APPLE-TV-PLUS-PLAYER') {
          continue;
        }

        if (node.vsc) {
          node.vsc.remove();
        }

        this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, true);
      }
    }
  }

  /**
   * Handle visibility changes on elements that might contain videos
   * @param {Element} element - Element that had style/class changes
   * @private
   */
  handleVisibilityChanges(element) {
    // If the element itself is a video
    if (
      element.tagName === 'VIDEO' ||
      (element.tagName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      this.recheckVideoElement(element);
      return;
    }

    // Skip leaf nodes that can't contain media (but check shadow roots too)
    if ((!element.children || element.children.length === 0) && !element.shadowRoot) {
      return;
    }

    // Check if element contains videos
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';
    const videos = element.querySelectorAll(mediaTagSelector);

    for (let i = 0; i < videos.length; i++) {
      this.recheckVideoElement(videos[i]);
    }
  }

  /**
   * Re-check if a video element should have a controller attached
   * @param {HTMLMediaElement} video - Video element to recheck
   * @private
   */
  recheckVideoElement(video) {
    if (!this.mediaObserver) {
      return;
    }

    if (video.vsc) {
      // Video already has controller, check if it should be removed or just hidden
      if (!this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became invalid, removing controller');
        video.vsc.remove();
        video.vsc = null;
      } else {
        // Video is still valid, update visibility based on current state
        video.vsc.updateVisibility();
      }
    } else {
      // Video doesn't have controller, check if it should get one
      if (this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became valid, attaching controller');
        this.onVideoFound(video, video.parentElement || video.parentNode);
      }
    }
  }

  /**
   * Check if node is or contains video elements
   * @param {Node} node - Node to check
   * @param {Node} parent - Parent node
   * @param {boolean} added - True if node was added, false if removed
   * @private
   */
  checkForVideoAndShadowRoot(node, parent, added) {
    // For removal events, only proceed if node is truly disconnected
    // Using isConnected handles shadow DOM correctly and is more reliable
    // than document.body.contains() which doesn't work well with shadow DOM
    if (!added && node.isConnected) {
      // Node is still connected somewhere (likely moved, not removed)
      return;
    }

    if (
      node.nodeName === 'VIDEO' ||
      (node.nodeName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      if (added) {
        this.onVideoFound(node, parent);
      } else {
        if (node.vsc) {
          this.onVideoRemoved(node);
        }
      }
    } else {
      this.processNodeChildren(node, parent, added);
    }
  }

  /**
   * Process children of a node recursively
   * @param {Node} node - Node to process
   * @param {Node} parent - Parent node
   * @param {boolean} added - True if node was added
   * @private
   */
  processNodeChildren(node, parent, added) {
    // Handle shadow DOM
    if (node.shadowRoot) {
      this.observeShadowRoot(node.shadowRoot);
      const shadowChildren = node.shadowRoot.children;
      for (let i = 0; i < shadowChildren.length; i++) {
        this.checkForVideoAndShadowRoot(shadowChildren[i], shadowChildren[i].parentNode || parent, added);
      }
    }

    // Handle regular children
    if (node.children) {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        this.checkForVideoAndShadowRoot(children[i], children[i].parentNode || parent, added);
      }
    }
  }

  /**
   * Set up observer for shadow root
   * @param {ShadowRoot} shadowRoot - Shadow root to observe
   * @private
   */
  observeShadowRoot(shadowRoot) {
    if (this.shadowObservers.has(shadowRoot)) {
      return; // Already observing
    }

    const shadowObserver = new MutationObserver((mutations) => {
      requestIdleCallback(
        () => {
          this.processMutations(mutations);
        },
        { timeout: 500 }
      );
    });

    const observerOptions = {
      attributeFilter: ['aria-hidden', 'data-focus-method'],
      childList: true,
      subtree: true,
    };

    shadowObserver.observe(shadowRoot, observerOptions);
    // Store observer instance for proper cleanup
    this.shadowObservers.set(shadowRoot, shadowObserver);

    window.VSC.logger.debug('Shadow root observer added');
  }

  /**
   * Handle document replacement
   * @private
   */
  onDocumentReplaced() {
    // This callback should trigger reinitialization
    window.VSC.logger.warn('Document replacement detected - full reinitialization needed');
  }

  /**
   * Stop observing and clean up
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clean up shadow observers - properly disconnect each one
    this.shadowObservers.forEach((observer, _shadowRoot) => {
      observer.disconnect();
    });
    this.shadowObservers.clear();

    window.VSC.logger.debug('Video mutation observer stopped');
  }
}

// Create singleton instance
window.VSC.VideoMutationObserver = VideoMutationObserver;
