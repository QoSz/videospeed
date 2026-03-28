/**
 * Stress tests for Video Speed Controller
 * Tests high-volume scenarios: many videos, rapid operations, resource cleanup
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
  getMockStorage as _getMockStorage,
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

runner.test('50 videos should all get controllers', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  for (let i = 0; i < 50; i++) {
    createTestVideoWithController(config, actionHandler, i);
  }

  assert.equal(
    window.VSC.stateManager.controllers.size,
    50,
    'StateManager should track all 50 controllers'
  );
});

runner.test(
  '50 videos with rapid speed changes should not corrupt state',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const videos = [];
    for (let i = 0; i < 50; i++) {
      videos.push(createTestVideoWithController(config, actionHandler, i));
    }

    // Set each video to a different speed
    for (let i = 0; i < 50; i++) {
      const targetSpeed = 1.0 + i * 0.1;
      actionHandler.adjustSpeed(videos[i], targetSpeed);
    }

    // Verify each video kept its correct speed
    for (let i = 0; i < 50; i++) {
      const expectedSpeed = Number((1.0 + i * 0.1).toFixed(2));
      const clampedSpeed = Math.min(
        expectedSpeed,
        window.VSC.Constants.SPEED_LIMITS.MAX
      );
      assert.equal(
        videos[i].playbackRate,
        clampedSpeed,
        `Video ${i} should have speed ${clampedSpeed}, got ${videos[i].playbackRate}`
      );
    }
  }
);

runner.test(
  '100 consecutive adjustSpeed calls produce correct final speed',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const video = createTestVideoWithController(config, actionHandler, 0);

    // Start at 1.0, apply +0.1 ten times => should end at 2.0
    actionHandler.adjustSpeed(video, 1.0);
    for (let i = 0; i < 10; i++) {
      actionHandler.adjustSpeed(video, 0.1, { relative: true });
    }

    assert.approximately(
      video.playbackRate,
      2.0,
      0.05,
      `Expected speed ~2.0 after 10x +0.1, got ${video.playbackRate}`
    );
  }
);

runner.test(
  'Multiple simultaneous resets should not corrupt speedBeforeReset',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const video1 = createTestVideoWithController(config, actionHandler, 0);
    const video2 = createTestVideoWithController(config, actionHandler, 1);
    const video3 = createTestVideoWithController(config, actionHandler, 2);

    // Set each to a different speed
    actionHandler.adjustSpeed(video1, 1.5);
    actionHandler.adjustSpeed(video2, 2.0);
    actionHandler.adjustSpeed(video3, 2.5);

    // Reset all to 1.0
    actionHandler.resetSpeed(video1, 1.0);
    actionHandler.resetSpeed(video2, 1.0);
    actionHandler.resetSpeed(video3, 1.0);

    // Each video should remember its own pre-reset speed
    assert.equal(
      video1.vsc.speedBeforeReset,
      1.5,
      'Video1 should remember speed 1.5'
    );
    assert.equal(
      video2.vsc.speedBeforeReset,
      2.0,
      'Video2 should remember speed 2.0'
    );
    assert.equal(
      video3.vsc.speedBeforeReset,
      2.5,
      'Video3 should remember speed 2.5'
    );

    // All videos should now be at 1.0
    assert.equal(video1.playbackRate, 1.0, 'Video1 should be reset to 1.0');
    assert.equal(video2.playbackRate, 1.0, 'Video2 should be reset to 1.0');
    assert.equal(video3.playbackRate, 1.0, 'Video3 should be reset to 1.0');
  }
);

runner.test(
  'StateManager cleanup with many disconnected controllers',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const videos = [];
    for (let i = 0; i < 100; i++) {
      videos.push(createTestVideoWithController(config, actionHandler, i));
    }

    assert.equal(
      window.VSC.stateManager.controllers.size,
      100,
      'Should start with 100 controllers'
    );

    // Disconnect 50 videos by removing them from the DOM
    for (let i = 0; i < 50; i++) {
      const parent = videos[i].parentElement;
      if (parent && parent.parentNode) {
        parent.parentNode.removeChild(parent);
      }
    }

    // getAllMediaElements triggers cleanup of disconnected elements
    const remaining = window.VSC.stateManager.getAllMediaElements();

    assert.equal(
      remaining.length,
      50,
      `Should have 50 connected elements remaining, got ${remaining.length}`
    );
  }
);

runner.test(
  'Settings debounce under rapid speed changes',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();
    config.settings.rememberSpeed = true;

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const _video = createTestVideoWithController(config, actionHandler, 0);

    // Spy on StorageManager.set
    let storageSetCount = 0;
    const originalSet = window.VSC.StorageManager.set;
    window.VSC.StorageManager.set = async function (data) {
      storageSetCount++;
      return originalSet.call(this, data);
    };

    // Rapidly call save with lastSpeed 50 times
    for (let i = 1; i <= 50; i++) {
      const speed = 1.0 + i * 0.02;
      config.save({ lastSpeed: Number(speed.toFixed(2)) });
    }

    // Wait for debounce to fire (SAVE_DELAY is 1000ms)
    await wait(1500);

    // Debounce should collapse many saves into very few actual storage writes
    assert.lessThan(
      storageSetCount,
      10,
      `Expected fewer than 10 storage writes due to debounce, got ${storageSetCount}`
    );
    assert.greaterThan(
      storageSetCount,
      0,
      'Should have at least 1 storage write'
    );

    // Restore original
    window.VSC.StorageManager.set = originalSet;
  }
);

runner.test(
  'Creating and removing controllers rapidly should not leak',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    // Create 20 controllers
    const firstBatch = [];
    for (let i = 0; i < 20; i++) {
      firstBatch.push(
        createTestVideoWithController(config, actionHandler, i)
      );
    }

    assert.equal(
      window.VSC.stateManager.controllers.size,
      20,
      'Should have 20 controllers after first batch'
    );

    // Remove all 20 controllers
    for (const video of firstBatch) {
      if (video.vsc) {
        video.vsc.remove();
      }
    }

    assert.equal(
      window.VSC.stateManager.controllers.size,
      0,
      'Should have 0 controllers after removal'
    );

    // Create 20 more controllers with different IDs
    for (let i = 20; i < 40; i++) {
      createTestVideoWithController(config, actionHandler, i);
    }

    assert.equal(
      window.VSC.stateManager.controllers.size,
      20,
      'Should have exactly 20 controllers after second batch (no leaks)'
    );
  }
);

runner.test(
  'Many videos with per-video expectedSpeed tracking',
  async () => {
    const config = window.VSC.videoSpeedConfig;
    await config.load();

    const eventManager = new window.VSC.EventManager(config, null);
    const actionHandler = new window.VSC.ActionHandler(config, eventManager);

    const videos = [];
    for (let i = 0; i < 10; i++) {
      videos.push(createTestVideoWithController(config, actionHandler, i));
    }

    // Set each video to a unique speed
    for (let i = 0; i < 10; i++) {
      const targetSpeed = 1.0 + i * 0.25;
      actionHandler.adjustSpeed(videos[i], targetSpeed);
    }

    // Verify each video's expectedSpeed is correct and independent
    for (let i = 0; i < 10; i++) {
      const expectedSpeed = Number((1.0 + i * 0.25).toFixed(2));
      assert.equal(
        videos[i].vsc.expectedSpeed,
        expectedSpeed,
        `Video ${i} expectedSpeed should be ${expectedSpeed}, got ${videos[i].vsc.expectedSpeed}`
      );
      assert.equal(
        videos[i].playbackRate,
        expectedSpeed,
        `Video ${i} playbackRate should be ${expectedSpeed}, got ${videos[i].playbackRate}`
      );
    }
  }
);

console.log('Stress tests loaded');

export { runner as stressTestRunner };
