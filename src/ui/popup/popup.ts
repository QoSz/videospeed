/**
 * Popup controller for Video Speed Controller extension
 */

// Message type constants (separate bundle from inject.js, can't import)
const MessageTypes = {
  SET_SPEED: 'VSC_SET_SPEED',
  ADJUST_SPEED: 'VSC_ADJUST_SPEED',
  RESET_SPEED: 'VSC_RESET_SPEED',
  TOGGLE_DISPLAY: 'VSC_TOGGLE_DISPLAY',
} as const;

type MessageTypeValue = typeof MessageTypes[keyof typeof MessageTypes];

interface SpeedMessage {
  type: MessageTypeValue;
  payload?: { speed?: number; delta?: number };
}

function sendToActiveTab(message: SpeedMessage): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId !== undefined) {
      chrome.tabs.sendMessage(tabId, message);
    }
  });
}

function setStatusMessage(str: string): void {
  const statusElement = document.querySelector('#status') as HTMLElement | null;
  if (statusElement) {
    statusElement.classList.toggle('hide', false);
    statusElement.innerText = str;
  }
}

function toggleEnabledUI(enabled: boolean): void {
  const disableBtn = document.querySelector('#disable') as HTMLElement | null;
  if (!disableBtn) { return; }

  disableBtn.classList.toggle('disabled', !enabled);
  disableBtn.title = enabled ? 'Disable Extension' : 'Enable Extension';

  const suffix = enabled ? '' : '_disabled';
  chrome.action.setIcon({
    path: {
      '19': chrome.runtime.getURL(`assets/icons/icon19${suffix}.png`),
      '38': chrome.runtime.getURL(`assets/icons/icon38${suffix}.png`),
      '48': chrome.runtime.getURL(`assets/icons/icon48${suffix}.png`),
    },
  });

  chrome.runtime.sendMessage({ type: 'EXTENSION_TOGGLE', enabled });
}

function toggleEnabled(enabled: boolean, callback?: (enabled: boolean) => void): void {
  chrome.storage.sync.set({ enabled }, () => {
    toggleEnabledUI(enabled);
    if (callback) { callback(enabled); }
  });
}

function settingsSavedReloadMessage(enabled: boolean): void {
  setStatusMessage(`${enabled ? 'Enabled' : 'Disabled'}. Reload page.`);
}

function updateSpeedControlsUI(slowerStep: number, fasterStep: number, resetSpeed: number): void {
  const decreaseBtn = document.querySelector('#speed-decrease') as HTMLElement | null;
  if (decreaseBtn) {
    decreaseBtn.dataset.delta = String(-slowerStep);
    const span = decreaseBtn.querySelector('span');
    if (span) { span.textContent = `-${slowerStep}`; }
  }

  const increaseBtn = document.querySelector('#speed-increase') as HTMLElement | null;
  if (increaseBtn) {
    increaseBtn.dataset.delta = String(fasterStep);
    const span = increaseBtn.querySelector('span');
    if (span) { span.textContent = `+${fasterStep}`; }
  }

  const resetBtn = document.querySelector('#speed-reset') as HTMLElement | null;
  if (resetBtn) {
    resetBtn.textContent = resetSpeed.toString();
  }
}

function initializeSpeedControls(_slowerStep: number, _fasterStep: number): void {
  const decreaseBtn = document.querySelector('#speed-decrease');
  decreaseBtn?.addEventListener('click', function (this: HTMLElement) {
    const delta = parseFloat(this.dataset.delta || '-0.1');
    sendToActiveTab({ type: MessageTypes.ADJUST_SPEED, payload: { delta } });
  });

  const increaseBtn = document.querySelector('#speed-increase');
  increaseBtn?.addEventListener('click', function (this: HTMLElement) {
    const delta = parseFloat(this.dataset.delta || '0.1');
    sendToActiveTab({ type: MessageTypes.ADJUST_SPEED, payload: { delta } });
  });

  const resetBtn = document.querySelector('#speed-reset');
  resetBtn?.addEventListener('click', function (this: HTMLElement) {
    const preferredSpeed = parseFloat(this.textContent || '1.0');
    sendToActiveTab({ type: MessageTypes.SET_SPEED, payload: { speed: preferredSpeed } });
  });

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', function (this: HTMLElement) {
      const speed = parseFloat(this.dataset.speed || '1.0');
      sendToActiveTab({ type: MessageTypes.SET_SPEED, payload: { speed } });
    });
  });
}

function loadSettingsAndInitialize(): void {
  chrome.storage.sync.get(null, (storage: Record<string, unknown>) => {
    let slowerStep = 0.1;
    let fasterStep = 0.1;
    let resetSpeed = 1.0;

    const keyBindings = storage.keyBindings;
    if (Array.isArray(keyBindings)) {
      for (const kb of keyBindings) {
        if (typeof kb.action === 'string' && typeof kb.value === 'number') {
          if (kb.action === 'slower') { slowerStep = kb.value; }
          else if (kb.action === 'faster') { fasterStep = kb.value; }
          else if (kb.action === 'fast') { resetSpeed = kb.value; }
        }
      }
    }

    updateSpeedControlsUI(slowerStep, fasterStep, resetSpeed);
    initializeSpeedControls(slowerStep, fasterStep);
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadSettingsAndInitialize();

  document.querySelector('#config')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelector('#disable')?.addEventListener('click', function (this: HTMLElement) {
    const isCurrentlyEnabled = !this.classList.contains('disabled');
    toggleEnabled(!isCurrentlyEnabled, settingsSavedReloadMessage);
  });

  chrome.storage.sync.get({ enabled: true }, (storage: Record<string, unknown>) => {
    toggleEnabledUI(storage.enabled as boolean);
  });
});
