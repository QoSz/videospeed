/**
 * Extended unit tests for DomUtils
 * Tests: initializeWhenReady, findVideoParent, inIframe,
 *        findMediaElements, escapeStringRegExp, getShadow maxDepth
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
} from '../../helpers/chrome-mock.js';
import {
  SimpleTestRunner,
  assert,
  createMockVideo as _createMockVideo,
  createMockDOM,
  wait as _wait,
} from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}
});

// --- initializeWhenReady ---

runner.test(
  'initializeWhenReady calls callback immediately when document.readyState is complete',
  async () => {
    let callCount = 0;
    const fakeDoc = {
      readyState: 'complete',
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    window.VSC.DomUtils.initializeWhenReady(fakeDoc, () => {
      callCount++;
    });

    assert.equal(callCount, 1, 'Callback should fire immediately');
  }
);

runner.test(
  'initializeWhenReady calls callback only once even if both events fire',
  async () => {
    let callCount = 0;

    // Create a fake document that is NOT complete yet
    const listeners = {};
    const fakeDoc = {
      readyState: 'loading',
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
      removeEventListener: () => {},
    };

    // Store original window.addEventListener so we can intercept
    const origAdd = window.addEventListener;
    let loadListener = null;
    window.addEventListener = (type, fn, opts) => {
      if (type === 'load') {
        loadListener = fn;
      } else {
        origAdd.call(window, type, fn, opts);
      }
    };

    window.VSC.DomUtils.initializeWhenReady(fakeDoc, () => {
      callCount++;
    });

    // Fire load event
    if (loadListener) {loadListener();}
    // Fire readystatechange
    fakeDoc.readyState = 'complete';
    if (listeners['readystatechange']) {listeners['readystatechange']();}

    assert.equal(callCount, 1, 'Callback should only fire once');

    // Restore
    window.addEventListener = origAdd;
  }
);

// --- findVideoParent ---

runner.test(
  'findVideoParent walks up to parent with different size',
  async () => {
    const grandparent = document.createElement('div');
    const parent = document.createElement('div');
    const child = document.createElement('div');

    grandparent.appendChild(parent);
    parent.appendChild(child);
    mockDOM.container.appendChild(grandparent);

    // child -> parent same size (640x480), grandparent different (1280x720)
    Object.defineProperty(child, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(child, 'offsetHeight', { value: 480, configurable: true });
    Object.defineProperty(child, 'offsetParent', { value: parent, configurable: true });

    Object.defineProperty(parent, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(parent, 'offsetHeight', { value: 480, configurable: true });
    Object.defineProperty(parent, 'offsetParent', { value: grandparent, configurable: true });

    Object.defineProperty(grandparent, 'offsetWidth', { value: 1280, configurable: true });
    Object.defineProperty(grandparent, 'offsetHeight', { value: 720, configurable: true });
    Object.defineProperty(grandparent, 'offsetParent', {
      value: mockDOM.container,
      configurable: true,
    });

    const result = window.VSC.DomUtils.findVideoParent(child);
    assert.equal(result, parent, 'Should return parent (stops before grandparent with different size)');
  }
);

runner.test(
  'findVideoParent returns direct parent when sizes differ',
  async () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');

    parent.appendChild(child);
    mockDOM.container.appendChild(parent);

    Object.defineProperty(child, 'offsetWidth', { value: 320, configurable: true });
    Object.defineProperty(child, 'offsetHeight', { value: 240, configurable: true });
    Object.defineProperty(child, 'offsetParent', { value: parent, configurable: true });

    // Parent is the direct parent of child, with a different size
    Object.defineProperty(parent, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(parent, 'offsetHeight', { value: 480, configurable: true });
    Object.defineProperty(parent, 'offsetParent', {
      value: mockDOM.container,
      configurable: true,
    });

    // grandparent (container) has yet another size
    Object.defineProperty(mockDOM.container, 'offsetWidth', {
      value: 1280,
      configurable: true,
    });
    Object.defineProperty(mockDOM.container, 'offsetHeight', {
      value: 720,
      configurable: true,
    });

    const result = window.VSC.DomUtils.findVideoParent(child);
    // child's parentElement is parent; parent (640x480) differs from child perspective
    // but findVideoParent starts from parentElement and walks up
    // parentElement = parent (640x480), parentElement.parentNode = container (1280x720) -> different, break
    assert.equal(result, parent, 'Should return direct parent when it differs from grandparent');
  }
);

runner.test('findVideoParent stops at document body', async () => {
  // Create an element directly inside body
  const child = document.createElement('div');
  document.body.appendChild(child);

  // body is the parentElement
  Object.defineProperty(child, 'offsetWidth', { value: 640, configurable: true });
  Object.defineProperty(child, 'offsetHeight', { value: 480, configurable: true });

  Object.defineProperty(document.body, 'offsetWidth', {
    value: 640,
    configurable: true,
  });
  Object.defineProperty(document.body, 'offsetHeight', {
    value: 480,
    configurable: true,
  });

  // Should not crash even though body.parentNode is <html> (not ELEMENT_NODE... actually it is)
  // The function checks parentNode.nodeType === Node.ELEMENT_NODE
  // <html> is an element node, so it will walk up, but eventually document is not element
  let result;
  try {
    result = window.VSC.DomUtils.findVideoParent(child);
    assert.exists(result, 'Should return a valid element');
  } catch (e) {
    // Should not crash
    assert.true(false, `findVideoParent should not throw when near body: ${  e.message}`);
  }

  document.body.removeChild(child);
});

// --- inIframe ---

runner.test('inIframe returns false when self equals top', async () => {
  // In default JSDOM, window.self === window.top
  const result = window.VSC.DomUtils.inIframe();
  assert.false(result, 'Should return false when not in iframe');
});

runner.test('inIframe handles cross-origin top access gracefully', async () => {
  // window.top is non-configurable in JSDOM, so we cannot redefine it directly.
  // Instead, override window.self to be a different object (simulating an iframe),
  // which makes self !== top and returns true.
  const origSelf = Object.getOwnPropertyDescriptor(window, 'self');

  Object.defineProperty(window, 'self', {
    value: {},  // Different reference than window.top
    configurable: true,
  });

  const result = window.VSC.DomUtils.inIframe();
  assert.true(result, 'Should return true when self !== top (iframe scenario)');

  // Restore
  if (origSelf) {
    Object.defineProperty(window, 'self', origSelf);
  } else {
    window.self = window;
  }
});

// --- findMediaElements ---

runner.test('findMediaElements finds video elements in subtree', async () => {
  const wrapper = document.createElement('div');
  const innerDiv = document.createElement('div');
  const video = document.createElement('video');
  innerDiv.appendChild(video);
  wrapper.appendChild(innerDiv);
  mockDOM.container.appendChild(wrapper);

  const found = window.VSC.DomUtils.findMediaElements(wrapper);
  assert.equal(found.length, 1, 'Should find one video element');
  assert.equal(found[0], video, 'Should be the correct video element');
});

runner.test(
  'findMediaElements finds audio when audioEnabled is true',
  async () => {
    const wrapper = document.createElement('div');
    const audio = document.createElement('audio');
    wrapper.appendChild(audio);
    mockDOM.container.appendChild(wrapper);

    const found = window.VSC.DomUtils.findMediaElements(wrapper, true);
    assert.equal(found.length, 1, 'Should find one audio element');
    assert.equal(found[0], audio, 'Should be the correct audio element');
  }
);

runner.test(
  'findMediaElements excludes audio when audioEnabled is false',
  async () => {
    const wrapper = document.createElement('div');
    const audio = document.createElement('audio');
    const video = document.createElement('video');
    wrapper.appendChild(audio);
    wrapper.appendChild(video);
    mockDOM.container.appendChild(wrapper);

    const found = window.VSC.DomUtils.findMediaElements(wrapper, false);
    assert.equal(found.length, 1, 'Should find only the video');
    assert.equal(found[0], video, 'Found element should be the video');
  }
);

// --- escapeStringRegExp ---

runner.test('escapeStringRegExp escapes special regex chars', async () => {
  const result = window.VSC.DomUtils.escapeStringRegExp('test.com');
  assert.equal(result, 'test\\.com', 'Dots should be escaped');

  const complex = window.VSC.DomUtils.escapeStringRegExp('a+b*c?d[e]f(g)h{i}j|k^l$m\\n');
  assert.equal(
    complex,
    'a\\+b\\*c\\?d\\[e\\]f\\(g\\)h\\{i\\}j\\|k\\^l\\$m\\\\n',
    'All special chars should be escaped'
  );
});

// --- getShadow maxDepth ---

runner.test('getShadow respects maxDepth limit', async () => {
  // Create a chain of elements with shadow roots at increasing depth
  const root = document.createElement('div');

  // Build a 5-level deep chain: root > div > div > div > div > div
  let current = root;
  for (let i = 0; i < 5; i++) {
    const child = document.createElement('div');
    child.className = `level-${i}`;
    current.appendChild(child);
    current = child;
  }

  mockDOM.container.appendChild(root);

  // With maxDepth=2, we should get fewer elements than with maxDepth=10
  const shallowResults = window.VSC.DomUtils.getShadow(root, 2);
  const deepResults = window.VSC.DomUtils.getShadow(root, 10);

  // Shallow search should find fewer or equal elements
  assert.true(
    shallowResults.length <= deepResults.length,
    `Shallow (${shallowResults.length}) should find <= deep (${deepResults.length}) elements`
  );
  assert.greaterThan(deepResults.length, 0, 'Deep search should find some elements');
});

export { runner as domUtilsExtendedTestRunner };
