/**
 * Chrome storage management utilities
 * Handles storage access in both content script and page contexts
 */

import type { VSCSettings } from '../types/settings.js';

type ErrorCallback = (error: Error, context: unknown) => void;
type StorageChanges = Record<string, chrome.storage.StorageChange>;

interface StorageUpdateMessage {
  source: 'vsc-page';
  action: 'storage-update';
  nonce: string | undefined;
  data: Partial<VSCSettings>;
}

interface StorageChangedMessage {
  source: 'vsc-content';
  action: 'storage-changed';
  data: Record<string, unknown>;
}

/**
 * Check if Chrome storage sync API is available (content script context)
 */
function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    chrome.storage !== undefined &&
    chrome.storage.sync !== undefined
  );
}

// Closure-scoped nonce — not on window.VSC where page scripts could read it
let _authNonce: string | undefined;

export class StorageManager {
  static errorCallback: ErrorCallback | null = null;

  /**
   * Register error callback for monitoring storage failures
   */
  static onError(callback: ErrorCallback): void {
    this.errorCallback = callback;
  }

  /**
   * Get settings from Chrome storage or pre-injected settings
   */
  static async get(defaults: Partial<VSCSettings> = {}): Promise<VSCSettings> {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(defaults, (storage) => {
          window.VSC.logger.debug('Retrieved settings from chrome.storage');
          // Chrome storage returns defaults merged with stored values;
          // the result matches VSCSettings when called with DEFAULT_SETTINGS
          const result: VSCSettings = { ...(defaults as VSCSettings), ...storage };
          resolve(result);
        });
      });
    }

    // Page context - read settings from DOM bridge
    if (!window.VSC_settings) {
      const settingsElement = document.querySelector(
        'script[id^="vsc-settings-"][type="application/json"]'
      );
      if (settingsElement && settingsElement.textContent) {
        try {
          const parsed: Record<string, unknown> = JSON.parse(settingsElement.textContent);
          // Extract auth nonce into closure-scoped variable (not on window.VSC)
          if (typeof parsed._vscNonce === 'string') {
            _authNonce = parsed._vscNonce;
            delete parsed._vscNonce;
          }
          window.VSC_settings = parsed;
          window.VSC.logger.debug('Loaded settings from script element');
          // Clean up the element after reading
          settingsElement.remove();
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          window.VSC.logger.error(`Failed to parse settings from script element: ${message}`);
        }
      }
    }

    if (window.VSC_settings) {
      window.VSC.logger.debug('Using VSC_settings');
      return { ...defaults, ...window.VSC_settings } as VSCSettings;
    }

    // Fallback to defaults if no settings available
    window.VSC.logger.debug('No settings available, using defaults');
    return defaults as VSCSettings;
  }

  /**
   * Set settings in Chrome storage
   */
  static async set(data: Partial<VSCSettings>): Promise<void> {
    if (hasChromeStorage()) {
      return new Promise((resolve, reject) => {
        chrome.storage.sync.set(data, () => {
          if (chrome.runtime.lastError) {
            const error = new Error(`Storage failed: ${chrome.runtime.lastError.message}`);
            if (window.VSC?.logger) {
              window.VSC.logger.error(`Chrome storage save failed: ${chrome.runtime.lastError.message}`);
            } else {
              console.error('Chrome storage save failed:', chrome.runtime.lastError);
            }

            if (this.errorCallback) {
              this.errorCallback(error, data);
            }

            reject(error);
            return;
          }
          window.VSC.logger.debug('Settings saved to chrome.storage');
          resolve();
        });
      });
    }

    // Page context - send save request to content script via message bridge
    window.VSC.logger.debug('Sending storage update to content script');

    const message: StorageUpdateMessage = {
      source: 'vsc-page',
      action: 'storage-update',
      nonce: _authNonce,
      data: data,
    };
    window.postMessage(message, window.location.origin);

    // Update local settings cache
    window.VSC_settings = { ...window.VSC_settings, ...data };
  }

  /**
   * Remove keys from Chrome storage
   */
  static async remove(keys: readonly string[]): Promise<void> {
    if (hasChromeStorage()) {
      return new Promise((resolve, reject) => {
        chrome.storage.sync.remove([...keys], () => {
          if (chrome.runtime.lastError) {
            const error = new Error(
              `Storage remove failed: ${chrome.runtime.lastError.message}`
            );
            if (window.VSC?.logger) {
              window.VSC.logger.error(`Chrome storage remove failed: ${chrome.runtime.lastError.message}`);
            } else {
              console.error('Chrome storage remove failed:', chrome.runtime.lastError);
            }

            if (this.errorCallback) {
              this.errorCallback(error, { removedKeys: keys });
            }

            reject(error);
            return;
          }
          window.VSC.logger.debug('Keys removed from storage');
          resolve();
        });
      });
    }

    // Page context - update local cache
    if (window.VSC_settings) {
      for (const key of keys) {
        delete window.VSC_settings[key];
      }
    }
  }

  /**
   * Clear all Chrome storage
   */
  static async clear(): Promise<void> {
    if (hasChromeStorage()) {
      return new Promise((resolve, reject) => {
        chrome.storage.sync.clear(() => {
          if (chrome.runtime.lastError) {
            const error = new Error(
              `Storage clear failed: ${chrome.runtime.lastError.message}`
            );
            if (window.VSC?.logger) {
              window.VSC.logger.error(`Chrome storage clear failed: ${chrome.runtime.lastError.message}`);
            } else {
              console.error('Chrome storage clear failed:', chrome.runtime.lastError);
            }

            if (this.errorCallback) {
              this.errorCallback(error, { operation: 'clear' });
            }

            reject(error);
            return;
          }
          window.VSC.logger.debug('Storage cleared');
          resolve();
        });
      });
    }

    // Page context - clear local cache
    window.VSC_settings = {};
  }

  /**
   * Listen for storage changes
   */
  static onChanged(callback: (changes: StorageChanges) => void): void {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage !== undefined &&
      chrome.storage.onChanged !== undefined
    ) {
      chrome.storage.onChanged.addListener(
        (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
          if (areaName === 'sync') {
            callback(changes as StorageChanges);
          }
        }
      );
      return;
    }

    // Page context - listen for storage changes from content script
    window.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data as StorageChangedMessage | null;
      if (msg?.source === 'vsc-content' && msg?.action === 'storage-changed') {
        const changes: StorageChanges = {};
        for (const [key, value] of Object.entries(msg.data)) {
          changes[key] = {
            newValue: value,
            oldValue: window.VSC_settings?.[key],
          };
        }
        // Update local cache
        window.VSC_settings = { ...window.VSC_settings, ...msg.data };
        callback(changes);
      }
    });
  }
}

window.VSC.StorageManager = StorageManager;
