/**
 * Unit tests for StorageManager
 * Tests storage access in both content script (chrome API) and page (DOM bridge) contexts
 */

import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
  setLastError,
  clearLastError,
  getMockStorage,
} from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockDOM, wait } from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  clearLastError();
  mockDOM = createMockDOM();

  // Clear any cached settings between tests
  delete window.VSC_settings;

  // Reset error callback
  window.VSC.StorageManager.errorCallback = null;
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}

  // Clean up any leftover settings elements
  const el = document.getElementById('vsc-settings-data');
  if (el) {el.remove();}

  delete window.VSC_settings;
});

// --- get() tests ---

runner.test('StorageManager.get reads from chrome.storage.sync when chrome API available', async () => {
  const defaults = { enabled: false, lastSpeed: 0 };
  const result = await window.VSC.StorageManager.get(defaults);

  assert.exists(result, 'get() should return a result');
  assert.equal(result.enabled, true, 'Should contain mock storage enabled value');
  assert.equal(result.lastSpeed, 1.0, 'Should contain mock storage lastSpeed value');
});

runner.test('StorageManager.get merges defaults with stored values', async () => {
  const defaults = {
    enabled: false,
    lastSpeed: 2.0,
    customSetting: 'myDefault',
  };

  const result = await window.VSC.StorageManager.get(defaults);

  // Stored values should override defaults
  assert.equal(result.enabled, true, 'Stored value should override default');
  assert.equal(result.lastSpeed, 1.0, 'Stored value should override default');
  // Default for missing keys should be preserved
  assert.equal(result.customSetting, 'myDefault', 'Missing keys should use default');
});

runner.test('StorageManager.get reads from DOM script element when chrome API unavailable', async () => {
  // Remove chrome API entirely
  cleanupChromeMock();
  globalThis.chrome = undefined;

  // Create DOM settings element
  const settingsEl = document.createElement('script');
  settingsEl.id = 'vsc-settings-data';
  settingsEl.type = 'application/json';
  settingsEl.textContent = JSON.stringify({ enabled: true, lastSpeed: 1.5 });
  document.body.appendChild(settingsEl);

  const result = await window.VSC.StorageManager.get({});

  assert.equal(result.lastSpeed, 1.5, 'Should read lastSpeed from DOM element');
  assert.equal(result.enabled, true, 'Should read enabled from DOM element');
});

runner.test('StorageManager.get removes settings element after reading', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  const settingsEl = document.createElement('script');
  settingsEl.id = 'vsc-settings-data';
  settingsEl.type = 'application/json';
  settingsEl.textContent = JSON.stringify({ enabled: true });
  document.body.appendChild(settingsEl);

  await window.VSC.StorageManager.get({});

  const remaining = document.getElementById('vsc-settings-data');
  assert.equal(remaining, null, 'Settings element should be removed after reading');
});

runner.test('StorageManager.get caches DOM settings in window.VSC_settings', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  const settingsEl = document.createElement('script');
  settingsEl.id = 'vsc-settings-data';
  settingsEl.type = 'application/json';
  settingsEl.textContent = JSON.stringify({ enabled: true, lastSpeed: 2.0 });
  document.body.appendChild(settingsEl);

  // First call reads from DOM and caches
  await window.VSC.StorageManager.get({});
  assert.exists(window.VSC_settings, 'VSC_settings should be cached after first read');
  assert.equal(window.VSC_settings.lastSpeed, 2.0, 'Cached value should match');

  // Second call should use cache (element already removed)
  const result = await window.VSC.StorageManager.get({});
  assert.equal(result.lastSpeed, 2.0, 'Second call should use cached settings');
});

runner.test('StorageManager.get returns defaults when no settings source available', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  const defaults = { enabled: false, lastSpeed: 1.0, customVal: 42 };
  const result = await window.VSC.StorageManager.get(defaults);

  assert.equal(result.enabled, false, 'Should return default enabled');
  assert.equal(result.lastSpeed, 1.0, 'Should return default lastSpeed');
  assert.equal(result.customVal, 42, 'Should return default customVal');
});

runner.test('StorageManager.get handles malformed JSON gracefully', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  const settingsEl = document.createElement('script');
  settingsEl.id = 'vsc-settings-data';
  settingsEl.type = 'application/json';
  settingsEl.textContent = '{invalid json!!!}';
  document.body.appendChild(settingsEl);

  const defaults = { enabled: true, lastSpeed: 1.0 };
  const result = await window.VSC.StorageManager.get(defaults);

  // Should fall back to defaults on parse failure
  assert.equal(result.enabled, true, 'Should return default on malformed JSON');
  assert.equal(result.lastSpeed, 1.0, 'Should return default on malformed JSON');
});

