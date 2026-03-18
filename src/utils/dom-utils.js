/**
 * DOM utility functions for Video Speed Controller
 */

window.VSC = window.VSC || {};
window.VSC.DomUtils = {};

/**
 * Escape string for use in regular expressions
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
window.VSC.DomUtils.escapeStringRegExp = function (str) {
  const matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;
  return str.replace(matchOperatorsRe, '\\$&');
};

/**
 * Check if current page is blacklisted
 * @param {string} blacklist - Newline separated list of patterns
 * @returns {boolean} Whether current page is blacklisted
 */
window.VSC.DomUtils.isBlacklisted = function (blacklist) {
  let blacklisted = false;

  blacklist.split('\n').forEach((match) => {
    match = match.replace(window.VSC.Constants.regStrip, '');
    if (match.length === 0) {
      return;
    }

    let regexp;
    if (match.startsWith('/')) {
      try {
        const parts = match.split('/');
        if (parts.length < 3) {
          return;
        }

        const hasFlags = window.VSC.Constants.regEndsWithFlags.test(match);
        const flags = hasFlags ? parts.pop() : '';
        const regex = parts.slice(1, hasFlags ? undefined : -1).join('/');

        if (!regex) {
          return;
        }
        regexp = new RegExp(regex, flags);
      } catch (err) {
        return;
      }
    } else {
      // For plain strings, check if it looks like a domain pattern
      const escapedMatch = window.VSC.DomUtils.escapeStringRegExp(match);

      // Check if the pattern looks like a domain (contains dots but no slashes)
      const looksLikeDomain = match.includes('.') && !match.includes('/');

      if (looksLikeDomain) {
        // Create a regex that matches the domain more precisely
        // This will match:
        // - After protocol (e.g., https://x.com)
        // - As part of the URL structure (e.g., https://www.x.com)
        // - But NOT partial matches (e.g., x.com does NOT match netflix.com)
        // The pattern ensures domain boundaries are respected
        regexp = new RegExp(`(^|\\.|//)${escapedMatch}(\\/|:|$)`);
      } else {
        // For non-domain patterns, keep the original behavior
        regexp = new RegExp(escapedMatch);
      }
    }

    if (regexp.test(location.href)) {
      blacklisted = true;
    }
  });

  return blacklisted;
};

/**
 * Check if we're running in an iframe
 * @returns {boolean} True if in iframe
 */
window.VSC.DomUtils.inIframe = function () {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};

/**
 * Get all elements in shadow DOMs recursively
 * @param {Element} parent - Parent element to search
 * @param {number} maxDepth - Maximum recursion depth to prevent infinite loops
 * @returns {Array<Element>} Flattened array of all elements
 */
window.VSC.DomUtils.getShadow = function (parent, maxDepth = 10) {
  // Validate parent parameter
  if (!parent || typeof parent !== 'object') {
    return [];
  }

  const result = [];
  const visited = new WeakSet(); // Prevent infinite loops from circular references
  // Use an explicit stack instead of recursion for better performance
  const stack = [{ element: parent, depth: 0 }];

  while (stack.length > 0) {
    const { element, depth } = stack.pop();

    if (!element || depth > maxDepth || visited.has(element)) {
      continue;
    }
    visited.add(element);

    let child = element.firstElementChild;
    while (child) {
      result.push(child);

      // Queue children for processing
      if (child.firstElementChild && depth + 1 <= maxDepth) {
        stack.push({ element: child, depth: depth + 1 });
      }

      // Traverse shadow roots
      if (child.shadowRoot && depth < maxDepth - 2) {
        stack.push({ element: child.shadowRoot, depth: depth + 1 });
      }

      child = child.nextElementSibling;
    }
  }

  return result;
};

/**
 * Find nearest parent of same size as video parent
 * @param {Element} element - Starting element
 * @returns {Element} Parent element
 */
window.VSC.DomUtils.findVideoParent = function (element) {
  let parentElement = element.parentElement;

  // Read dimensions once per iteration to minimize layout thrashing.
  // offsetHeight/offsetWidth trigger layout if dirty, but each read within
  // the same frame after the first is cheap (cached by the engine).
  let currentH = parentElement.offsetHeight;
  let currentW = parentElement.offsetWidth;

  while (parentElement.parentNode && parentElement.parentNode.nodeType === Node.ELEMENT_NODE) {
    const parentH = parentElement.parentNode.offsetHeight;
    const parentW = parentElement.parentNode.offsetWidth;
    if (parentH !== currentH || parentW !== currentW) {
      break;
    }
    parentElement = parentElement.parentNode;
    currentH = parentH;
    currentW = parentW;
  }

  return parentElement;
};

/**
 * Initialize document when ready
 * @param {Document} document - Document to initialize
 * @param {Function} callback - Callback to run when ready
 */
window.VSC.DomUtils.initializeWhenReady = function (document, callback) {
  window.VSC.logger.debug('Begin initializeWhenReady');

  let called = false;
  const callOnce = (doc) => {
    if (called) {
      return;
    }
    called = true;
    callback(doc);
  };

  if (document && document.readyState === 'complete') {
    // Already ready - call immediately, skip adding listeners
    callOnce(document);
    return;
  }

  window.addEventListener('load', () => callOnce(window.document), { once: true });

  if (document) {
    const handleReadyStateChange = () => {
      if (document.readyState === 'complete') {
        document.removeEventListener('readystatechange', handleReadyStateChange);
        callOnce(document);
      }
    };
    document.addEventListener('readystatechange', handleReadyStateChange);
  }

  window.VSC.logger.debug('End initializeWhenReady');
};

/**
 * Check if element or its children are video/audio elements
 * Recursively searches through nested shadow DOM structures
 * @param {Element} node - Node to check
 * @param {boolean} audioEnabled - Whether to check for audio elements
 * @returns {Array<Element>} Array of media elements found
 */
window.VSC.DomUtils.findMediaElements = function (node, audioEnabled = false) {
  if (!node) {
    return [];
  }

  const mediaElements = [];
  const selector = audioEnabled ? 'video,audio' : 'video';

  // Check the node itself
  if (node.matches && node.matches(selector)) {
    mediaElements.push(node);
  }

  // Check children
  if (node.querySelectorAll) {
    const children = node.querySelectorAll(selector);
    for (let i = 0; i < children.length; i++) {
      mediaElements.push(children[i]);
    }
  }

  // Recursively check shadow roots
  if (node.shadowRoot) {
    window.VSC.DomUtils.findShadowMedia(node.shadowRoot, selector, mediaElements);
  }

  return mediaElements;
};

/**
 * Recursively find media elements in shadow DOM trees
 * @param {ShadowRoot|Document|Element} root - Root to search from
 * @param {string} selector - CSS selector for media elements
 * @returns {Array<Element>} Array of media elements found
 */
window.VSC.DomUtils.findShadowMedia = function (root, selector, results) {
  if (!results) {
    results = [];
  }

  // If root is an element with shadowRoot, search in its shadow first
  if (root.shadowRoot) {
    window.VSC.DomUtils.findShadowMedia(root.shadowRoot, selector, results);
  }

  // Add any matching elements in current root (if it's a shadowRoot/document)
  if (root.querySelectorAll) {
    const matches = root.querySelectorAll(selector);
    for (let i = 0; i < matches.length; i++) {
      results.push(matches[i]);
    }

    // Check elements with shadow roots - only custom elements can have them
    const allElements = root.querySelectorAll('*');
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i].shadowRoot) {
        window.VSC.DomUtils.findShadowMedia(allElements[i].shadowRoot, selector, results);
      }
    }
  }

  return results;
};

// Global variables available for both browser and testing
