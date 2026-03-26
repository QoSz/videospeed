/**
 * Race condition tests for Video Speed Controller
 * Tests concurrent operations, cooldown mechanisms, and cross-contamination prevention
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
  getMockStorage,
} from '../helpers/chrome-mock.js';
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
  // Reset DragHandler state
  if (window.VSC && window.VSC.DragHandler) {
    window.VSC.DragHandler._isDragging = false;
  }
  // Clean up video elements
  document
    .querySelectorAll('video, audio, .vsc-controller')
    .forEach((el) => el.remove());
});

/**
 * Helper: create a video element with a controller attached
 */
function createTestVideoWithController(config, actionHandler, id = 0) {
  const video = createMockVideo({
    currentSrc: `https://example.com/video${id}.mp4`,
  });
  const parentDiv = document.createElement('div');
  document.body.appendChild(parentDiv);
  parentDiv.appendChild(video);
  new window.VSC.VideoController(video, parentDiv, config, actionHandler);
  return video;
}

runner.test(
  'Cooldown prevents external ratechange from overriding user speed',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);
    eventManager.actionHandler = actionHandler;

    const video = createTestVideoWithController(config, actionHandler, 0);

    // Set up ratechange listener on document (mimics real initialization)
    eventManager.setupEventListeners(document);

    // User sets speed to 2.0 via actionHandler (this starts cooldown)
    actionHandler.setSpeed(video, 2.0);
    assert.equal(video.playbackRate, 2.0, 'Speed should be 2.0 after user set');
    assert.true(
      eventManager.coolDownActive,
      'Cooldown should be active after setSpeed'
    );

    // External code tries to change playbackRate during cooldown
    video.playbackRate = 1.0;

    // Simulate the ratechange event that would fire from the external change
    const rateChangeEvent = new Event('ratechange', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(rateChangeEvent, 'composedPath', {
      value: () => [video],
    });
    eventManager.handleRateChange(rateChangeEvent);

    // During cooldown, the handler should restore the expected speed
    assert.equal(
      video.playbackRate,
      2.0,
      'Cooldown should restore user speed to 2.0 after external override attempt'
    );
    assert.equal(
      video.vsc.expectedSpeed,
      2.0,
      'expectedSpeed should remain 2.0'
    );

    // Cleanup event listeners
    eventManager.cleanup();
  }
);

runner.test(
  "Two controllers don't cross-contaminate expectedSpeed",
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const video1 = createTestVideoWithController(config, actionHandler, 0);
    const video2 = createTestVideoWithController(config, actionHandler, 1);

    // Set video1 to 2.0
    actionHandler.setSpeed(video1, 2.0);
    // Set video2 to 1.5
    actionHandler.setSpeed(video2, 1.5);

    // Verify each video has its own independent expectedSpeed
    assert.equal(
      video1.vsc.expectedSpeed,
      2.0,
      'Video1 expectedSpeed should be 2.0'
    );
    assert.equal(
      video2.vsc.expectedSpeed,
      1.5,
      'Video2 expectedSpeed should be 1.5'
    );

    // Verify playbackRates are also independent
    assert.equal(
      video1.playbackRate,
      2.0,
      'Video1 playbackRate should be 2.0'
    );
    assert.equal(
      video2.playbackRate,
      1.5,
      'Video2 playbackRate should be 1.5'
    );
  }
);

runner.test('Debounced save uses latest speed value', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();
  config.settings.rememberSpeed = true;

  // Spy on StorageManager.set to capture saved data
  const savedValues = [];
  const originalSet = window.VSC.StorageManager.set;
  window.VSC.StorageManager.set = async function (data) {
    savedValues.push(data.lastSpeed);
    return originalSet.call(this, data);
  };

  // Rapidly save three different speed values
  config.save({ lastSpeed: 1.5 });
  config.save({ lastSpeed: 2.0 });
  config.save({ lastSpeed: 2.5 });

  // Wait for debounce timer to fire (SAVE_DELAY is 1000ms)
  await wait(1500);

  // Only the final value should have been written
  assert.greaterThan(
    savedValues.length,
    0,
    'At least one storage write should have occurred'
  );
  const lastSavedValue = savedValues[savedValues.length - 1];
  assert.equal(
    lastSavedValue,
    2.5,
    `Final saved speed should be 2.5, got ${lastSavedValue}`
  );

  // Restore original
  window.VSC.StorageManager.set = originalSet;
});