// --- set() tests ---

runner.test('StorageManager.set saves to chrome.storage.sync', async () => {
  await window.VSC.StorageManager.set({ lastSpeed: 2.5 });

  // Wait for the async mock callback
  await wait(20);

  const storage = getMockStorage();
  assert.equal(storage.lastSpeed, 2.5, 'Storage should contain updated lastSpeed');
});

runner.test('StorageManager.set rejects on chrome.runtime.lastError', async () => {
  setLastError('QUOTA_BYTES_PER_ITEM quota exceeded');

  let rejected = false;
  try {
    await window.VSC.StorageManager.set({ lastSpeed: 2.0 });
  } catch (e) {
    rejected = true;
    assert.true(
      e.message.includes('QUOTA_BYTES_PER_ITEM'),
      'Error message should contain the lastError message'
    );
  }

  assert.true(rejected, 'set() should reject when lastError is set');
  clearLastError();
});

runner.test('StorageManager.set calls error callback on failure', async () => {
  let callbackError = null;
  let callbackData = null;

  window.VSC.StorageManager.onError((error, data) => {
    callbackError = error;
    callbackData = data;
  });

  setLastError('Storage write failed');

  try {
    await window.VSC.StorageManager.set({ lastSpeed: 3.0 });
  } catch (_e) {
    // Expected rejection
  }

  assert.exists(callbackError, 'Error callback should have been called');
  assert.true(
    callbackError.message.includes('Storage write failed'),
    'Callback error message should match'
  );
  assert.exists(callbackData, 'Callback should receive the data');
  assert.equal(callbackData.lastSpeed, 3.0, 'Callback data should match set data');

  clearLastError();
});

runner.test('StorageManager.set posts message when chrome API unavailable', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  let postedMessage = null;
  const originalPostMessage = window.postMessage;
  window.postMessage = (msg, _origin) => {
    postedMessage = msg;
  };

  await window.VSC.StorageManager.set({ lastSpeed: 1.8 });

  assert.exists(postedMessage, 'postMessage should have been called');
  assert.equal(postedMessage.source, 'vsc-page', 'Message source should be vsc-page');
  assert.equal(postedMessage.action, 'storage-update', 'Message action should be storage-update');
  assert.equal(postedMessage.data.lastSpeed, 1.8, 'Message data should contain set values');

  window.postMessage = originalPostMessage;
});

runner.test('StorageManager.set updates VSC_settings cache in page context', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  // Initialize cache with existing data
  window.VSC_settings = { enabled: true, lastSpeed: 1.0 };

  const originalPostMessage = window.postMessage;
  window.postMessage = () => {};

  await window.VSC.StorageManager.set({ lastSpeed: 2.5, rememberSpeed: true });

  assert.equal(window.VSC_settings.lastSpeed, 2.5, 'Cache should have updated lastSpeed');
  assert.equal(
    window.VSC_settings.rememberSpeed,
    true,
    'Cache should have new rememberSpeed value'
  );
  assert.equal(window.VSC_settings.enabled, true, 'Cache should preserve existing values');

  window.postMessage = originalPostMessage;
});

// --- remove() and clear() tests ---

runner.test('StorageManager.remove deletes keys from local cache', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  window.VSC_settings = { enabled: true, lastSpeed: 1.5, rememberSpeed: true };

  await window.VSC.StorageManager.remove(['lastSpeed', 'rememberSpeed']);

  assert.equal(window.VSC_settings.enabled, true, 'Non-removed key should remain');
  assert.equal(window.VSC_settings.lastSpeed, undefined, 'Removed key should be deleted');
  assert.equal(window.VSC_settings.rememberSpeed, undefined, 'Removed key should be deleted');
});

runner.test('StorageManager.clear empties local cache', async () => {
  cleanupChromeMock();
  globalThis.chrome = undefined;

  window.VSC_settings = { enabled: true, lastSpeed: 1.5, rememberSpeed: true };

  await window.VSC.StorageManager.clear();

  assert.deepEqual(window.VSC_settings, {}, 'Cache should be empty after clear');
});

export { runner as storageManagerTestRunner };
