/**
 * Edge-case unit tests for VSCStateManager
 * Tests registration, cleanup, and query behavior under unusual conditions
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockVideo, createMockDOM } from '../../helpers/test-utils.js';
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

runner.test('registerController stores controller info', () => {
  const stateManager = window.VSC.stateManager;
  const video = createMockVideo();
  document.body.appendChild(video);

  const mockController = {
    controllerId: 1,
    video: video,
    div: document.createElement('div'),
    remove: () => {},
  };

  stateManager.registerController(mockController);

  assert.equal(stateManager.controllers.size, 1, 'Should have 1 controller registered');

  const info = stateManager.controllers.get(1);
  assert.exists(info, 'Controller info should exist in map');
  assert.equal(info.controller, mockController, 'Stored controller should match');
  assert.equal(info.element, video, 'Stored element should be the video');
});

runner.test('registerController rejects null controller', () => {
  const stateManager = window.VSC.stateManager;

  stateManager.registerController(null);

  assert.equal(stateManager.controllers.size, 0, 'Should not register null controller');
});

runner.test('registerController rejects controller without controllerId', () => {
  const stateManager = window.VSC.stateManager;

  stateManager.registerController({});

  assert.equal(stateManager.controllers.size, 0, 'Should not register controller without controllerId');
});

runner.test('getAllMediaElements returns connected video elements', () => {
  const stateManager = window.VSC.stateManager;
  const video = createMockVideo();
  document.body.appendChild(video);

  const mockController = {
    controllerId: 1,
    video: video,
    div: document.createElement('div'),
    remove: () => {},
  };

  stateManager.registerController(mockController);
  const elements = stateManager.getAllMediaElements();

  assert.equal(elements.length, 1, 'Should return 1 connected element');
  assert.equal(elements[0], video, 'Returned element should be the video');
});

runner.test('cleanupDisconnected removes disconnected controllers', () => {
  const stateManager = window.VSC.stateManager;
  const video = createMockVideo();
  // Do NOT append to document -- video.isConnected will be false

  let removeCalled = false;
  const mockController = {
    controllerId: 1,
    video: video,
    div: document.createElement('div'),
    remove: () => {
      removeCalled = true;
      stateManager.unregisterController(1);
    },
  };

  stateManager.registerController(mockController);
  assert.equal(stateManager.controllers.size, 1, 'Should start with 1 controller');

  const elements = stateManager.getAllMediaElements();
  assert.equal(elements.length, 0, 'getAllMediaElements should return no connected elements');

  stateManager.cleanupDisconnected();

  assert.true(removeCalled, 'remove() should have been called on disconnected controller');
  assert.equal(stateManager.controllers.size, 0, 'Disconnected controller should be cleaned up');
});

runner.test('getFirstMedia returns first available media element', () => {
  const stateManager = window.VSC.stateManager;
  const video = createMockVideo();
  document.body.appendChild(video);

  const mockController = {
    controllerId: 1,
    video: video,
    div: document.createElement('div'),
    remove: () => {},
  };

  stateManager.registerController(mockController);
  const first = stateManager.getFirstMedia();

  assert.equal(first, video, 'Should return the registered video');
});

runner.test('getFirstMedia returns null when no controllers', () => {
  const stateManager = window.VSC.stateManager;

  const first = stateManager.getFirstMedia();

  assert.equal(first, null, 'Should return null when no controllers registered');
});

runner.test('hasControllers reflects current state', () => {
  const stateManager = window.VSC.stateManager;

  assert.false(stateManager.hasControllers(), 'Should return false when empty');

  const video = createMockVideo();
  document.body.appendChild(video);

  const mockController = {
    controllerId: 1,
    video: video,
    div: document.createElement('div'),
    remove: () => {},
  };

  stateManager.registerController(mockController);
  assert.true(stateManager.hasControllers(), 'Should return true after registration');

  stateManager.unregisterController(1);
  assert.false(stateManager.hasControllers(), 'Should return false after unregistration');
});

export { runner as stateManagerEdgeTestRunner };
