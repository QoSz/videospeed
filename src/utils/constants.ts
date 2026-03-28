/**
 * Constants and default values for Video Speed Controller
 */

export const regStrip: RegExp = /^[\r\t\f\v ]+|[\r\t\f\v ]+$/gm;
export const regEndsWithFlags: RegExp = /\/(?!.*(.).*\1)[gimsuy]*$/;

export interface KeyBinding {
  readonly action: string;
  readonly key: number;
  readonly value: number;
  readonly force: boolean;
  readonly predefined: boolean;
}

export interface VSCSettings {
  lastSpeed: number;
  enabled: boolean;
  displayKeyCode: number;
  rememberSpeed: boolean;
  forceLastSavedSpeed: boolean;
  audioBoolean: boolean;
  startHidden: boolean;
  controllerOpacity: number;
  controllerButtonSize: number;
  keyBindings: KeyBinding[];
  blacklist: string;
  defaultLogLevel: number;
  logLevel: number;
}

export const DEFAULT_SETTINGS: VSCSettings = {
  lastSpeed: 1.0, // default 1x
  enabled: true, // default enabled

  displayKeyCode: 86, // default: V
  rememberSpeed: false, // default: false
  forceLastSavedSpeed: false, //default: false
  audioBoolean: true, // default: true (enable audio controller support)
  startHidden: false, // default: false
  controllerOpacity: 0.3, // default: 0.3
  controllerButtonSize: 14,
  keyBindings: [
    { action: 'slower', key: 83, value: 0.1, force: false, predefined: true }, // S
    { action: 'faster', key: 68, value: 0.1, force: false, predefined: true }, // D
    { action: 'rewind', key: 90, value: 10, force: false, predefined: true }, // Z
    { action: 'advance', key: 88, value: 10, force: false, predefined: true }, // X
    { action: 'reset', key: 82, value: 1.0, force: false, predefined: true }, // R
    { action: 'fast', key: 71, value: 1.8, force: false, predefined: true }, // G
    { action: 'display', key: 86, value: 0, force: false, predefined: true }, // V
    { action: 'mark', key: 77, value: 0, force: false, predefined: true }, // M
    { action: 'jump', key: 74, value: 0, force: false, predefined: true }, // J
  ],
  blacklist: `www.instagram.com
x.com
imgur.com
teams.microsoft.com
meet.google.com`.replace(regStrip, ''),
  defaultLogLevel: 4,
  logLevel: 3,
};

/**
 * Format speed value to 2 decimal places
 */
export const formatSpeed = (speed: number): string => speed.toFixed(2);

export const LOG_LEVELS = {
  NONE: 1,
  ERROR: 2,
  WARNING: 3,
  INFO: 4,
  DEBUG: 5,
  VERBOSE: 6,
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export const MESSAGE_TYPES = {
  SET_SPEED: 'VSC_SET_SPEED',
  ADJUST_SPEED: 'VSC_ADJUST_SPEED',
  RESET_SPEED: 'VSC_RESET_SPEED',
  TOGGLE_DISPLAY: 'VSC_TOGGLE_DISPLAY',
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export interface SpeedLimits {
  readonly MIN: number;
  readonly MAX: number;
}

export const SPEED_LIMITS: SpeedLimits = {
  MIN: 0.07, // Video min rate per Chromium source
  MAX: 16, // Maximum playback speed in Chrome per Chromium source
};

export interface ControllerSizeLimits {
  readonly VIDEO_MIN_WIDTH: number;
  readonly VIDEO_MIN_HEIGHT: number;
  readonly AUDIO_MIN_WIDTH: number;
  readonly AUDIO_MIN_HEIGHT: number;
}

export const CONTROLLER_SIZE_LIMITS: ControllerSizeLimits = {
  // Video elements: minimum size before rejecting controller entirely
  VIDEO_MIN_WIDTH: 40,
  VIDEO_MIN_HEIGHT: 40,

  // Audio elements: minimum size before starting controller hidden
  AUDIO_MIN_WIDTH: 20,
  AUDIO_MIN_HEIGHT: 20,
};

export const CUSTOM_ACTIONS_NO_VALUES: readonly string[] = [
  'pause',
  'muted',
  'mark',
  'jump',
  'display',
];

// Assign to global namespace for runtime compatibility
window.VSC = window.VSC || {};
window.VSC.Constants = {
  regStrip,
  regEndsWithFlags,
  DEFAULT_SETTINGS,
  formatSpeed,
  LOG_LEVELS,
  MESSAGE_TYPES,
  SPEED_LIMITS,
  CONTROLLER_SIZE_LIMITS,
  CUSTOM_ACTIONS_NO_VALUES,
};
