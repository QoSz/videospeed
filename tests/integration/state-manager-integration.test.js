/**
 * Integration tests for VSCStateManager
 * Tests the complete flow: Controller creation → State tracking → Background sync
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockVideo } from '../helpers/test-utils.js';
import { loadCoreModules } from '../helpers/module-loader.js';

// Load all required modules
await loadCoreModules();

const runner = new SimpleTestRunner();

// Setup test environment
runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
});

runner.afterEach(() => {
  cleanupChromeMock();
});


runner.test('StateManager registers and tracks controllers correctly', async () => {
  // Setup
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Clear any existing state
  window.VSC.stateManager.controllers.clear();

  const actionHandler = new window.VSC.ActionHandler(config);
  const mockVideo1 = createMockVideo();
  mockVideo1.src = 'https://example.com/video1.mp4';
  mockVideo1.currentSrc = mockVideo1.src;

  const mockVideo2 = createMockVideo();
  mockVideo2.src = 'https://example.com/video2.mp4';
  mockVideo2.currentSrc = mockVideo2.src;

  // Create parent elements for DOM operations
  const parent1 = document.createElement('div');
  const parent2 = document.createElement('div');
  document.body.appendChild(parent1);
  document.body.appendChild(parent2);
  parent1.appendChild(mockVideo1);
  parent2.appendChild(mockVideo2);

  // Test: Creating first controller should register with state manager
  const controller1 = new window.VSC.VideoController(mockVideo1, parent1, config, actionHandler);

  // Verify controller is registered
  assert.equal(window.VSC.stateManager.controllers.size, 1, 'First controller should be registered');
  assert.true(window.VSC.stateManager.hasControllers(), 'Should indicate active controllers');

  // Verify controller info is stored correctly
  const info1 = window.VSC.stateManager.controllers.get(controller1.controllerId);
  assert.exists(info1, 'Controller info should exist in state manager');
  assert.equal(info1.element, mockVideo1, 'Controller info should reference correct video');

  // Test: Creating second controller
  const controller2 = new window.VSC.VideoController(mockVideo2, parent2, config, actionHandler);

  // Verify both controllers are tracked
  assert.equal(window.VSC.stateManager.controllers.size, 2, 'Both controllers should be registered');

  // Test: Removing first controller
  controller1.remove();

  // Verify controller was removed from state manager
  assert.equal(window.VSC.stateManager.controllers.size, 1, 'Controller should be removed from state manager');

  // Test: Removing last controller
  controller2.remove();

  // Verify all controllers removed
  assert.equal(window.VSC.stateManager.controllers.size, 0, 'All controllers should be removed');
  assert.false(window.VSC.stateManager.hasControllers(), 'Should indicate no active controllers');

  // Cleanup - remove parent divs (videos are children of parents, not document.body)
  parent1.remove();
  parent2.remove();
});

runner.test('StateManager getAllMediaElements includes all tracked videos', async () => {
  // Setup
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Clear any existing state
  window.VSC.stateManager.controllers.clear();

  const actionHandler = new window.VSC.ActionHandler(config);
  const mockVideo1 = createMockVideo();
  const mockVideo2 = createMockVideo();

  // Create parent elements for DOM operations
  const parent1 = document.createElement('div');
  const parent2 = document.createElement('div');
  document.body.appendChild(parent1);
  document.body.appendChild(parent2);
  parent1.appendChild(mockVideo1);
  parent2.appendChild(mockVideo2);

  // Create controllers
  const controller1 = new window.VSC.VideoController(mockVideo1, parent1, config, actionHandler);
  const controller2 = new window.VSC.VideoController(mockVideo2, parent2, config, actionHandler);

  // Test: getAllMediaElements returns all tracked videos
  const allMedia = window.VSC.stateManager.getAllMediaElements();
  assert.equal(allMedia.length, 2, 'Should return all tracked media elements');
  assert.true(allMedia.includes(mockVideo1), 'Should include first video');
  assert.true(allMedia.includes(mockVideo2), 'Should include second video');

  // Test: getAllMediaElements returns only videos with controllers
  const controlledMedia = window.VSC.stateManager.getAllMediaElements();
  assert.equal(controlledMedia.length, 2, 'Should return all controlled elements');
  assert.true(controlledMedia.every(v => v.vsc), 'All returned elements should have vsc property');

  // Cleanup
  controller1.remove();
  controller2.remove();
  parent1.remove();
  parent2.remove();
});

runner.test('StateManager handles disconnected elements gracefully', async () => {
  // Setup
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Clear any existing state
  window.VSC.stateManager.controllers.clear();

  const actionHandler = new window.VSC.ActionHandler(config);
  const mockVideo = createMockVideo();

  // Create parent element for DOM operations
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  parent.appendChild(mockVideo);

  // Create controller (side-effect: registers with state manager)
  new window.VSC.VideoController(mockVideo, parent, config, actionHandler);

  // Verify controller is tracked
  assert.equal(window.VSC.stateManager.controllers.size, 1, 'Controller should be registered');

  // Test: Remove parent from DOM (which also disconnects the video)
  parent.remove();

  // getAllMediaElements filters to connected elements only (no cleanup side-effect).
  // Call cleanupDisconnected explicitly to remove stale controller entries.
  const allMedia = window.VSC.stateManager.getAllMediaElements();
  assert.equal(allMedia.length, 0, 'Should return no media elements after disconnect');

  window.VSC.stateManager.cleanupDisconnected();

  // Verify stale reference was cleaned up
  assert.equal(window.VSC.stateManager.controllers.size, 0, 'Should cleanup stale controller references');
});

runner.test('StateManager handles rapid controller creation correctly', async () => {
  // Setup
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Clear any existing state
  window.VSC.stateManager.controllers.clear();

  const actionHandler = new window.VSC.ActionHandler(config);

  // Create multiple controllers rapidly
  const parents = [];
  const videos = [];
  for (let i = 0; i < 5; i++) {
    const video = createMockVideo();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    parent.appendChild(video);
    videos.push(video);
    parents.push(parent);
    new window.VSC.VideoController(video, parent, config, actionHandler);
  }

  // Verify all controllers are registered despite rapid creation
  assert.equal(window.VSC.stateManager.controllers.size, 5, 'All 5 controllers should be registered');
  assert.true(window.VSC.stateManager.hasControllers(), 'Should have active controllers');

  // Verify getAllMediaElements returns all of them
  const allMedia = window.VSC.stateManager.getAllMediaElements();
  assert.equal(allMedia.length, 5, 'Should return all 5 media elements');

  // Cleanup
  videos.forEach(video => {
    video.vsc?.remove();
  });
  parents.forEach(parent => parent.remove());
});

console.log('State Manager integration tests loaded');

export { runner as stateManagerIntegrationTestRunner };
