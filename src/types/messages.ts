/**
 * Type definitions for messaging between extension contexts
 */

/** Message type constants for popup-to-page communication */
export const enum MessageType {
  VSC_SET_SPEED = 'VSC_SET_SPEED',
  VSC_ADJUST_SPEED = 'VSC_ADJUST_SPEED',
  VSC_RESET_SPEED = 'VSC_RESET_SPEED',
  VSC_TOGGLE_DISPLAY = 'VSC_TOGGLE_DISPLAY',
}

/** Popup message discriminated union */
export type PopupMessage =
  | { type: MessageType.VSC_SET_SPEED; payload: { speed: number } }
  | { type: MessageType.VSC_ADJUST_SPEED; payload: { delta: number } }
  | { type: MessageType.VSC_RESET_SPEED }
  | { type: MessageType.VSC_TOGGLE_DISPLAY };

/** Bridge message actions from page context to content script */
export type BridgeMessageFromPage =
  | { source: 'vsc-page'; action: 'storage-update'; nonce: string; data: Record<string, unknown> }
  | { source: 'vsc-page'; action: 'runtime-message'; nonce: string; data: { type: string; [key: string]: unknown } }
  | { source: 'vsc-page'; action: 'get-storage'; nonce: string }
  | { source: 'vsc-page'; action: 'status-response'; data: unknown };

/** Bridge message actions from content script to page context */
export type BridgeMessageFromContent =
  | { source: 'vsc-content'; action: 'storage-data'; data: Record<string, unknown> }
  | { source: 'vsc-content'; action: 'storage-changed'; data: Record<string, unknown> };

/** Union of all bridge messages */
export type BridgeMessage = BridgeMessageFromPage | BridgeMessageFromContent;
