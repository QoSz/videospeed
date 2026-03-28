/**
 * Type definitions for site handlers
 */

import type { ControllerPosition } from './controller.js';

/** Interface for all site-specific handlers */
export interface ISiteHandler {
  hostname: string;

  /** Get site-specific positioning for the controller */
  getControllerPosition(parent: HTMLElement, video: HTMLMediaElement): ControllerPosition;

  /** Handle site-specific seeking; returns true if handled */
  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean;

  /** Handle site-specific initialization */
  initialize(document: Document): void;

  /** Handle site-specific cleanup */
  cleanup(): void;

  /** Check if a video element should be ignored */
  shouldIgnoreVideo(video: HTMLMediaElement): boolean;

  /** Get site-specific CSS selectors for video containers */
  getVideoContainerSelectors(): string[];

  /** Handle special video detection logic */
  detectSpecialVideos(root: Document | ShadowRoot): HTMLMediaElement[];
}
