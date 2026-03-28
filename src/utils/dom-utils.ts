/**
 * DOM utility functions for Video Speed Controller
 */

const regStrip: RegExp = /^[\r\t\f\v ]+|[\r\t\f\v ]+$/gm;
const regEndsWithFlags: RegExp = /\/(?!.*(.).*\1)[gimsuy]*$/;

/**
 * Escape string for use in regular expressions
 */
export function escapeStringRegExp(str: string): string {
  const matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;
  return str.replace(matchOperatorsRe, '\\$&');
}

/**
 * Check if current page is blacklisted
 */
export function isBlacklisted(blacklist: string): boolean {
  let blacklisted = false;

  blacklist.split('\n').forEach((rawMatch) => {
    const match = rawMatch.replace(
      (window.VSC.Constants as Record<string, unknown>).regStrip as RegExp ?? regStrip,
      ''
    );
    if (match.length === 0) {
      return;
    }

    let regexp: RegExp;
    if (match.startsWith('/')) {
      try {
        const parts = match.split('/');
        if (parts.length < 3) {
          return;
        }

        const constantsRegex =
          (window.VSC.Constants as Record<string, unknown>).regEndsWithFlags as RegExp ??
          regEndsWithFlags;
        const hasFlags = constantsRegex.test(match);
        const flags = hasFlags ? parts.pop()! : '';
        const regex = parts.slice(1, hasFlags ? undefined : -1).join('/');

        if (!regex) {
          return;
        }
        regexp = new RegExp(regex, flags);
      } catch {
        return;
      }
    } else {
      const escapedMatch = escapeStringRegExp(match);
      const looksLikeDomain = match.includes('.') && !match.includes('/');

      if (looksLikeDomain) {
        regexp = new RegExp(`(^|\\.|//)${escapedMatch}(\\/|:|$)`);
      } else {
        regexp = new RegExp(escapedMatch);
      }
    }

    if (regexp.test(location.href)) {
      blacklisted = true;
    }
  });

  return blacklisted;
}

/**
 * Check if we're running in an iframe
 */
export function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

interface StackEntry {
  readonly element: Element | ShadowRoot;
  readonly depth: number;
}

/**
 * Get all elements in shadow DOMs recursively
 */
export function getShadow(parent: Element | ShadowRoot, maxDepth: number = 10): Element[] {
  if (!parent || typeof parent !== 'object') {
    return [];
  }

  const result: Element[] = [];
  const visited: WeakSet<Element | ShadowRoot> = new WeakSet();
  const stack: StackEntry[] = [{ element: parent, depth: 0 }];

  while (stack.length > 0) {
    const entry = stack.pop()!;
    const { element, depth } = entry;

    if (!element || depth > maxDepth || visited.has(element)) {
      continue;
    }
    visited.add(element);

    let child = element.firstElementChild;
    while (child) {
      result.push(child);

      if (child.firstElementChild && depth + 1 <= maxDepth) {
        stack.push({ element: child, depth: depth + 1 });
      }

      if (child.shadowRoot && depth < maxDepth - 2) {
        stack.push({ element: child.shadowRoot, depth: depth + 1 });
      }

      child = child.nextElementSibling;
    }
  }

  return result;
}

/**
 * Find nearest parent of same size as video parent
 */
export function findVideoParent(element: HTMLMediaElement): HTMLElement {
  let parentElement = element.parentElement!;

  let currentH = parentElement.offsetHeight;
  let currentW = parentElement.offsetWidth;

  while (
    parentElement.parentNode &&
    parentElement.parentNode.nodeType === Node.ELEMENT_NODE
  ) {
    const parentNode = parentElement.parentNode as HTMLElement;
    const parentH = parentNode.offsetHeight;
    const parentW = parentNode.offsetWidth;
    if (parentH !== currentH || parentW !== currentW) {
      break;
    }
    parentElement = parentNode;
    currentH = parentH;
    currentW = parentW;
  }

  return parentElement;
}

/**
 * Initialize document when ready
 */
export function initializeWhenReady(
  document: Document | null,
  callback: (doc: Document) => void
): void {
  window.VSC.logger?.debug('Begin initializeWhenReady');

  let called = false;
  const callOnce = (doc: Document): void => {
    if (called) {
      return;
    }
    called = true;
    callback(doc);
  };

  if (document && document.readyState === 'complete') {
    callOnce(document);
    return;
  }

  window.addEventListener('load', () => callOnce(window.document), { once: true });

  if (document) {
    const handleReadyStateChange = (): void => {
      if (document.readyState === 'complete') {
        document.removeEventListener('readystatechange', handleReadyStateChange);
        callOnce(document);
      }
    };
    document.addEventListener('readystatechange', handleReadyStateChange);
  }

  window.VSC.logger?.debug('End initializeWhenReady');
}

/**
 * Check if element or its children are video/audio elements.
 * Recursively searches through nested shadow DOM structures.
 */
export function findMediaElements(
  node: Element | ShadowRoot | null,
  audioEnabled: boolean = false
): HTMLMediaElement[] {
  if (!node) {
    return [];
  }

  const mediaElements: HTMLMediaElement[] = [];
  const selector = audioEnabled ? 'video,audio' : 'video';

  if ('matches' in node && typeof node.matches === 'function' && node.matches(selector)) {
    mediaElements.push(node as HTMLMediaElement);
  }

  if ('querySelectorAll' in node) {
    const children = node.querySelectorAll(selector);
    for (let i = 0; i < children.length; i++) {
      mediaElements.push(children[i] as HTMLMediaElement);
    }
  }

  if ('shadowRoot' in node && node.shadowRoot) {
    findShadowMedia(node.shadowRoot, selector, mediaElements);
  }

  return mediaElements;
}

/**
 * Recursively find media elements in shadow DOM trees
 */
export function findShadowMedia(
  root: ShadowRoot | Document | Element,
  selector: string,
  results?: HTMLMediaElement[]
): HTMLMediaElement[] {
  const collected = results ?? [];

  if ('shadowRoot' in root && root.shadowRoot) {
    findShadowMedia(root.shadowRoot, selector, collected);
  }

  if ('querySelectorAll' in root) {
    const matches = root.querySelectorAll(selector);
    for (let i = 0; i < matches.length; i++) {
      collected.push(matches[i] as HTMLMediaElement);
    }

    // Walk the tree iteratively instead of querySelectorAll('*') to avoid
    // creating a NodeList of every element in the subtree
    const stack: Element[] = [];
    let child = root.firstElementChild;
    while (child) {
      if (child.shadowRoot) {
        findShadowMedia(child.shadowRoot, selector, collected);
      }
      if (child.firstElementChild) {
        stack.push(child);
        child = child.firstElementChild;
      } else {
        child = child.nextElementSibling;
        while (!child && stack.length > 0) {
          child = stack.pop()!.nextElementSibling;
        }
      }
    }
  }

  return collected;
}

// Runtime namespace assignments
window.VSC = window.VSC || ({} as VSCNamespace);
window.VSC.DomUtils = {
  escapeStringRegExp,
  isBlacklisted,
  inIframe,
  getShadow,
  findVideoParent,
  initializeWhenReady,
  findMediaElements,
  findShadowMedia,
};
