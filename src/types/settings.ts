/**
 * Type definitions for VSC settings and configuration
 */

/** Individual key binding configuration */
export interface KeyBinding {
  action: string;
  key: number;
  value: number;
  force: boolean;
  predefined: boolean;
}

/** All extension settings */
export interface VSCSettings {
  enabled: boolean;
  lastSpeed: number;
  audioBoolean: boolean;
  startHidden: boolean;
  rememberSpeed: boolean;
  forceLastSavedSpeed: boolean;
  controllerOpacity: number;
  controllerButtonSize: number;
  keyBindings: KeyBinding[];
  blacklist: string;
  logLevel: number;
  defaultLogLevel: number;
  displayKeyCode: number;
}

/** Log level constants */
export const enum LogLevel {
  NONE = 1,
  ERROR = 2,
  WARNING = 3,
  INFO = 4,
  DEBUG = 5,
  VERBOSE = 6,
}

/** Speed limit boundaries */
export interface SpeedLimits {
  MIN: number;
  MAX: number;
}

/** Controller size boundaries for visibility decisions */
export interface ControllerSizeLimits {
  VIDEO_MIN_WIDTH: number;
  VIDEO_MIN_HEIGHT: number;
  AUDIO_MIN_WIDTH: number;
  AUDIO_MIN_HEIGHT: number;
}
