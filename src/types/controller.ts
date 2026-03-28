/**
 * Type definitions for video controller
 */

/** Properties attached to a media element via element.vsc */
export interface VSCAttachment {
  div: HTMLElement;
  speedIndicator: HTMLElement | null;
  controllerId: string;
  expectedSpeed: number | null;
  speedBeforeReset: number | null;
  mark: number | undefined;
  remove(): void;
  updateVisibility(): void;
}

/** Controller registration info stored in StateManager */
export interface ControllerInfo {
  controller: {
    video: HTMLMediaElement;
    controllerId: string;
    remove(): void;
  };
  element: HTMLMediaElement;
  tagName: string | undefined;
  videoSrc: string | undefined;
  created: number;
}

/** Site-specific controller insertion positioning */
export interface ControllerPosition {
  insertionPoint: HTMLElement | Node;
  insertionMethod: 'appendChild' | 'firstChild' | 'beforeParent' | 'afterParent';
  targetParent: HTMLElement | Node;
}

/** Options for ActionHandler.adjustSpeed */
export interface AdjustSpeedOptions {
  relative?: boolean;
  source?: 'internal' | 'external';
}
