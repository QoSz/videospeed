/**
 * Settings management for Video Speed Controller
 */

import type { VSCSettings, KeyBinding } from '../types/settings.js';

const VALID_ACTIONS: ReadonlySet<string> = new Set([
  'slower',
  'faster',
  'rewind',
  'advance',
  'reset',
  'fast',
  'display',
  'mark',
  'jump',
  'pause',
  'muted',
  'louder',
  'softer',
]);

const NUMERIC_ACTIONS: ReadonlySet<string> = new Set(['reset', 'fast', 'slower', 'faster']);

/**
 * Return `val` as a number if it is finite and within [min, max],
 * otherwise return `fallback`.
 */
function numOrDefault(
  val: unknown,
  fallback: number,
  min?: number,
  max?: number
): number {
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  if (min !== undefined && num < min) {
    return fallback;
  }
  if (max !== undefined && num > max) {
    return fallback;
  }
  return num;
}

export class VideoSpeedConfig {
  settings: VSCSettings;
  private pendingSave: number | null;
  private saveTimer: ReturnType<typeof setTimeout> | null;
  private readonly SAVE_DELAY: number = 1000; // 1 second
  private _keyBindingsByKey: Map<number, KeyBinding> | null;
  private _keyBindingsByAction: Map<string, KeyBinding> | null;

  constructor() {
    this.settings = { ...window.VSC.Constants.DEFAULT_SETTINGS };
    this.pendingSave = null;
    this.saveTimer = null;
    this._keyBindingsByKey = null;
    this._keyBindingsByAction = null;
  }

  /**
   * Build lookup maps from keyBindings array. Called lazily on first access.
   */
  private _buildKeyBindingMaps(): void {
    this._keyBindingsByKey = new Map();
    this._keyBindingsByAction = new Map();
    for (const binding of this.settings.keyBindings) {
      this._keyBindingsByKey.set(binding.key, binding);
      this._keyBindingsByAction.set(binding.action, binding);
    }
  }

  /**
   * Get key binding by keyCode (O(1) lookup)
   */
  getKeyBindingByKey(keyCode: number): KeyBinding | undefined {
    if (!this._keyBindingsByKey) {
      this._buildKeyBindingMaps();
    }
    return this._keyBindingsByKey!.get(keyCode);
  }

  /**
   * Load settings from Chrome storage or pre-injected settings
   */
  async load(): Promise<VSCSettings> {
    try {
      const storage = await window.VSC.StorageManager.get(
        window.VSC.Constants.DEFAULT_SETTINGS
      );

      // Handle key bindings migration/initialization
      this.settings.keyBindings =
        this._validateKeyBindings(storage.keyBindings) ||
        [...window.VSC.Constants.DEFAULT_SETTINGS.keyBindings];

      if (!storage.keyBindings || storage.keyBindings.length === 0) {
        window.VSC.logger.info(
          'First initialization - setting up default key bindings'
        );
        this.settings.keyBindings = [
          ...window.VSC.Constants.DEFAULT_SETTINGS.keyBindings,
        ];
        await this.save({ keyBindings: this.settings.keyBindings });
      }

      // Apply loaded settings with bounds-checked fallback to defaults
      const defaults = window.VSC.Constants.DEFAULT_SETTINGS;
      this.settings.lastSpeed = numOrDefault(
        storage.lastSpeed,
        defaults.lastSpeed,
        0.07,
        16
      );
      this.settings.displayKeyCode = numOrDefault(
        storage.displayKeyCode,
        defaults.displayKeyCode,
        0,
        255
      );
      this.settings.rememberSpeed = Boolean(storage.rememberSpeed);
      this.settings.forceLastSavedSpeed = Boolean(storage.forceLastSavedSpeed);
      this.settings.audioBoolean = Boolean(storage.audioBoolean);
      this.settings.enabled = Boolean(storage.enabled);
      this.settings.startHidden = Boolean(storage.startHidden);
      this.settings.controllerOpacity = numOrDefault(
        storage.controllerOpacity,
        defaults.controllerOpacity,
        0,
        1
      );
      this.settings.controllerButtonSize = numOrDefault(
        storage.controllerButtonSize,
        defaults.controllerButtonSize,
        6,
        50
      );
      this.settings.blacklist = String(storage.blacklist || '');
      this.settings.logLevel = numOrDefault(
        storage.logLevel,
        defaults.logLevel,
        1,
        6
      );

      // Ensure display binding exists (for upgrades)
      this.ensureDisplayBinding(storage);

      // Update logger verbosity
      window.VSC.logger.setVerbosity(this.settings.logLevel);

      window.VSC.logger.info('Settings loaded successfully');
      return this.settings;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      window.VSC.logger.error(`Failed to load settings: ${message}`);
      return window.VSC.Constants.DEFAULT_SETTINGS;
    }
  }

