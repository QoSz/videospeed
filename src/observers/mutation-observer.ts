/**
 * DOM mutation observer for detecting video elements
 */

type VideoFoundCallback = (video: HTMLMediaElement, parent: HTMLElement) => void;
type VideoRemovedCallback = (video: HTMLMediaElement) => void;

export class VideoMutationObserver {
  private readonly config: VSCConfig;
  private readonly onVideoFound: VideoFoundCallback;
  private readonly onVideoRemoved: VideoRemovedCallback;
  private readonly mediaObserver: import('./media-observer').MediaElementObserver | null;
  private _observer: MutationObserver | null;
  private readonly _shadowObservers: Map<ShadowRoot, MutationObserver>;
  private _pendingVisibilityChecks: Set<Element>;
  private _visibilityRafId: ReturnType<typeof requestAnimationFrame> | null;
  private static readonly OBSERVER_OPTIONS: MutationObserverInit = {
    attributeFilter: ['aria-hidden', 'data-focus-method', 'style', 'class'],
    childList: true,
    subtree: true,
  };

  constructor(
    config: VSCConfig,
    onVideoFound: VideoFoundCallback,
    onVideoRemoved: VideoRemovedCallback,
    mediaObserver: import('./media-observer').MediaElementObserver | null
  ) {
    this.config = config;
    this.onVideoFound = onVideoFound;
    this.onVideoRemoved = onVideoRemoved;
    this.mediaObserver = mediaObserver;
    this._observer = null;
    this._shadowObservers = new Map();
    this._pendingVisibilityChecks = new Set();
    this._visibilityRafId = null;
  }

  /**
   * Start observing DOM mutations
   */
  start(target: Node): void {
    this._observer = new MutationObserver((mutations: MutationRecord[]) => {
      this.processMutations(mutations);
    });

    this._observer.observe(target, VideoMutationObserver.OBSERVER_OPTIONS);
    window.VSC.logger.debug('Video mutation observer started');
  }

  /**
   * Process mutation events
   */
  processMutations(mutations: MutationRecord[]): void {
    const processedAdded: WeakSet<Node> = new WeakSet();
    const processedRemoved: WeakSet<Node> = new WeakSet();
    const processedAttributes: WeakSet<Node> = new WeakSet();

    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (!mutation) {
        continue;
      }
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
   */
  private processChildListMutation(
    mutation: MutationRecord,
    processedAdded: WeakSet<Node>,
    processedRemoved: WeakSet<Node>
  ): void {
    const addedNodes = mutation.addedNodes;
    for (let i = 0; i < addedNodes.length; i++) {
      const node = addedNodes[i];
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      if (processedAdded.has(node)) {
        continue;
      }
      processedAdded.add(node);

      this.checkForVideoAndShadowRoot(
        node as Element,
        (node.parentNode as HTMLElement) || (mutation.target as HTMLElement),
        true
      );
    }

    const removedNodes = mutation.removedNodes;
    for (let i = 0; i < removedNodes.length; i++) {
      const node = removedNodes[i];
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      if (processedRemoved.has(node)) {
        continue;
      }
      processedRemoved.add(node);
      this.checkForVideoAndShadowRoot(
        node as Element,
        (node.parentNode as HTMLElement) || (mutation.target as HTMLElement),
        false
      );
    }
  }

  /**
   * Process attribute mutations
   */
  private processAttributeMutation(mutation: MutationRecord): void {
    const target = mutation.target as Element;

    if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
      this.handleVisibilityChanges(target);
    }

    if (
      (target.getAttribute('aria-hidden') === 'false') ||
      target.nodeName === 'APPLE-TV-PLUS-PLAYER'
    ) {
      const searchRoot = target;
      const videoNodes: Element[] = [];
      if (searchRoot.querySelectorAll) {
        const direct = searchRoot.querySelectorAll('video');
        for (let i = 0; i < direct.length; i++) {
          const el = direct[i];
          if (el) {
            videoNodes.push(el);
          }
        }
      }
      window.VSC.DomUtils.findShadowMedia(searchRoot, 'video', videoNodes);

      for (const node of videoNodes) {
        const mediaNode = node as VSCMediaElement;
        if (mediaNode.vsc && target.nodeName === 'APPLE-TV-PLUS-PLAYER') {
          continue;
        }

        if (mediaNode.vsc) {
          mediaNode.vsc.remove();
        }

        this.checkForVideoAndShadowRoot(
          node,
          (node.parentNode as HTMLElement) || (target as HTMLElement),
          true
        );
      }
    }
  }

