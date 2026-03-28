import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
} from '../../helpers/chrome-mock.js';
import {
  SimpleTestRunner,
  assert,
  createMockDOM,
  wait,
} from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

await loadCoreModules();
const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.controllers.clear();
  }
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}
});

// --- Tests ---

runner.test('MutationObserver can be constructed with callbacks', () => {
  const config = { settings: {} };
  const onVideoFound = () => {};
  const onVideoRemoved = () => {};

  const observer = new window.VSC.VideoMutationObserver(
    config,
    onVideoFound,
    onVideoRemoved
  );

  assert.exists(observer, 'Observer should exist');
  assert.equal(observer.onVideoFound, onVideoFound, 'onVideoFound should be set');
  assert.equal(observer.onVideoRemoved, onVideoRemoved, 'onVideoRemoved should be set');
  assert.equal(observer._observer, null, 'Internal observer should be null before start');
});

runner.test('start begins observing document', () => {
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );

  observer.start(document);

  assert.exists(observer._observer, 'Internal MutationObserver should be created after start');

  // Cleanup
  observer.stop();
});

runner.test('stop disconnects observer', () => {
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );

  observer.start(document);
  assert.exists(observer._observer, 'Observer should exist after start');

  observer.stop();
  assert.equal(observer._observer, null, 'Observer should be null after stop');
});

runner.test('stop clears shadow observers', () => {
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );

  observer.start(document);

  // Manually create a shadow root and observe it
  const host = document.createElement('div');
  mockDOM.container.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  observer.observeShadowRoot(shadowRoot);

  assert.greaterThan(
    observer._shadowObservers.size,
    0,
    'Should have at least one shadow observer'
  );

  observer.stop();

  assert.equal(observer._shadowObservers.size, 0, 'Shadow observers should be cleared after stop');
});

runner.test('getKnownShadowRoots returns empty initially', () => {
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );

  const roots = Array.from(observer.getKnownShadowRoots());
  assert.equal(roots.length, 0, 'Should have no known shadow roots initially');
});

runner.test('processMutations handles added video elements', async () => {
  const foundVideos = [];
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    (video, parent) => foundVideos.push({ video, parent }),
    () => {}
  );

  const videoElement = document.createElement('video');

  const mutations = [
    {
      type: 'childList',
      addedNodes: [videoElement],
      removedNodes: [],
      target: document.body,
    },
  ];

  observer.processMutations(mutations);
  await wait(50);

  assert.equal(foundVideos.length, 1, 'onVideoFound should be called once');
  assert.equal(foundVideos[0].video, videoElement, 'Should find the added video element');
});

runner.test('processMutations handles removed video elements', async () => {
  const removedVideos = [];
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    (video) => removedVideos.push(video)
  );

  // Create a video that is NOT connected to the DOM (so isConnected is false)
  const videoElement = document.createElement('video');
  videoElement.vsc = { remove: () => {} };

  const mutations = [
    {
      type: 'childList',
      addedNodes: [],
      removedNodes: [videoElement],
      target: document.body,
    },
  ];

  observer.processMutations(mutations);
  await wait(50);

  assert.equal(removedVideos.length, 1, 'onVideoRemoved should be called once');
  assert.equal(removedVideos[0], videoElement, 'Should report the removed video');
});

runner.test('processMutations skips non-element nodes', async () => {
  const foundVideos = [];
  const removedVideos = [];
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    (video, parent) => foundVideos.push({ video, parent }),
    (video) => removedVideos.push(video)
  );

  const textNode = document.createTextNode('hello');
  const commentNode = document.createComment('a comment');

  const mutations = [
    {
      type: 'childList',
      addedNodes: [textNode, commentNode],
      removedNodes: [document.createTextNode('bye')],
      target: document.body,
    },
  ];

  observer.processMutations(mutations);
  await wait(50);

  assert.equal(foundVideos.length, 0, 'No videos should be found from text/comment nodes');
  assert.equal(removedVideos.length, 0, 'No videos should be removed from text/comment nodes');
});

runner.test('processMutations deduplicates added nodes', async () => {
  const foundVideos = [];
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    (video, parent) => foundVideos.push({ video, parent }),
    () => {}
  );

  const videoElement = document.createElement('video');

  // Same video in two mutation records
  const mutations = [
    {
      type: 'childList',
      addedNodes: [videoElement],
      removedNodes: [],
      target: document.body,
    },
    {
      type: 'childList',
      addedNodes: [videoElement],
      removedNodes: [],
      target: document.body,
    },
  ];

  observer.processMutations(mutations);
  await wait(50);

  assert.equal(foundVideos.length, 1, 'onVideoFound should be called only once for duplicated node');
});

runner.test('stop is safe to call multiple times', () => {
  const config = { settings: {} };
  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );

  observer.start(document);

  // Call stop twice -- should not throw
  observer.stop();
  observer.stop();

  assert.equal(observer._observer, null, 'Observer should be null after double stop');
  assert.equal(observer._shadowObservers.size, 0, 'Shadow observers should be empty');
});

export { runner as mutationObserverEdgeTestRunner };
