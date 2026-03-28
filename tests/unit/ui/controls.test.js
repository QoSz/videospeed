/**
 * Unit tests for ControlsManager class
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

  // Clear state manager for tests
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.controllers.clear();
  }
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}
});

/**
 * Helper to create a shadow DOM with controls and a spied action handler
 */
function createControlsSetup() {
  const config = window.VSC.videoSpeedConfig;
  const eventManager = new window.VSC.EventManager(config, null);
  const actionHandler = new window.VSC.ActionHandler(config, eventManager);

  // Spy on runAction and adjustSpeed
  let lastAction = null;
  let adjustSpeedCalled = false;
  let lastAdjustArgs = null;

  actionHandler.runAction = (action, value, _event) => {
    lastAction = { action, value };
  };

  const _origAdjustSpeed = actionHandler.adjustSpeed.bind(actionHandler);
  actionHandler.adjustSpeed = (video, speedDelta, options) => {
    adjustSpeedCalled = true;
    lastAdjustArgs = { video, speedDelta, options };
  };

  const controlsManager = new window.VSC.ControlsManager(actionHandler, config);

  // Create wrapper with shadow DOM
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);
  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);

  // Create mock video
  const video = createMockVideo();
  const parentDiv = document.createElement('div');
  parentDiv.appendChild(video);
  document.body.appendChild(parentDiv);

  return {
    config,
    actionHandler,
    controlsManager,
    shadow,
    wrapper,
    video,
    getLastAction: () => lastAction,
    resetLastAction: () => { lastAction = null; },
    getAdjustSpeedCalled: () => adjustSpeedCalled,
    getLastAdjustArgs: () => lastAdjustArgs,
    resetAdjustSpeed: () => { adjustSpeedCalled = false; lastAdjustArgs = null; },
  };
}

runner.test('setupControls sets up click handlers on all buttons', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  // Click the 'faster' button
  const fasterBtn = setup.shadow.querySelector('button[data-action="faster"]');
  assert.exists(fasterBtn, 'Faster button should exist');

  fasterBtn.dispatchEvent(new Event('click', { bubbles: true }));

  const action = setup.getLastAction();
  assert.exists(action, 'Action should have been called');
  assert.equal(action.action, 'faster');
});

runner.test('clicking slower button triggers slower action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  const slowerBtn = setup.shadow.querySelector('button[data-action="slower"]');
  slowerBtn.dispatchEvent(new Event('click', { bubbles: true }));

  const action = setup.getLastAction();
  assert.exists(action, 'Action should have been called');
  assert.equal(action.action, 'slower');
});

runner.test('clicking rewind button triggers rewind action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  const rewindBtn = setup.shadow.querySelector('button[data-action="rewind"]');
  rewindBtn.dispatchEvent(new Event('click', { bubbles: true }));

  const action = setup.getLastAction();
  assert.exists(action, 'Action should have been called');
  assert.equal(action.action, 'rewind');
});

runner.test('clicking advance button triggers advance action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  const advanceBtn = setup.shadow.querySelector('button[data-action="advance"]');
  advanceBtn.dispatchEvent(new Event('click', { bubbles: true }));

  const action = setup.getLastAction();
  assert.exists(action, 'Action should have been called');
  assert.equal(action.action, 'advance');
});

runner.test('clicking display button triggers display action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  const displayBtn = setup.shadow.querySelector('button[data-action="display"]');
  displayBtn.dispatchEvent(new Event('click', { bubbles: true }));

  const action = setup.getLastAction();
  assert.exists(action, 'Action should have been called');
  assert.equal(action.action, 'display');
});

runner.test('mousedown on draggable triggers drag event', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  const draggable = setup.shadow.querySelector('.draggable');
  assert.exists(draggable, 'Draggable element should exist');

  // mousedown on draggable should trigger the drag action via runAction
  const mousedownEvent = new Event('mousedown', { bubbles: true, cancelable: true });
  Object.defineProperty(mousedownEvent, 'target', { value: draggable });
  draggable.dispatchEvent(mousedownEvent);

  const action = setup.getLastAction();
  assert.exists(action, 'Action should have been called on mousedown');
  assert.equal(action.action, 'drag');
});

runner.test('wheel event with large deltaY triggers speed adjustment', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  const controller = setup.shadow.querySelector('#controller');
  assert.exists(controller, 'Controller element should exist');

  // Dispatch wheel event with large deltaY (mouse wheel)
  const wheelEvent = new Event('wheel', { bubbles: true, cancelable: true });
  wheelEvent.deltaY = 100;
  wheelEvent.deltaMode = 0; // DOM_DELTA_PIXEL
  Object.defineProperty(wheelEvent, 'DOM_DELTA_PIXEL', { value: 0 });
  wheelEvent.preventDefault = () => {};
  controller.dispatchEvent(wheelEvent);

  assert.true(setup.getAdjustSpeedCalled(), 'adjustSpeed should have been called');
});

runner.test('wheel event with small deltaY (touchpad) is ignored', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const setup = createControlsSetup();
  setup.controlsManager.setupControls(setup.shadow, setup.video);

  const controller = setup.shadow.querySelector('#controller');

  // Dispatch wheel event with small deltaY (touchpad-like)
  const wheelEvent = new Event('wheel', { bubbles: true, cancelable: true });
  wheelEvent.deltaY = 10;
  wheelEvent.deltaMode = 0; // DOM_DELTA_PIXEL
  Object.defineProperty(wheelEvent, 'DOM_DELTA_PIXEL', { value: 0 });
  wheelEvent.preventDefault = () => {};
  controller.dispatchEvent(wheelEvent);

  assert.false(setup.getAdjustSpeedCalled(), 'adjustSpeed should NOT be called for small deltaY');
});

export { runner as controlsTestRunner };
