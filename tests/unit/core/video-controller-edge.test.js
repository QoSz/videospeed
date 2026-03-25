/**
 * Edge-case unit tests for VideoController class
 * Tests singleton pattern, cleanup, visibility, and DOM structure
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockVideo, createMockDOM } from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

// Load all required modules
await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();

  // Clear state manager for tests
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.controllers.clear();
  }

  // Initialize site handler manager for tests
  if (window.VSC && window.VSC.siteHandlerManager) {
    window.VSC.siteHandlerManager.initialize(document);
  }
});

runner.afterEach(() => {
  cleanupChromeMock();

  // Clear state manager after each test to prevent state leakage
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.controllers.clear();
  }

  // Remove any lingering video elements
  document.querySelectorAll('video, audio, vsc-controller').forEach((el) => el.remove());

  if (mockDOM) {
    mockDOM.cleanup();
  }
});

runner.test('getOrCreate returns existing controller when video already has one', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  // Create initial controller
  const controller1 = new window.VSC.VideoController(mockVideo, null, config, actionHandler);
  assert.exists(mockVideo.vsc, 'video.vsc should be set after first creation');

  // Use getOrCreate on the same video - should return existing instance
  const controller2 = window.VSC.VideoController.getOrCreate(
    mockVideo,
    null,
    config,
    actionHandler
  );

  assert.equal(controller1, controller2, 'getOrCreate should return the same instance');
  assert.equal(mockVideo.vsc, controller1, 'video.vsc should still reference original controller');
});

runner.test('remove disconnects targetObserver', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  // Verify targetObserver was created
  assert.exists(controller.targetObserver, 'targetObserver should exist after construction');

  // Track whether disconnect was called
  let disconnectCalled = false;
  const originalDisconnect = controller.targetObserver.disconnect;
  controller.targetObserver.disconnect = function () {
    disconnectCalled = true;
    return originalDisconnect.call(this);
  };

  controller.remove();

  assert.true(disconnectCalled, 'targetObserver.disconnect should be called during remove');
});

runner.test('remove clears video.vsc reference', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);
  assert.exists(mockVideo.vsc, 'video.vsc should exist before remove');

  controller.remove();

  assert.equal(mockVideo.vsc, undefined, 'video.vsc should be undefined after remove');
});

runner.test('remove unregisters from state manager', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  assert.equal(
    window.VSC.stateManager.controllers.size,
    1,
    'State manager should have 1 controller after creation'
  );

  controller.remove();

  assert.equal(
    window.VSC.stateManager.controllers.size,
    0,
    'State manager should have 0 controllers after remove'
  );
});

runner.test('remove clears blinkTimeOut if set', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  // Simulate a pending blink timer on the controller div
  let timerCallbackExecuted = false;
  controller.div.blinkTimeOut = setTimeout(() => {
    timerCallbackExecuted = true;
  }, 50000);

  assert.notEqual(
    controller.div.blinkTimeOut,
    undefined,
    'blinkTimeOut should be set before remove'
  );

  controller.remove();

  // The blinkTimeOut should have been cleared; the callback should never fire.
  // We cannot directly check clearTimeout was called, but we can verify the property
  // was set to undefined by the remove() method.
  // Note: controller.div still references the element even after remove.
  assert.equal(
    controller.div.blinkTimeOut,
    undefined,
    'blinkTimeOut should be undefined after remove'
  );
});

runner.test('_isIntersecting defaults to true without IntersectionObserver', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  // JSDOM does not provide IntersectionObserver, so the fallback should apply
  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  assert.true(
    controller._isIntersecting,
    '_isIntersecting should default to true when IntersectionObserver is unavailable'
  );
});

runner.test('isVideoVisible returns false for disconnected video', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  // Verify it is visible while connected
  assert.true(controller.isVideoVisible(), 'Video should be visible while in DOM');

  // Remove video from DOM to make it disconnected
  mockVideo.parentElement.removeChild(mockVideo);

  assert.false(
    controller.isVideoVisible(),
    'isVideoVisible should return false for disconnected video'
  );
});

runner.test('isVideoVisible returns true for connected visible video', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  assert.true(
    controller.isVideoVisible(),
    'isVideoVisible should return true for a connected, visible video'
  );
});

runner.test('expectedSpeed is set during initialization', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  config.settings.lastSpeed = 1.5;

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo({ playbackRate: 1.0 });
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  assert.exists(mockVideo.vsc.expectedSpeed, 'expectedSpeed should be set after initialization');
  assert.equal(
    typeof mockVideo.vsc.expectedSpeed,
    'number',
    'expectedSpeed should be a number'
  );
  assert.equal(
    mockVideo.vsc.expectedSpeed,
    1.5,
    'expectedSpeed should match the target speed from config'
  );
});

runner.test('controller creates wrapper element with vsc-controller class', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  assert.exists(controller.div, 'Controller div should exist');
  assert.true(
    controller.div.classList.contains('vsc-controller'),
    'Controller div should have vsc-controller class'
  );
  assert.equal(
    controller.div.tagName.toLowerCase(),
    'vsc-controller',
    'Controller wrapper should be a vsc-controller custom element'
  );
});

runner.test('controller creates shadow DOM inside wrapper', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  assert.exists(controller.div.shadowRoot, 'Shadow root should exist on controller wrapper');
  assert.exists(
    controller.div.shadowRoot.querySelector('#controller'),
    'Shadow DOM should contain a #controller element'
  );
});

runner.test('controller stores speedIndicator reference', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createMockVideo();
  mockDOM.container.appendChild(mockVideo);

  const controller = new window.VSC.VideoController(mockVideo, null, config, actionHandler);

  assert.exists(mockVideo.vsc.speedIndicator, 'speedIndicator should exist on video.vsc');
  assert.exists(
    mockVideo.vsc.speedIndicator.textContent,
    'speedIndicator should have textContent'
  );

  // The speed indicator text should be a formatted speed string
  const speedText = mockVideo.vsc.speedIndicator.textContent;
  assert.true(
    speedText.includes('.'),
    'speedIndicator textContent should contain a decimal point'
  );
});

export { runner as videoControllerEdgeTestRunner };