runner.test('DragHandler concurrent prevention', async () => {
  // Set DragHandler as already dragging
  window.VSC.DragHandler._isDragging = true;

  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  const video = createTestVideoWithController(config, actionHandler, 0);

  // Attempt a second drag while already dragging
  // handleDrag should return early without throwing
  const mockEvent = new Event('mousedown', { bubbles: true });
  Object.defineProperty(mockEvent, 'clientX', { value: 100 });
  Object.defineProperty(mockEvent, 'clientY', { value: 100 });

  // This should be a no-op because _isDragging is true
  window.VSC.DragHandler.handleDrag(video, mockEvent);

  // _isDragging should still be true (the second drag did not start)
  assert.true(
    window.VSC.DragHandler._isDragging,
    'DragHandler should still be in dragging state (concurrent drag rejected)'
  );
});

runner.test(
  'initializeWhenReady fires callback exactly once',
  async () => {
    let callCount = 0;
    const callback = () => {
      callCount++;
    };

    // Document is already complete in JSDOM test environment
    window.VSC.DomUtils.initializeWhenReady(document, callback);

    // Wait a bit to make sure no duplicate calls happen
    await wait(100);

    assert.equal(
      callCount,
      1,
      `Callback should fire exactly once, fired ${callCount} times`
    );
  }
);

runner.test(
  'setSpeed updates expectedSpeed atomically with playbackRate',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const video = createTestVideoWithController(config, actionHandler, 0);

    // Call setSpeed and verify both fields are updated together
    actionHandler.setSpeed(video, 3.0);

    assert.equal(
      video.playbackRate,
      3.0,
      'playbackRate should be 3.0'
    );
    assert.equal(
      video.vsc.expectedSpeed,
      3.0,
      'expectedSpeed should be 3.0'
    );

    // Verify they remain in sync after another change
    actionHandler.setSpeed(video, 0.5);

    assert.equal(
      video.playbackRate,
      0.5,
      'playbackRate should be 0.5'
    );
    assert.equal(
      video.vsc.expectedSpeed,
      0.5,
      'expectedSpeed should be 0.5'
    );
  }
);

runner.test(
  'Multiple videos can be independently speed-controlled',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const video1 = createTestVideoWithController(config, actionHandler, 0);
    const video2 = createTestVideoWithController(config, actionHandler, 1);
    const video3 = createTestVideoWithController(config, actionHandler, 2);

    // Set different speeds
    actionHandler.adjustSpeed(video1, 1.25);
    actionHandler.adjustSpeed(video2, 2.5);
    actionHandler.adjustSpeed(video3, 0.75);

    // Verify independence
    assert.equal(
      video1.playbackRate,
      1.25,
      'Video1 should be at 1.25'
    );
    assert.equal(
      video2.playbackRate,
      2.5,
      'Video2 should be at 2.5'
    );
    assert.equal(
      video3.playbackRate,
      0.75,
      'Video3 should be at 0.75'
    );

    // Change one video and verify others are unaffected
    actionHandler.adjustSpeed(video2, 4.0);

    assert.equal(
      video1.playbackRate,
      1.25,
      'Video1 should still be at 1.25 after video2 change'
    );
    assert.equal(
      video2.playbackRate,
      4.0,
      'Video2 should now be at 4.0'
    );
    assert.equal(
      video3.playbackRate,
      0.75,
      'Video3 should still be at 0.75 after video2 change'
    );
  }
);

runner.test(
  'resetSpeed toggle works independently per video',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const video1 = createTestVideoWithController(config, actionHandler, 0);
    const video2 = createTestVideoWithController(config, actionHandler, 1);

    // Set video1 to 2.0, video2 to 3.0
    actionHandler.adjustSpeed(video1, 2.0);
    actionHandler.adjustSpeed(video2, 3.0);

    assert.equal(video1.playbackRate, 2.0, 'Video1 should be at 2.0');
    assert.equal(video2.playbackRate, 3.0, 'Video2 should be at 3.0');

    // Reset only video1 to 1.0
    actionHandler.resetSpeed(video1, 1.0);

    // Video1 should be reset, video2 should be unchanged
    assert.equal(
      video1.playbackRate,
      1.0,
      'Video1 should be reset to 1.0'
    );
    assert.equal(
      video1.vsc.speedBeforeReset,
      2.0,
      'Video1 should remember pre-reset speed 2.0'
    );
    assert.equal(
      video2.playbackRate,
      3.0,
      'Video2 should be unchanged at 3.0'
    );
    assert.equal(
      video2.vsc.speedBeforeReset,
      null,
      'Video2 speedBeforeReset should still be null'
    );
  }
);

console.log('Race condition tests loaded');

export { runner as raceConditionsTestRunner };
