/**
 * Edge-case unit tests for VideoSpeedConfig (settings)
 * Tests debounce behavior, NaN handling, key binding operations, and defaults
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
  getMockStorage as _getMockStorage,
} from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockDOM, wait } from '../../helpers/test-utils.js';
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
  // Clear injected settings for clean tests
  if (window.VSC && window.VSC.StorageManager) {
    window.VSC.StorageManager._injectedSettings = null;
  }
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}
});

runner.test('save debounces lastSpeed-only saves', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Clear any lingering timers from load
  if (config.saveTimer) {
    clearTimeout(config.saveTimer);
    config.saveTimer = null;
  }
  config.pendingSave = null;

  let saveCount = 0;
  let lastSavedSpeed = null;
  const originalSet = window.VSC.StorageManager.set.bind(window.VSC.StorageManager);

  window.VSC.StorageManager.set = async (settings) => {
    saveCount++;
    if (settings.lastSpeed !== undefined) {lastSavedSpeed = settings.lastSpeed;}
  };

  config.save({ lastSpeed: 1.5 });
  config.save({ lastSpeed: 2.0 });

  // Should not have saved yet (debounced)
  assert.equal(saveCount, 0, 'Should not have saved during debounce window');

  await wait(1500);

  assert.equal(saveCount, 1, 'Should have saved exactly once after debounce');
  assert.equal(lastSavedSpeed, 2.0, 'Should have saved the final speed value');

  window.VSC.StorageManager.set = originalSet;
});

runner.test('save saves non-speed settings immediately', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  let saveCount = 0;
  const originalSet = window.VSC.StorageManager.set;

  window.VSC.StorageManager.set = async () => {
    saveCount++;
  };

  await config.save({ rememberSpeed: true });

  await wait(50);

  assert.equal(saveCount, 1, 'Non-speed settings should save immediately');
  assert.true(config.settings.rememberSpeed, 'In-memory setting should be updated');

  window.VSC.StorageManager.set = originalSet;
});

runner.test('load handles NaN storage values with defaults', async () => {
  const config = window.VSC.videoSpeedConfig;

  // Intercept StorageManager.get to return NaN values
  const originalGet = window.VSC.StorageManager.get;
  window.VSC.StorageManager.get = async (defaults) => {
    return {
      ...defaults,
      lastSpeed: NaN,
      controllerOpacity: NaN,
      controllerButtonSize: NaN,
      keyBindings: defaults.keyBindings,
    };
  };

  await config.load();

  const defaults = window.VSC.Constants.DEFAULT_SETTINGS;
  assert.equal(
    config.settings.lastSpeed,
    defaults.lastSpeed,
    'NaN lastSpeed should fall back to default'
  );
  assert.equal(
    config.settings.controllerOpacity,
    defaults.controllerOpacity,
    'NaN controllerOpacity should fall back to default'
  );
  assert.equal(
    config.settings.controllerButtonSize,
    defaults.controllerButtonSize,
    'NaN controllerButtonSize should fall back to default'
  );

  window.VSC.StorageManager.get = originalGet;
});

runner.test('ensureDisplayBinding adds display binding if missing', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Remove display binding
  config.settings.keyBindings = config.settings.keyBindings.filter(
    (b) => b.action !== 'display'
  );

  const countBefore = config.settings.keyBindings.filter(
    (b) => b.action === 'display'
  ).length;
  assert.equal(countBefore, 0, 'Display binding should be removed');

  config.ensureDisplayBinding({ displayKeyCode: 86 });

  const countAfter = config.settings.keyBindings.filter(
    (b) => b.action === 'display'
  ).length;
  assert.equal(countAfter, 1, 'Display binding should be added back');

  const displayBinding = config.settings.keyBindings.find(
    (b) => b.action === 'display'
  );
  assert.equal(displayBinding.key, 86, 'Display binding should use displayKeyCode');
  assert.equal(displayBinding.predefined, true, 'Display binding should be predefined');
});

runner.test('getKeyBinding returns correct value for action', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  const defaults = window.VSC.Constants.DEFAULT_SETTINGS.keyBindings;
  const expectedFaster = defaults.find(b => b.action === 'faster').value;
  const expectedReset = defaults.find(b => b.action === 'reset').value;
  const expectedFast = defaults.find(b => b.action === 'fast').value;

  const fasterValue = config.getKeyBinding('faster');
  assert.equal(fasterValue, expectedFaster, `faster binding value should be ${expectedFaster}`);

  const resetValue = config.getKeyBinding('reset');
  assert.equal(resetValue, expectedReset, `reset binding value should be ${expectedReset}`);

  const fastValue = config.getKeyBinding('fast');
  assert.equal(fastValue, expectedFast, `fast binding value should be ${expectedFast}`);
});

runner.test('setKeyBinding updates binding value', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  config.setKeyBinding('faster', 0.25);
  const updatedValue = config.getKeyBinding('faster');
  assert.equal(updatedValue, 0.25, 'faster binding should be updated to 0.25');
});

runner.test('load initializes settings from storage', async () => {
  const config = window.VSC.videoSpeedConfig;
  const settings = await config.load();

  assert.exists(settings, 'load should return settings object');
  assert.exists(config.settings.keyBindings, 'keyBindings should be populated');
  assert.greaterThan(
    config.settings.keyBindings.length,
    0,
    'keyBindings should have entries'
  );
  assert.equal(typeof config.settings.enabled, 'boolean', 'enabled should be a boolean');
  assert.equal(typeof config.settings.lastSpeed, 'number', 'lastSpeed should be a number');
});

runner.test('settings have correct default values', async () => {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  assert.equal(config.settings.enabled, true, 'enabled should default to true');
  assert.equal(config.settings.lastSpeed, 1.0, 'lastSpeed should default to 1.0');
  assert.equal(config.settings.rememberSpeed, false, 'rememberSpeed should default to false');
  assert.equal(config.settings.forceLastSavedSpeed, false, 'forceLastSavedSpeed should default to false');
  assert.equal(config.settings.startHidden, false, 'startHidden should default to false');
  assert.equal(config.settings.controllerOpacity, 0.3, 'controllerOpacity should default to 0.3');
  assert.equal(config.settings.controllerButtonSize, 14, 'controllerButtonSize should default to 14');
});

export { runner as settingsEdgeTestRunner };
