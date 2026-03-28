/**
 * Edge-case unit tests for EventManager
 * Tests modifier key filtering, typing context detection, cooldown, and show/hide behavior
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import {
  SimpleTestRunner,
  assert,
  createMockVideo,
  createMockDOM,
  createMockKeyboardEvent,
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

/**
 * Helper: create EventManager with a spy-able action handler
 */
async function createTestEventManager() {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionCalls = [];
  const mockActionHandler = {
    runAction: (action, value, event) => {
      actionCalls.push({ action, value, event });
    },
    adjustSpeed: () => {},
  };

  const eventManager = new window.VSC.EventManager(config, mockActionHandler);
  return { config, eventManager, actionCalls };
}

/**
 * Helper: register a controller so hasControllers() returns true
 */
function registerDummyController() {
  const video = createMockVideo();
  document.body.appendChild(video);
  const controller = {
    controllerId: 99,
    video: video,
    div: document.createElement('div'),
    remove: () => {},
  };
  window.VSC.stateManager.registerController(controller);
  return video;
}

runner.test('handleKeydown ignores events with altKey modifier', async () => {
  const { eventManager, actionCalls } = await createTestEventManager();
  registerDummyController();

  // 83 = 'S' (slower key binding)
  const event = createMockKeyboardEvent('keydown', 83, { altKey: true });
  Object.defineProperty(event, 'target', { value: document.body });

  eventManager.handleKeydown(event);

  assert.equal(actionCalls.length, 0, 'Should not dispatch action when altKey is active');

  eventManager.cleanup();
});

runner.test('handleKeydown ignores events with ctrlKey modifier', async () => {
  const { eventManager, actionCalls } = await createTestEventManager();
  registerDummyController();

  const event = createMockKeyboardEvent('keydown', 83, { ctrlKey: true });
  Object.defineProperty(event, 'target', { value: document.body });

  eventManager.handleKeydown(event);

  assert.equal(actionCalls.length, 0, 'Should not dispatch action when ctrlKey is active');

  eventManager.cleanup();
});

runner.test('handleKeydown ignores events with metaKey modifier', async () => {
  const { eventManager, actionCalls } = await createTestEventManager();
  registerDummyController();

  const event = createMockKeyboardEvent('keydown', 83, { metaKey: true });
  Object.defineProperty(event, 'target', { value: document.body });

  eventManager.handleKeydown(event);

  assert.equal(actionCalls.length, 0, 'Should not dispatch action when metaKey is active');

  eventManager.cleanup();
});

runner.test('handleKeydown ignores events in INPUT elements', async () => {
  const { eventManager, actionCalls } = await createTestEventManager();
  registerDummyController();

  const input = document.createElement('input');
  const event = createMockKeyboardEvent('keydown', 83);
  Object.defineProperty(event, 'target', { value: input });

  eventManager.handleKeydown(event);

  assert.equal(actionCalls.length, 0, 'Should not dispatch action when target is INPUT');

  eventManager.cleanup();
});

runner.test('handleKeydown ignores events in TEXTAREA elements', async () => {
  const { eventManager, actionCalls } = await createTestEventManager();
  registerDummyController();

  const textarea = document.createElement('textarea');
  const event = createMockKeyboardEvent('keydown', 83);
  Object.defineProperty(event, 'target', { value: textarea });

  eventManager.handleKeydown(event);

  assert.equal(actionCalls.length, 0, 'Should not dispatch action when target is TEXTAREA');

  eventManager.cleanup();
});

runner.test('handleKeydown ignores events in contentEditable elements', async () => {
  const { eventManager, actionCalls } = await createTestEventManager();
  registerDummyController();

  const div = document.createElement('div');
  div.contentEditable = 'true';
  // JSDOM does not implement isContentEditable, so define it manually
  Object.defineProperty(div, 'isContentEditable', { value: true });
  const event = createMockKeyboardEvent('keydown', 83);
  Object.defineProperty(event, 'target', { value: div });

  eventManager.handleKeydown(event);

  assert.equal(
    actionCalls.length,
    0,
    'Should not dispatch action when target is contentEditable'
  );

  eventManager.cleanup();
});

runner.test('refreshCoolDown sets cooldown active', async () => {
  const { eventManager } = await createTestEventManager();

  assert.false(eventManager._coolDownActive, 'Cooldown should start inactive');

  eventManager.refreshCoolDown();

  assert.true(eventManager._coolDownActive, 'Cooldown should be active after refreshCoolDown');

  eventManager.cleanup();
});

runner.test('cleanup clears all listeners and timers', async () => {
  const { eventManager } = await createTestEventManager();

  // Set up some state
  eventManager.setupEventListeners(document);
  eventManager.refreshCoolDown();

  assert.greaterThan(eventManager._listeners.size, 0, 'Should have listeners before cleanup');
  assert.true(eventManager._coolDownActive, 'Cooldown should be active before cleanup');

  eventManager.cleanup();

  assert.equal(eventManager._listeners.size, 0, 'Listeners map should be empty after cleanup');
  assert.false(eventManager._coolDownActive, 'Cooldown should be inactive after cleanup');
  assert.equal(eventManager._coolDownTimer, null, 'Cooldown timer should be null after cleanup');
  assert.true(eventManager._showTimers instanceof WeakMap, 'Show timers WeakMap should exist after cleanup');
});

runner.test('showController adds vsc-show class', async () => {
  const { config, eventManager } = await createTestEventManager();
  config.settings.startHidden = false;

  const controllerDiv = document.createElement('div');

  eventManager.showController(controllerDiv);

  assert.true(
    controllerDiv.classList.contains('vsc-show'),
    'Controller should have vsc-show class'
  );

  eventManager.cleanup();
});

runner.test('showController respects startHidden setting', async () => {
  const { config, eventManager } = await createTestEventManager();
  config.settings.startHidden = true;

  const controllerDiv = document.createElement('div');
  // No vsc-manual class -- user has not manually interacted

  eventManager.showController(controllerDiv);

  assert.false(
    controllerDiv.classList.contains('vsc-show'),
    'Controller should NOT get vsc-show when startHidden=true and no vsc-manual class'
  );

  eventManager.cleanup();
});

export { runner as eventManagerEdgeTestRunner };
