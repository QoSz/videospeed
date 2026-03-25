/**
 * Unit tests for SiteHandlerManager
 * Tests handler detection, caching, delegation, and refresh
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
} from '../../helpers/chrome-mock.js';
import {
  SimpleTestRunner,
  assert,
  createMockVideo,
  createMockDOM,
  wait,
} from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;
let savedHostname;
let savedHref;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();
  savedHostname = location.hostname;
  savedHref = location.href;
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) mockDOM.cleanup();
  location.hostname = savedHostname;
  location.href = savedHref;
});

/**
 * Helper: create a fresh SiteHandlerManager instance.
 * The class is not exported on window.VSC, but we can
 * get its constructor from the existing singleton.
 */
function createFreshManager() {
  const ManagerClass = window.VSC.siteHandlerManager.constructor;
  return new ManagerClass();
}

// --- Handler detection ---

runner.test(
  'SiteHandlerManager detects BaseSiteHandler for unknown hostname',
  async () => {
    location.hostname = 'example.com';
    location.href = 'http://example.com';

    const manager = createFreshManager();
    const handler = manager.getCurrentHandler();

    assert.exists(handler, 'Handler should exist');
    assert.equal(
      handler.constructor.name,
      'BaseSiteHandler',
      'Should use BaseSiteHandler for unknown site'
    );
  }
);

runner.test('SiteHandlerManager detects YouTube handler', async () => {
  location.hostname = 'www.youtube.com';
  location.href = 'https://www.youtube.com';

  const manager = createFreshManager();
  const handler = manager.getCurrentHandler();

  assert.exists(handler, 'Handler should exist');
  assert.equal(
    handler.constructor.name,
    'YouTubeHandler',
    'Should detect YouTubeHandler'
  );
});

runner.test('SiteHandlerManager detects Netflix handler', async () => {
  location.hostname = 'www.netflix.com';
  location.href = 'https://www.netflix.com';

  const manager = createFreshManager();
  const handler = manager.getCurrentHandler();

  assert.exists(handler, 'Handler should exist');
  assert.equal(
    handler.constructor.name,
    'NetflixHandler',
    'Should detect NetflixHandler'
  );
});

runner.test('SiteHandlerManager detects Facebook handler', async () => {
  location.hostname = 'www.facebook.com';
  location.href = 'https://www.facebook.com';

  const manager = createFreshManager();
  const handler = manager.getCurrentHandler();

  assert.exists(handler, 'Handler should exist');
  assert.equal(
    handler.constructor.name,
    'FacebookHandler',
    'Should detect FacebookHandler'
  );
});

runner.test('SiteHandlerManager detects Amazon handler', async () => {
  location.hostname = 'www.primevideo.com';
  location.href = 'https://www.primevideo.com';

  const manager = createFreshManager();
  const handler = manager.getCurrentHandler();

  assert.exists(handler, 'Handler should exist');
  assert.equal(
    handler.constructor.name,
    'AmazonHandler',
    'Should detect AmazonHandler'
  );
});

runner.test('SiteHandlerManager detects Apple handler', async () => {
  location.hostname = 'tv.apple.com';
  location.href = 'https://tv.apple.com';

  const manager = createFreshManager();
  const handler = manager.getCurrentHandler();

  assert.exists(handler, 'Handler should exist');
  assert.equal(
    handler.constructor.name,
    'AppleHandler',
    'Should detect AppleHandler'
  );
});

// --- Caching ---

runner.test(
  'SiteHandlerManager caches handler after first detection',
  async () => {
    location.hostname = 'example.com';
    location.href = 'http://example.com';

    const manager = createFreshManager();
    const first = manager.getCurrentHandler();
    const second = manager.getCurrentHandler();

    assert.equal(first, second, 'Should return the same cached instance');
  }
);

// --- Delegation ---

runner.test(
  'SiteHandlerManager.getControllerPosition delegates to current handler',
  async () => {
    location.hostname = 'example.com';
    location.href = 'http://example.com';

    const manager = createFreshManager();
    const parent = document.createElement('div');
    const video = document.createElement('video');

    const position = manager.getControllerPosition(parent, video);

    assert.exists(position, 'Should return a position object');
    assert.exists(
      position.insertionPoint,
      'Position should have insertionPoint'
    );
    assert.exists(
      position.insertionMethod,
      'Position should have insertionMethod'
    );
  }
);

runner.test(
  'SiteHandlerManager.shouldIgnoreVideo delegates to handler',
  async () => {
    location.hostname = 'example.com';
    location.href = 'http://example.com';

    const manager = createFreshManager();
    const video = createMockVideo();

    const result = manager.shouldIgnoreVideo(video);

    assert.equal(typeof result, 'boolean', 'Should return a boolean');
    assert.false(result, 'BaseSiteHandler should not ignore any video');
  }
);

// --- Refresh ---

runner.test(
  'SiteHandlerManager.cleanup clears cached handler',
  async () => {
    location.hostname = 'example.com';
    location.href = 'http://example.com';

    const manager = createFreshManager();
    const first = manager.getCurrentHandler();
    assert.exists(first, 'First handler should exist');

    // Cleanup clears the cached handler
    manager.cleanup();

    // Change hostname before getting handler again
    location.hostname = 'www.youtube.com';
    location.href = 'https://www.youtube.com';

    const second = manager.getCurrentHandler();
    assert.notEqual(
      first,
      second,
      'After cleanup, should return a new instance'
    );
    assert.equal(
      second.constructor.name,
      'YouTubeHandler',
      'New handler should reflect updated hostname'
    );
  }
);

export { runner as siteHandlerManagerTestRunner };