  /**
   * Save settings to Chrome storage
   */
  async save(newSettings: Partial<VSCSettings> = {}): Promise<void> {
    try {
      // Update in-memory settings immediately
      this.settings = { ...this.settings, ...newSettings };

      // Invalidate lookup maps if keyBindings changed
      if (newSettings.keyBindings) {
        this._keyBindingsByKey = null;
        this._keyBindingsByAction = null;
      }

      // Check if this is a speed-only update that should be debounced
      const keys = Object.keys(newSettings);
      if (keys.length === 1 && keys[0] === 'lastSpeed') {
        // Debounce speed saves
        this.pendingSave = newSettings.lastSpeed ?? null;

        if (this.saveTimer) {
          clearTimeout(this.saveTimer);
        }

        this.saveTimer = setTimeout(async () => {
          const speedToSave = this.pendingSave;
          this.pendingSave = null;
          this.saveTimer = null;

          try {
            await window.VSC.StorageManager.set({
              ...this.settings,
              lastSpeed: speedToSave ?? this.settings.lastSpeed,
            });
            window.VSC.logger.info('Debounced speed setting saved successfully');
          } catch (innerErr: unknown) {
            const msg =
              innerErr instanceof Error ? innerErr.message : String(innerErr);
            window.VSC.logger.error(
              `Failed to save debounced speed setting: ${msg}`
            );
          }
        }, this.SAVE_DELAY);

        return;
      }

      // Immediate save for all other settings
      await window.VSC.StorageManager.set(this.settings);

      // Update logger verbosity if logLevel was changed
      if (newSettings.logLevel !== undefined) {
        window.VSC.logger.setVerbosity(this.settings.logLevel);
      }

      window.VSC.logger.info('Settings saved successfully');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      window.VSC.logger.error(`Failed to save settings: ${message}`);
    }
  }

  /**
   * Get a specific key binding property
   */
  getKeyBinding(action: string, property: keyof KeyBinding = 'value'): KeyBinding[keyof KeyBinding] | false {
    if (!this._keyBindingsByAction) {
      this._buildKeyBindingMaps();
    }
    const binding = this._keyBindingsByAction!.get(action);
    return binding ? binding[property] : false;
  }

  /**
   * Set a key binding value with validation
   */
  setKeyBinding(action: string, value: number): void {
    try {
      const binding = this.settings.keyBindings.find(
        (item: KeyBinding) => item.action === action
      );
      if (!binding) {
        window.VSC.logger.warn(`No key binding found for action: ${action}`);
        return;
      }

      // Validate speed-related values to prevent corruption
      if (NUMERIC_ACTIONS.has(action)) {
        if (typeof value !== 'number' || isNaN(value)) {
          window.VSC.logger.warn(
            `Invalid numeric value for ${action}: ${value}`
          );
          return;
        }
      }

      binding.value = value;
      // Invalidate maps since a binding changed
      this._keyBindingsByKey = null;
      this._keyBindingsByAction = null;
      window.VSC.logger.debug(`Updated key binding ${action} to ${value}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      window.VSC.logger.error(
        `Failed to set key binding for ${action}: ${message}`
      );
    }
  }

  /**
   * Validate keyBindings array from storage.
   * Returns validated array or null for fallback to defaults.
   */
  _validateKeyBindings(bindings: unknown): KeyBinding[] | null {
    if (!Array.isArray(bindings) || bindings.length === 0 || bindings.length > 50) {
      return null;
    }

    // Filter in-place: remove invalid entries, normalize valid ones
    let writeIdx = 0;
    for (let i = 0; i < bindings.length; i++) {
      const b: unknown = bindings[i];
      if (!b || typeof b !== 'object') {
        continue;
      }
      const entry = b as Record<string, unknown>;
      if (typeof entry.action !== 'string' || !VALID_ACTIONS.has(entry.action)) {
        continue;
      }
      if (
        typeof entry.key !== 'number' ||
        !Number.isFinite(entry.key) ||
        entry.key < 0 ||
        entry.key > 255
      ) {
        continue;
      }
      if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
        continue;
      }
      // Normalize boolean fields
      entry.force = entry.force === true;
      entry.predefined = entry.predefined === true;
      bindings[writeIdx++] = entry;
    }
    bindings.length = writeIdx;
    return writeIdx > 0 ? (bindings as KeyBinding[]) : null;
  }

  /**
   * Ensure display binding exists in key bindings
   */
  ensureDisplayBinding(storage: VSCSettings): void {
    if (
      this.settings.keyBindings.filter((x: KeyBinding) => x.action === 'display')
        .length === 0
    ) {
      this.settings.keyBindings.push({
        action: 'display',
        key: Number(storage.displayKeyCode) || 86,
        value: 0,
        force: false,
        predefined: true,
      });
    }
  }
}

// Create singleton instance
window.VSC.videoSpeedConfig = new VideoSpeedConfig();

// Export constructor for testing
window.VSC.VideoSpeedConfig = VideoSpeedConfig;
