/**
 * Unit tests for EventManager class
 * Tests cooldown behavior to prevent rapid changes
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockVideo } from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

// Load all required modules
await loadCoreModules();

const runner = new SimpleTestRunner();

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
});

runner.afterEach(() => {
  cleanupChromeMock();
});

runner.test('EventManager should initialize with cooldown disabled', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionHandler = new window.VSC.ActionHandler(config, null);
  const eventManager = new window.VSC.EventManager(config, actionHandler);

  assert.equal(eventManager._coolDownActive, false);
  assert.equal(eventManager._coolDownTimer, null);
});

runner.test('refreshCoolDown should activate cooldown period', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionHandler = new window.VSC.ActionHandler(config, null);
  const eventManager = new window.VSC.EventManager(config, actionHandler);

  // Cooldown should start as disabled
  assert.equal(eventManager._coolDownActive, false);
  assert.equal(eventManager._coolDownTimer, null);

  // Activate cooldown
  eventManager.refreshCoolDown();

  // Cooldown should now be active
  assert.equal(eventManager._coolDownActive, true);
  assert.true(eventManager._coolDownTimer !== null);
});

runner.test('handleRateChange should block events during cooldown', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionHandler = new window.VSC.ActionHandler(config, null);
  const eventManager = new window.VSC.EventManager(config, actionHandler);

  const mockVideo = createMockVideo({ playbackRate: 1.0 });
  mockVideo.vsc = { speedIndicator: { textContent: '1.00' } };

  // Create mock event that looks like our synthetic ratechange event
  let eventStopped = false;
  const mockEvent = {
    composedPath: () => [mockVideo],
    target: mockVideo,
    detail: { origin: 'external' }, // Not our own event
    stopImmediatePropagation: () => {
      eventStopped = true;
    }
  };

  // Activate cooldown first
  eventManager.refreshCoolDown();

  // Event should be blocked by cooldown
  eventManager.handleRateChange(mockEvent);
  assert.true(eventStopped);
});

runner.test('cooldown should expire after timeout', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionHandler = new window.VSC.ActionHandler(config, null);
  const eventManager = new window.VSC.EventManager(config, actionHandler);

  // Activate cooldown
  eventManager.refreshCoolDown();
  assert.equal(eventManager._coolDownActive, true);
  assert.true(eventManager._coolDownTimer !== null);

  // Wait for cooldown to expire (COOLDOWN_MS + buffer)
  const waitMs = (window.VSC.EventManager?.COOLDOWN_MS || 50) + 50;
  await new Promise(resolve => setTimeout(resolve, waitMs));

  // Cooldown should be expired
  assert.equal(eventManager._coolDownActive, false);
  assert.equal(eventManager._coolDownTimer, null);
});

runner.test('multiple refreshCoolDown calls should reset timer', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionHandler = new window.VSC.ActionHandler(config, null);
  const eventManager = new window.VSC.EventManager(config, actionHandler);

  // First cooldown activation
  eventManager.refreshCoolDown();
  const firstTimer = eventManager._coolDownTimer;
  assert.true(firstTimer !== null);
  assert.equal(eventManager._coolDownActive, true);

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 100));

  // Second cooldown activation should replace the first
  eventManager.refreshCoolDown();
  const secondTimer = eventManager._coolDownTimer;

  // Should be a different timer object and cooldown still active
  assert.true(secondTimer !== firstTimer);
  assert.true(secondTimer !== null);
  assert.equal(eventManager._coolDownActive, true);
});

runner.test('cleanup should clear cooldown', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const actionHandler = new window.VSC.ActionHandler(config, null);
  const eventManager = new window.VSC.EventManager(config, actionHandler);

  // Activate cooldown
  eventManager.refreshCoolDown();
  assert.equal(eventManager._coolDownActive, true);
  assert.true(eventManager._coolDownTimer !== null);

  // Cleanup should clear the cooldown
  eventManager.cleanup();
  assert.equal(eventManager._coolDownActive, false);
  assert.equal(eventManager._coolDownTimer, null);
});

export { runner as eventManagerTestRunner };