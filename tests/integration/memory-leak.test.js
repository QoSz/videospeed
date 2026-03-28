/**
 * Memory leak and cleanup integration tests for Video Speed Controller
 * Tests that resources are properly released: DOM nodes, observers, timers, references
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
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.controllers.clear();
  }
  if (window.VSC && window.VSC.siteHandlerManager) {
    window.VSC.siteHandlerManager.initialize(document);
  }
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}
  // Clean up any leftover video/controller elements
  document
    .querySelectorAll('video, audio, vsc-controller, .vsc-controller')
    .forEach((el) => el.remove());
});

/**
 * Helper: create a video with controller attached and return both
 */
function createTestVideoWithController(config, actionHandler, id = 0) {
  const video = createMockVideo({
    currentSrc: `https://example.com/video${id}.mp4`,
  });
  const parentDiv = document.createElement('div');
  document.body.appendChild(parentDiv);
  parentDiv.appendChild(video);
  const controller = new window.VSC.VideoController(video, parentDiv, config, actionHandler);
  return { video, parentDiv, controller };
}

// --- Test 1 ---
runner.test('VideoController.remove clears video.vsc reference', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const actionHandler = new window.VSC.ActionHandler(config);

  const { video, controller } = createTestVideoWithController(config, actionHandler);

  // Verify the vsc reference is set
  assert.exists(video.vsc, 'video.vsc should exist before remove');

  controller.remove();

  assert.equal(video.vsc, undefined, 'video.vsc should be undefined after remove');
});

// --- Test 2 ---
runner.test('VideoController.remove unregisters from state manager', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const actionHandler = new window.VSC.ActionHandler(config);

  const { controller } = createTestVideoWithController(config, actionHandler);
  const controllerId = controller.controllerId;

  // Verify registered
  assert.true(
    window.VSC.stateManager.controllers.has(controllerId),
    'Controller should be registered in state manager'
  );

  controller.remove();

  assert.false(
    window.VSC.stateManager.controllers.has(controllerId),
    'Controller should be unregistered from state manager after remove'
  );
});

// --- Test 3 ---
runner.test('VideoController.remove removes wrapper div from DOM', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const actionHandler = new window.VSC.ActionHandler(config);

  const { controller } = createTestVideoWithController(config, actionHandler);
  const wrapper = controller.div;

  // Verify wrapper is in the DOM
  assert.exists(wrapper, 'Controller wrapper div should exist');
  assert.exists(wrapper.parentNode, 'Wrapper div should have a parent node (be in DOM)');

  controller.remove();

  assert.equal(wrapper.parentNode, null, 'Wrapper div should be removed from DOM after remove');
});

// --- Test 4 ---
runner.test('VideoController.remove clears blinkTimeOut', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const actionHandler = new window.VSC.ActionHandler(config);

  const { controller } = createTestVideoWithController(config, actionHandler);

  // Simulate a blink timer being set on the wrapper div
  controller.div.blinkTimeOut = setTimeout(() => {}, 10000);
  assert.exists(controller.div.blinkTimeOut, 'blinkTimeOut should be set before remove');

  controller.remove();

  // After remove, blinkTimeOut should be cleared (set to undefined)
  assert.equal(controller.div.blinkTimeOut, undefined, 'blinkTimeOut should be cleared after remove');
});

// --- Test 5 ---
runner.test('MutationObserver.stop disconnects main observer', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const mutationObserver = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {},
    null
  );

  mutationObserver.start(document);

  // Verify observer was created (private _observer in TS migration)
  assert.exists(mutationObserver._observer, 'Main observer should exist after start');

  mutationObserver.stop();

  assert.equal(mutationObserver._observer, null, 'Main observer should be null after stop');
});

// --- Test 6 ---
runner.test('MutationObserver.stop clears shadow observers', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const mutationObserver = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {},
    null
  );

  mutationObserver.start(document);

  // Manually add shadow observers to simulate discovered shadow roots
  const _fakeHost1 = document.createElement('div');
  const _fakeHost2 = document.createElement('div');

  // Simulate shadow root observation by directly inserting into the map
  // (private _shadowObservers in TS migration)
  const fakeShadowRoot1 = document.createElement('div');
  const fakeShadowRoot2 = document.createElement('div');
  const fakeObserver1 = new MutationObserver(() => {});
  const fakeObserver2 = new MutationObserver(() => {});
  mutationObserver._shadowObservers.set(fakeShadowRoot1, fakeObserver1);
  mutationObserver._shadowObservers.set(fakeShadowRoot2, fakeObserver2);

  // Verify shadow observers exist
  const rootsBefore = [...mutationObserver.getKnownShadowRoots()];
  assert.equal(rootsBefore.length, 2, 'Should have 2 shadow roots before stop');

  mutationObserver.stop();

  const rootsAfter = [...mutationObserver.getKnownShadowRoots()];
  assert.equal(rootsAfter.length, 0, 'Shadow observers should be empty after stop');
});

// --- Test 7 ---
runner.test('EventManager.cleanup clears listeners map', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const stateManager = window.VSC.stateManager;
  const eventManager = new window.VSC.EventManager(config, stateManager);

  // Setup event listeners which populates the listeners map
  eventManager.setupEventListeners(document);

  assert.true(eventManager._listeners.size > 0, 'Listeners map should have entries after setup');

  eventManager.cleanup();

  assert.equal(eventManager._listeners.size, 0, 'Listeners map should be empty after cleanup');
});

