/**
 * Edge-case unit tests for ActionHandler class
 * Tests reset memory, speed clamping, relative mode, persistence, and display toggling
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

/**
 * Helper function to create a test video with a controller
 */
function createTestVideoWithController(config, actionHandler, videoOptions = {}) {
  const mockVideo = createMockVideo(videoOptions);

  // Ensure the video has a proper parent element for DOM operations
  if (!mockVideo.parentElement) {
    const parentDiv = document.createElement('div');
    document.body.appendChild(parentDiv);
    parentDiv.appendChild(mockVideo);
  }

  // Store initial playback rate to preserve test expectations
  const initialPlaybackRate = mockVideo.playbackRate;

  // Create a proper VideoController for this video
  const controller = new window.VSC.VideoController(
    mockVideo,
    mockVideo.parentElement,
    config,
    actionHandler
  );

  // Restore initial playback rate for test consistency
  mockVideo.playbackRate = initialPlaybackRate;

  return mockVideo;
}

runner.afterEach(() => {
  cleanupChromeMock();

  // Clear state manager after each test to prevent state leakage
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.controllers.clear();
  }

  // Remove any lingering elements
  document.querySelectorAll('video, audio, vsc-controller').forEach((el) => el.remove());

  if (mockDOM) {
    mockDOM.cleanup();
  }
});

runner.test('resetSpeed remembers current speed and resets to target', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 2.0 });

  // Reset to 1.0
  actionHandler.resetSpeed(mockVideo, 1.0);

  assert.equal(mockVideo.playbackRate, 1.0, 'Speed should be reset to target');
  assert.equal(
    mockVideo.vsc.speedBeforeReset,
    2.0,
    'speedBeforeReset should remember previous speed'
  );
});

runner.test('resetSpeed restores remembered speed on second call', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 2.0 });

  // First reset: remember 2.0 and go to 1.0
  actionHandler.resetSpeed(mockVideo, 1.0);
  assert.equal(mockVideo.playbackRate, 1.0, 'Should reset to target on first call');

  // Second reset: at target speed with a remembered value, should restore
  actionHandler.resetSpeed(mockVideo, 1.0);
  assert.equal(mockVideo.playbackRate, 2.0, 'Should restore remembered speed on second call');
});

runner.test('resetSpeed clears speedBeforeReset after restore', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 2.0 });

  // First reset: remember speed
  actionHandler.resetSpeed(mockVideo, 1.0);
  assert.equal(mockVideo.vsc.speedBeforeReset, 2.0, 'Should have remembered speed');

  // Second reset: restore and clear memory
  actionHandler.resetSpeed(mockVideo, 1.0);
  assert.equal(
    mockVideo.vsc.speedBeforeReset,
    null,
    'speedBeforeReset should be null after restore'
  );
});

runner.test('adjustSpeed clamps to maximum speed', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 1.0 });

  // Try to set speed far above the limit
  actionHandler.adjustSpeed(mockVideo, 100);

  assert.equal(
    mockVideo.playbackRate,
    window.VSC.Constants.SPEED_LIMITS.MAX,
    'Speed should be clamped to SPEED_LIMITS.MAX (16)'
  );
});

runner.test('adjustSpeed clamps to minimum speed', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 1.0 });

  // Try to set speed below the limit
  actionHandler.adjustSpeed(mockVideo, 0.01);

  assert.equal(
    mockVideo.playbackRate,
    window.VSC.Constants.SPEED_LIMITS.MIN,
    'Speed should be clamped to SPEED_LIMITS.MIN (0.07)'
  );
});

runner.test('adjustSpeed in relative mode adds to current speed', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 1.5 });

  // Relative increase of 0.5
  actionHandler.adjustSpeed(mockVideo, 0.5, { relative: true });

  assert.equal(
    mockVideo.playbackRate,
    2.0,
    'Relative mode should add value to current speed (1.5 + 0.5 = 2.0)'
  );
});

runner.test('setSpeed updates config.settings.lastSpeed', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  config.settings.rememberSpeed = true;

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 1.0 });

  actionHandler.setSpeed(mockVideo, 2.5);

  assert.equal(
    config.settings.lastSpeed,
    2.5,
    'config.settings.lastSpeed should be updated to 2.5'
  );
});

runner.test('setSpeed updates video.vsc.expectedSpeed', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 1.0 });

  actionHandler.setSpeed(mockVideo, 1.75);

  assert.equal(
    mockVideo.vsc.expectedSpeed,
    1.75,
    'video.vsc.expectedSpeed should match the speed set via setSpeed'
  );
});

runner.test('setSpeed updates speedIndicator text', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler, { playbackRate: 1.0 });

  actionHandler.setSpeed(mockVideo, 2.0);

  assert.equal(
    mockVideo.vsc.speedIndicator.textContent,
    '2.00',
    'speedIndicator should display "2.00" after setSpeed(2.0)'
  );
});

runner.test('display action toggles controller visibility', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const mockVideo = createTestVideoWithController(config, actionHandler);
  const controller = mockVideo.vsc.div;

  // Initially should not be hidden or manually toggled
  assert.false(
    controller.classList.contains('vsc-hidden'),
    'Controller should not start hidden'
  );
  assert.false(
    controller.classList.contains('vsc-manual'),
    'Controller should not start with vsc-manual'
  );

  // First display toggle: should add vsc-manual and vsc-hidden
  actionHandler.executeAction('display', null, mockVideo);
  assert.true(
    controller.classList.contains('vsc-manual'),
    'Controller should have vsc-manual after first toggle'
  );
  assert.true(
    controller.classList.contains('vsc-hidden'),
    'Controller should be hidden after first toggle'
  );

  // Second display toggle: should remove vsc-hidden but keep vsc-manual
  actionHandler.executeAction('display', null, mockVideo);
  assert.true(
    controller.classList.contains('vsc-manual'),
    'Controller should keep vsc-manual after second toggle'
  );
  assert.false(
    controller.classList.contains('vsc-hidden'),
    'Controller should be visible after second toggle'
  );
});

export { runner as actionHandlerEdgeTestRunner };
