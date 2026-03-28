/**
 * Bug regression tests for Video Speed Controller
 * Tests specific edge cases and risks found during code review:
 *   1. showController multi-video timer race
 *   2. Double remove() safety
 *   3. cleanupDisconnected with disconnected elements
 *   4. DragHandler _isDragging reset on re-init
 *   5. Media observer deduplication
 *   6. State manager periodic cleanup start/stop
 *   7. VideoController constructor returns existing controller
 *   8. Mutation observer recheckVideoElement cleanup
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../helpers/chrome-mock.js';
import {
  SimpleTestRunner,
  assert,
  createMockVideo,
  createMockDOM,
  wait,
} from '../helpers/test-utils.js';
import { loadCoreModules } from '../helpers/module-loader.js';

await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();

  // Clean slate for state manager
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.stopPeriodicCleanup();
    window.VSC.stateManager.controllers.clear();
  }

  // Reset DragHandler static state
  window.VSC.DragHandler._isDragging = false;
  window.VSC.DragHandler._rafId = null;
  window.VSC.DragHandler._dragTimeoutId = null;

  // Initialize site handler manager
  if (window.VSC && window.VSC.siteHandlerManager) {
    window.VSC.siteHandlerManager.initialize(document);
  }
});

runner.afterEach(() => {
  cleanupChromeMock();

  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.stopPeriodicCleanup();
    window.VSC.stateManager.controllers.clear();
  }

  // Remove lingering elements
  document.querySelectorAll('video, audio, vsc-controller').forEach((el) => el.remove());

  if (mockDOM) {mockDOM.cleanup();}
});

// ---------------------------------------------------------------------------
// 1. showController multi-video timer
// ---------------------------------------------------------------------------

runner.test('showController for two controllers: BOTH eventually lose vsc-show', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  config.settings.startHidden = false;

  const eventManager = new window.VSC.EventManager(config, null);

  const div1 = document.createElement('div');
  const div2 = document.createElement('div');

  // Rapidly show both controllers
  eventManager.showController(div1);
  eventManager.showController(div2);

  // Both should have vsc-show immediately
  assert.true(
    div1.classList.contains('vsc-show'),
    'Controller 1 should have vsc-show after showController'
  );
  assert.true(
    div2.classList.contains('vsc-show'),
    'Controller 2 should have vsc-show after showController'
  );

  // Wait for both timers to expire (showController uses 2000ms timeout)
  await wait(2200);

  // Both should have vsc-show removed -- this verifies per-controller timers
  assert.false(
    div1.classList.contains('vsc-show'),
    'Controller 1 should have vsc-show removed after timeout'
  );
  assert.false(
    div2.classList.contains('vsc-show'),
    'Controller 2 should have vsc-show removed after timeout'
  );

  eventManager.cleanup();
});

runner.test('showController called twice on same controller resets timer', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  config.settings.startHidden = false;

  const eventManager = new window.VSC.EventManager(config, null);

  const div = document.createElement('div');

  eventManager.showController(div);
  assert.true(div.classList.contains('vsc-show'), 'Should have vsc-show after first call');

  // Wait 1500ms then call again -- timer should reset
  await wait(1500);
  eventManager.showController(div);

  // Wait another 500ms -- if timer was NOT reset, vsc-show would have been removed by now
  await wait(500);
  assert.true(
    div.classList.contains('vsc-show'),
    'vsc-show should still be present because timer was reset'
  );

  // Wait for the reset timer to expire
  await wait(1700);
  assert.false(
    div.classList.contains('vsc-show'),
    'vsc-show should be removed after reset timer expires'
  );

  eventManager.cleanup();
});

// ---------------------------------------------------------------------------
// 2. Double remove() safety
// ---------------------------------------------------------------------------

runner.test('calling remove() twice on VideoController does not throw', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const video = createMockVideo();
  mockDOM.container.appendChild(video);

  const controller = new window.VSC.VideoController(video, null, config, actionHandler);

  assert.exists(video.vsc, 'video.vsc should exist before remove');
  assert.equal(
    window.VSC.stateManager.controllers.size,
    1,
    'State manager should have 1 controller'
  );

  // First remove
  controller.remove();
  assert.equal(video.vsc, undefined, 'video.vsc should be cleared after first remove');
  assert.equal(
    window.VSC.stateManager.controllers.size,
    0,
    'State manager should have 0 controllers after first remove'
  );

  // Second remove -- should not throw
  let threw = false;
  try {
    controller.remove();
  } catch (_e) {
    threw = true;
  }
  assert.false(threw, 'Second remove() should not throw');
  assert.equal(
    window.VSC.stateManager.controllers.size,
    0,
    'State manager should still have 0 controllers after double remove'
  );
});

runner.test('double remove() only calls cleanup logic once', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const video = createMockVideo();
  mockDOM.container.appendChild(video);

  const controller = new window.VSC.VideoController(video, null, config, actionHandler);

  // Track disconnect calls on targetObserver
  let disconnectCount = 0;
  const originalDisconnect = controller.targetObserver.disconnect;
  controller.targetObserver.disconnect = function () {
    disconnectCount++;
    return originalDisconnect.call(this);
  };

  controller.remove();
  controller.remove();

  assert.equal(disconnectCount, 1, 'targetObserver.disconnect should only be called once');
});

// ---------------------------------------------------------------------------
// 3. cleanupDisconnected with disconnected elements
// ---------------------------------------------------------------------------

runner.test('cleanupDisconnected removes controllers with disconnected videos', () => {
  const stateManager = window.VSC.stateManager;

  // Video 1: connected
  const connectedVideo = createMockVideo();
  document.body.appendChild(connectedVideo);

  // Video 2: NOT connected (never appended to DOM)
  const disconnectedVideo = createMockVideo();

  let removeCalled = false;
  const connectedController = {
    controllerId: 'connected-1',
    video: connectedVideo,
    div: document.createElement('div'),
    remove: () => {
      stateManager.unregisterController('connected-1');
    },
  };

  const disconnectedController = {
    controllerId: 'disconnected-1',
    video: disconnectedVideo,
    div: document.createElement('div'),
    remove: () => {
      removeCalled = true;
      stateManager.unregisterController('disconnected-1');
    },
  };

  stateManager.registerController(connectedController);
  stateManager.registerController(disconnectedController);
  assert.equal(stateManager.controllers.size, 2, 'Should start with 2 controllers');

  stateManager.cleanupDisconnected();

  assert.true(removeCalled, 'remove() should be called for disconnected controller');
  assert.equal(stateManager.controllers.size, 1, 'Only connected controller should remain');
  assert.true(
    stateManager.controllers.has('connected-1'),
    'Connected controller should still be registered'
  );
  assert.false(
    stateManager.controllers.has('disconnected-1'),
    'Disconnected controller should be removed'
  );
});

runner.test('cleanupDisconnected handles controller without remove method', () => {
  const stateManager = window.VSC.stateManager;

  const disconnectedVideo = createMockVideo();
  // Not appended to DOM

  // Register a "bare" controller info without a remove method
  const bareController = {
    controllerId: 'bare-1',
    video: disconnectedVideo,
    div: document.createElement('div'),
    // no remove() method
  };

  stateManager.registerController(bareController);
  assert.equal(stateManager.controllers.size, 1, 'Should have 1 controller before cleanup');

  // Should not throw even without remove method
  let threw = false;
  try {
    stateManager.cleanupDisconnected();
  } catch (_e) {
    threw = true;
  }

  assert.false(threw, 'cleanupDisconnected should not throw for controllers without remove()');
  assert.equal(
    stateManager.controllers.size,
    0,
    'Controller without remove() should be deleted directly'
  );
});

// ---------------------------------------------------------------------------
// 4. DragHandler _isDragging reset
// ---------------------------------------------------------------------------

runner.test('DragHandler resets stuck _isDragging via _forceReset on new drag', () => {
  // Simulate a stuck drag state
  window.VSC.DragHandler._isDragging = true;

  // Create a valid drag target
  const video = createMockVideo();
  const wrapper = document.createElement('div');
  wrapper.className = 'vsc-controller';

  const parentDiv = document.createElement('div');
  Object.defineProperty(parentDiv, 'offsetHeight', { value: 480, configurable: true });
  Object.defineProperty(parentDiv, 'offsetWidth', { value: 640, configurable: true });
  parentDiv.appendChild(wrapper);
  document.body.appendChild(parentDiv);

  window.VSC.ShadowDOMManager.createShadowDOM(wrapper);
  video.vsc = { div: wrapper };

  // handleDrag should detect stuck state, _forceReset, then start new drag
  window.VSC.DragHandler.handleDrag(video, { clientX: 100, clientY: 200 });

  assert.true(
    window.VSC.DragHandler._isDragging,
    'Should be dragging again after force reset + new drag'
  );

  // Clean up
  window.dispatchEvent(new Event('mouseup'));
  parentDiv.remove();
});

runner.test('DragHandler _forceReset clears all state', () => {
  // Set up dirty state
  window.VSC.DragHandler._isDragging = true;
  window.VSC.DragHandler._rafId = setTimeout(() => {}, 10000);
  window.VSC.DragHandler._dragTimeoutId = setTimeout(() => {}, 10000);

  window.VSC.DragHandler.forceReset();

  assert.false(window.VSC.DragHandler._isDragging, '_isDragging should be false after _forceReset');
  assert.equal(window.VSC.DragHandler._rafId, null, '_rafId should be null after _forceReset');
  assert.equal(
    window.VSC.DragHandler._dragTimeoutId,
    null,
    '_dragTimeoutId should be null after _forceReset'
  );
});

// ---------------------------------------------------------------------------
// 5. Media observer deduplication
// ---------------------------------------------------------------------------

runner.test('scanForMedia deduplicates videos found via multiple sources', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Create a custom site handler that returns the same video from detectSpecialVideos
  const sharedVideo = document.createElement('video');
  sharedVideo.src = 'https://example.com/shared.mp4';
  mockDOM.container.appendChild(sharedVideo);

  const mockSiteHandler = {
    detectSpecialVideos: () => [sharedVideo],
    shouldIgnoreVideo: () => false,
    getVideoContainerSelectors: () => [],
    getControllerPosition: (parent) => ({
      insertionPoint: parent,
      insertionMethod: 'firstChild',
      targetParent: parent,
    }),
  };

  const mutationObserver = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );
  const mediaObserver = new window.VSC.MediaElementObserver(config, mockSiteHandler);
  mediaObserver.mutationObserver = mutationObserver;

  // scanForMedia finds sharedVideo via querySelectorAll AND detectSpecialVideos
  const found = mediaObserver.scanForMedia(document);

  const occurrences = found.filter((el) => el === sharedVideo).length;
  assert.equal(occurrences, 1, 'scanForMedia should deduplicate: sharedVideo should appear exactly once');
});

runner.test('scanAll deduplicates videos across all scan methods', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const sharedVideo = document.createElement('video');
  sharedVideo.src = 'https://example.com/shared.mp4';
  mockDOM.container.appendChild(sharedVideo);

  const mockSiteHandler = {
    detectSpecialVideos: () => [sharedVideo],
    shouldIgnoreVideo: () => false,
    getVideoContainerSelectors: () => [],
    getControllerPosition: (parent) => ({
      insertionPoint: parent,
      insertionMethod: 'firstChild',
      targetParent: parent,
    }),
  };

  const mutationObserver = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );
  const mediaObserver = new window.VSC.MediaElementObserver(config, mockSiteHandler);
  mediaObserver.mutationObserver = mutationObserver;

  const found = mediaObserver.scanAll(document);

  // scanAll uses [...new Set(allMedia)] to deduplicate
  const occurrences = found.filter((el) => el === sharedVideo).length;
  assert.equal(
    occurrences,
    1,
    'scanAll should deduplicate: sharedVideo should appear exactly once'
  );
});

// ---------------------------------------------------------------------------
// 6. State manager periodic cleanup start/stop
// ---------------------------------------------------------------------------

runner.test('startPeriodicCleanup creates an interval', () => {
  const stateManager = window.VSC.stateManager;

  // Ensure clean state
  stateManager.stopPeriodicCleanup();
  assert.equal(
    stateManager._cleanupInterval,
    null,
    'Interval should be null after stopPeriodicCleanup'
  );

  stateManager.startPeriodicCleanup();
  assert.exists(stateManager._cleanupInterval, 'Interval should be set after startPeriodicCleanup');
  assert.true(typeof stateManager._cleanupInterval === 'object', 'Interval ID should be a Timeout object');

  // Clean up
  stateManager.stopPeriodicCleanup();
});

runner.test('stopPeriodicCleanup clears the interval', () => {
  const stateManager = window.VSC.stateManager;

  stateManager.startPeriodicCleanup();
  assert.exists(stateManager._cleanupInterval, 'Interval should exist after start');

  stateManager.stopPeriodicCleanup();
  assert.equal(stateManager._cleanupInterval, null, 'Interval should be null after stop');
});

runner.test('calling startPeriodicCleanup twice does not create duplicate intervals', () => {
  const stateManager = window.VSC.stateManager;

  stateManager.stopPeriodicCleanup();

  stateManager.startPeriodicCleanup();
  const firstIntervalId = stateManager._cleanupInterval;

  stateManager.startPeriodicCleanup();
  const secondIntervalId = stateManager._cleanupInterval;

  assert.equal(
    firstIntervalId,
    secondIntervalId,
    'Second startPeriodicCleanup should not replace the interval (guard clause returns early)'
  );

  // Clean up
  stateManager.stopPeriodicCleanup();
});

runner.test('stopPeriodicCleanup is safe to call when no interval is running', () => {
  const stateManager = window.VSC.stateManager;

  stateManager.stopPeriodicCleanup();
  assert.equal(stateManager._cleanupInterval, null, 'Should be null before test');

  // Calling stop again should not throw
  let threw = false;
  try {
    stateManager.stopPeriodicCleanup();
  } catch (_e) {
    threw = true;
  }
  assert.false(threw, 'stopPeriodicCleanup should not throw when no interval is running');
  assert.equal(stateManager._cleanupInterval, null, 'Should remain null');
});

// ---------------------------------------------------------------------------
// 7. VideoController constructor returns existing controller
// ---------------------------------------------------------------------------

runner.test('new VideoController returns existing instance for same video', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const video = createMockVideo();
  mockDOM.container.appendChild(video);

  const controller1 = new window.VSC.VideoController(video, null, config, actionHandler);
  assert.exists(video.vsc, 'video.vsc should be set after first construction');

  // Constructing again should return the same instance via singleton pattern
  const controller2 = new window.VSC.VideoController(video, null, config, actionHandler);
  assert.equal(
    controller1,
    controller2,
    'Constructor should return existing controller instance'
  );

  // State manager should still have exactly 1 entry
  assert.equal(
    window.VSC.stateManager.controllers.size,
    1,
    'Should not create duplicate entries in state manager'
  );
});

runner.test('getOrCreate returns existing controller for same video', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const video = createMockVideo();
  mockDOM.container.appendChild(video);

  const controller1 = window.VSC.VideoController.getOrCreate(
    video,
    null,
    config,
    actionHandler
  );
  const controller2 = window.VSC.VideoController.getOrCreate(
    video,
    null,
    config,
    actionHandler
  );

  assert.equal(controller1, controller2, 'getOrCreate should return existing instance');
  assert.equal(video.vsc, controller1, 'video.vsc should reference the original controller');
});

// ---------------------------------------------------------------------------
// 8. Mutation observer recheckVideoElement
// ---------------------------------------------------------------------------

runner.test('recheckVideoElement removes controller when video becomes invalid', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  let removeCalled = false;
  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  mockDOM.container.appendChild(video);

  // Attach a mock controller
  video.vsc = {
    remove: () => {
      removeCalled = true;
      delete video.vsc;
    },
    updateVisibility: () => {},
  };

  const mockMediaObserver = {
    isValidMediaElement: () => false, // Video is now invalid
  };

  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {},
    mockMediaObserver
  );

  observer.recheckVideoElement(video);

  assert.true(removeCalled, 'remove() should be called when video becomes invalid');
  assert.equal(video.vsc, undefined, 'video.vsc should be cleared after removal');
});

runner.test('recheckVideoElement updates visibility when video is still valid', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  let updateVisibilityCalled = false;
  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  mockDOM.container.appendChild(video);

  video.vsc = {
    remove: () => {},
    updateVisibility: () => {
      updateVisibilityCalled = true;
    },
  };

  const mockMediaObserver = {
    isValidMediaElement: () => true, // Video is still valid
  };

  const observer = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {},
    mockMediaObserver
  );

  observer.recheckVideoElement(video);

  assert.true(
    updateVisibilityCalled,
    'updateVisibility() should be called when video is still valid'
  );
});

runner.test('recheckVideoElement attaches controller when video becomes valid', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  let onVideoFoundCalled = false;
  let foundVideo = null;

  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  mockDOM.container.appendChild(video);

  // No existing controller (video.vsc is undefined)

  const mockMediaObserver = {
    isValidMediaElement: () => true,
  };

  const observer = new window.VSC.VideoMutationObserver(
    config,
    (v, _parent) => {
      onVideoFoundCalled = true;
      foundVideo = v;
    },
    () => {},
    mockMediaObserver
  );

  observer.recheckVideoElement(video);

  assert.true(onVideoFoundCalled, 'onVideoFound should be called for newly valid video');
  assert.equal(foundVideo, video, 'onVideoFound should receive the correct video element');
});

runner.test('recheckVideoElement does nothing without mediaObserver', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  mockDOM.container.appendChild(video);
  video.vsc = { remove: () => {}, updateVisibility: () => {} };

  // Create observer without mediaObserver (4th arg)
  const observer = new window.VSC.VideoMutationObserver(config, () => {}, () => {});

  // Should return early without error
  let threw = false;
  try {
    observer.recheckVideoElement(video);
  } catch (_e) {
    threw = true;
  }

  assert.false(threw, 'recheckVideoElement should not throw without mediaObserver');
});

export { runner as bugRegressionTestRunner };