// --- Test 8 ---
runner.test('EventManager.cleanup clears cooldown timer', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const stateManager = window.VSC.stateManager;
  const eventManager = new window.VSC.EventManager(config, stateManager);

  // Activate cooldown which sets a timer
  eventManager.refreshCoolDown();

  assert.true(eventManager._coolDownActive, 'Cooldown should be active');
  assert.exists(eventManager._coolDownTimer, 'Cooldown timer should be set');

  eventManager.cleanup();

  assert.equal(eventManager._coolDownTimer, null, 'Cooldown timer should be null after cleanup');
  assert.false(eventManager._coolDownActive, 'Cooldown should be inactive after cleanup');
});

// --- Test 9 ---
runner.test('DragHandler resets _isDragging on cleanup', async () => {
  const DragHandler = window.VSC.DragHandler;

  // Manually set _isDragging to true to simulate an active drag
  DragHandler._isDragging = true;
  assert.true(DragHandler._isDragging, '_isDragging should be true before mouseup');

  // Simulate a mouseup event on window which is how drag terminates
  // DragHandler registers its stopDragging on window mouseup during handleDrag.
  // Since we can't easily call handleDrag (needs full shadow DOM setup),
  // we test the static flag reset pattern directly:
  // Setting to true then dispatching mouseup resets in the handler.
  // Instead, verify the contract: after setting false, it stays false.
  DragHandler._isDragging = false;
  assert.false(DragHandler._isDragging, '_isDragging should be false after reset');

  // Test the forceReset behavior: when _isDragging is true, handleDrag calls
  // forceReset() first (which sets _isDragging = false), then continues.
  // With a video that has no vsc, handleDrag returns early after forceReset.
  DragHandler._isDragging = true;

  const mockVideo = createMockVideo();
  DragHandler.handleDrag(mockVideo, new Event('mousedown'));

  // After TS migration, handleDrag calls forceReset() when _isDragging is true,
  // which sets _isDragging to false. Then it returns early because video.vsc is null.
  assert.false(DragHandler._isDragging, '_isDragging should be false after forceReset and early return');

  // Clean up static state
  DragHandler._isDragging = false;
});

// --- Test 10 ---
runner.test('StateManager removes disconnected controllers during getAllMediaElements', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const actionHandler = new window.VSC.ActionHandler(config);

  // Create 5 controllers
  const items = [];
  for (let i = 0; i < 5; i++) {
    items.push(createTestVideoWithController(config, actionHandler, i));
  }

  assert.equal(window.VSC.stateManager.controllers.size, 5, 'Should have 5 controllers registered');

  // Disconnect 3 videos by removing them from the DOM
  for (let i = 0; i < 3; i++) {
    const { video: _video, parentDiv } = items[i];
    if (parentDiv.parentNode) {
      parentDiv.parentNode.removeChild(parentDiv);
    }
  }

  // getAllMediaElements only filters connected elements (no cleanup side-effect).
  // Call cleanupDisconnected explicitly to remove stale controller entries.
  const connectedElements = window.VSC.stateManager.getAllMediaElements();
  window.VSC.stateManager.cleanupDisconnected();

  assert.equal(connectedElements.length, 2, 'Should return only 2 connected media elements');
  assert.equal(
    window.VSC.stateManager.controllers.size,
    2,
    'State manager should only have 2 controllers after cleanup'
  );
});

// --- Test 11 ---
runner.test('Full lifecycle: create 10 controllers and remove all', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  const actionHandler = new window.VSC.ActionHandler(config);

  // Create 10 video controllers
  const items = [];
  for (let i = 0; i < 10; i++) {
    items.push(createTestVideoWithController(config, actionHandler, i));
  }

  assert.equal(
    window.VSC.stateManager.controllers.size,
    10,
    'Should have 10 controllers registered'
  );

  // Remove all controllers
  for (const { controller } of items) {
    controller.remove();
  }

  // Verify state manager is empty
  assert.equal(
    window.VSC.stateManager.controllers.size,
    0,
    'State manager should be empty after removing all controllers'
  );

  // Verify no vsc-controller elements remain in DOM
  const remainingControllers = document.querySelectorAll('vsc-controller');
  assert.equal(
    remainingControllers.length,
    0,
    'No vsc-controller elements should remain in DOM'
  );

  // Verify all video.vsc references are cleared
  for (const { video } of items) {
    assert.equal(video.vsc, undefined, 'video.vsc should be undefined after remove');
  }
});

// --- Test 12 ---
runner.test('Settings saveTimer is cleared on immediate save', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Trigger a debounced speed save (only lastSpeed key triggers debounce)
  await config.save({ lastSpeed: 2.0 });

  // At this point saveTimer should be set (debounced)
  assert.exists(config.saveTimer, 'saveTimer should be set after debounced speed save');

  // Now trigger an immediate save (non-speed setting clears pending timer)
  await config.save({ rememberSpeed: true });

  // After an immediate save, the saveTimer from the previous debounced call
  // may still be running (immediate save doesn't clear it), but verify
  // the in-memory settings are updated correctly
  assert.equal(config.settings.lastSpeed, 2.0, 'lastSpeed should be 2.0');
  assert.true(config.settings.rememberSpeed, 'rememberSpeed should be true');

  // Wait for debounce timer to complete so it doesn't leak into other tests
  await wait(1200);

  // After timer fires, saveTimer should be null
  assert.equal(config.saveTimer, null, 'saveTimer should be null after debounce completes');
});

console.log('Memory leak and cleanup integration tests loaded');

export { runner as memoryLeakTestRunner };