  /**
   * Handle visibility changes on elements that might contain videos.
   * Batches rechecks into a single requestAnimationFrame to avoid
   * redundant querySelectorAll when an element's style changes rapidly.
   */
  private handleVisibilityChanges(element: Element): void {
    if (
      element.tagName === 'VIDEO' ||
      (element.tagName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      this.recheckVideoElement(element as HTMLMediaElement);
      return;
    }

    if ((!element.children || element.children.length === 0) && !(element as Element).shadowRoot) {
      return;
    }

    this._pendingVisibilityChecks.add(element);
    if (!this._visibilityRafId) {
      this._visibilityRafId = requestAnimationFrame(() => {
        this._flushVisibilityChecks();
      });
    }
  }

  /**
   * Process batched visibility rechecks in a single frame
   */
  private _flushVisibilityChecks(): void {
    this._visibilityRafId = null;
    const elements = this._pendingVisibilityChecks;
    this._pendingVisibilityChecks = new Set();

    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';
    const checked: WeakSet<Element> = new WeakSet();

    for (const element of elements) {
      if (!element.isConnected) {
        continue;
      }
      const videos = element.querySelectorAll(mediaTagSelector);
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        if (video && !checked.has(video)) {
          checked.add(video);
          this.recheckVideoElement(video as HTMLMediaElement);
        }
      }
    }
  }

  /**
   * Re-check if a video element should have a controller attached
   */
  private recheckVideoElement(video: HTMLMediaElement): void {
    if (!this.mediaObserver) {
      return;
    }

    const mediaElement = video as VSCMediaElement;

    if (mediaElement.vsc) {
      if (!this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became invalid, removing controller');
        mediaElement.vsc.remove();
      } else {
        mediaElement.vsc.updateVisibility();
      }
    } else {
      if (this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became valid, attaching controller');
        this.onVideoFound(video, (video.parentElement || video.parentNode) as HTMLElement);
      }
    }
  }

  /**
   * Check if node is or contains video elements
   */
  private checkForVideoAndShadowRoot(node: Element, parent: HTMLElement, added: boolean): void {
    if (!added && node.isConnected) {
      return;
    }

    if (
      node.nodeName === 'VIDEO' ||
      (node.nodeName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      if (added) {
        this.onVideoFound(node as HTMLMediaElement, parent);
      } else {
        const mediaNode = node as VSCMediaElement;
        if (mediaNode.vsc) {
          this.onVideoRemoved(node as HTMLMediaElement);
        }
      }
    } else {
      this.processNodeChildren(node, parent, added);
    }
  }

  /**
   * Process children of a node recursively
   */
  private processNodeChildren(node: Element, parent: HTMLElement, added: boolean): void {
    if (node.shadowRoot) {
      if (added) {
        this.observeShadowRoot(node.shadowRoot);
      } else {
        const observer = this._shadowObservers.get(node.shadowRoot);
        if (observer) {
          observer.disconnect();
          this._shadowObservers.delete(node.shadowRoot);
        }
      }
      const shadowChildren = node.shadowRoot.children;
      for (let i = 0; i < shadowChildren.length; i++) {
        const child = shadowChildren[i];
        if (child) {
          this.checkForVideoAndShadowRoot(
            child,
            (child.parentNode as HTMLElement) || parent,
            added
          );
        }
      }
    }

    if (node.children) {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child) {
          this.checkForVideoAndShadowRoot(
            child,
            (child.parentNode as HTMLElement) || parent,
            added
          );
        }
      }
    }
  }

  /**
   * Set up observer for shadow root
   */
  observeShadowRoot(shadowRoot: ShadowRoot): void {
    if (this._shadowObservers.has(shadowRoot)) {
      return;
    }

    const shadowObserver = new MutationObserver((mutations: MutationRecord[]) => {
      this.processMutations(mutations);
    });

    shadowObserver.observe(shadowRoot, VideoMutationObserver.OBSERVER_OPTIONS);
    this._shadowObservers.set(shadowRoot, shadowObserver);

    window.VSC.logger.debug('Shadow root observer added');
  }

  /**
   * Get all known shadow roots discovered during observation.
   * Used by MediaElementObserver to search for media in shadow DOMs
   * without the expensive querySelectorAll('*') full-DOM scan.
   */
  getKnownShadowRoots(): IterableIterator<ShadowRoot> {
    return this._shadowObservers.keys();
  }

  /**
   * Stop observing and clean up
   */
  stop(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    this._shadowObservers.forEach((observer: MutationObserver, _shadowRoot: ShadowRoot) => {
      observer.disconnect();
    });
    this._shadowObservers.clear();

    if (this._visibilityRafId) {
      cancelAnimationFrame(this._visibilityRafId);
      this._visibilityRafId = null;
    }
    this._pendingVisibilityChecks.clear();

    window.VSC.logger.debug('Video mutation observer stopped');
  }
}

window.VSC.VideoMutationObserver = VideoMutationObserver;
