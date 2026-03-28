/**
 * Options page for Video Speed Controller
 * Depends on core VSC modules loaded via side-effect imports
 */

// Core utilities and constants - must load first
import '../../utils/constants.js';
import '../../utils/logger.js';

// Storage and settings - depends on utils
import '../../core/storage-manager.js';
import '../../core/settings.js';

// Initialize global namespace for options page
window.VSC = window.VSC || {} as Window['VSC'];

// Keys that would interfere with form navigation
const BLACKLISTED_KEYS = new Set([
  'Tab', 'Shift', 'Control', 'Alt', 'Meta',
  'CapsLock', 'NumLock', 'ScrollLock', 'ContextMenu',
]);

interface BindingEntry {
  action: string;
  key: number;
  value: number;
  force: boolean;
  predefined: boolean;
}

let keyBindings: BindingEntry[] = [];

/**
 * Record a key press into a shortcut input field.
 * Uses event.key (browser-native) instead of manual keyCode mapping.
 */
function recordKeyPress(e: Event): void {
  const ke = e as KeyboardEvent;
  const target = ke.target as HTMLInputElement & { keyCode?: number };

  if (ke.key === 'Backspace') {
    target.value = '';
    ke.preventDefault();
    ke.stopPropagation();
    return;
  }

  if (ke.key === 'Escape') {
    target.value = 'null';
    target.keyCode = undefined;
    ke.preventDefault();
    ke.stopPropagation();
    return;
  }

  if (BLACKLISTED_KEYS.has(ke.key)) {
    ke.preventDefault();
    ke.stopPropagation();
    return;
  }

  // Use event.key for display, store keyCode for backward compatibility
  target.value = ke.key.length === 1 ? ke.key.toUpperCase() : ke.key;
  target.keyCode = ke.keyCode;
  ke.preventDefault();
  ke.stopPropagation();
}

/**
 * Display name for a keyCode — uses event.key when available,
 * falls back to String.fromCharCode for printable ASCII range.
 */
function keyCodeDisplayName(keyCode: number | undefined | null): string {
  if (keyCode === undefined || keyCode === null || keyCode === 0) {
    return 'null';
  }
  if (keyCode >= 48 && keyCode <= 90) {
    return String.fromCharCode(keyCode);
  }
  return `Key ${keyCode}`;
}

function inputFilterNumbersOnly(e: Event): void {
  const ke = e as KeyboardEvent;
  const target = ke.target as HTMLInputElement;
  const char = String.fromCharCode(ke.keyCode);
  if (!/[\d.]$/.test(char) || !/^\d+(\.\d*)?$/.test(target.value + char)) {
    ke.preventDefault();
    ke.stopPropagation();
  }
}

function inputFocus(e: Event): void {
  (e.target as HTMLInputElement).value = '';
}

function inputBlur(e: Event): void {
  const target = e.target as HTMLInputElement & { keyCode?: number };
  target.value = keyCodeDisplayName(target.keyCode);
}

function setKeyInput(input: HTMLInputElement & { keyCode?: number }, keyCode: number): void {
  input.value = keyCodeDisplayName(keyCode);
  input.keyCode = keyCode;
}

function addShortcut(): void {
  const html = `<select class="customDo">
    <option value="slower">Decrease speed</option>
    <option value="faster">Increase speed</option>
    <option value="rewind">Rewind</option>
    <option value="advance">Advance</option>
    <option value="reset">Reset speed</option>
    <option value="fast">Preferred speed</option>
    <option value="muted">Mute</option>
    <option value="softer">Decrease volume</option>
    <option value="louder">Increase volume</option>
    <option value="pause">Pause</option>
    <option value="mark">Set marker</option>
    <option value="jump">Jump to marker</option>
    <option value="display">Show/hide controller</option>
    </select>
    <input class="customKey" type="text" placeholder="press a key"/>
    <input class="customValue" type="text" placeholder="value (0.10)"/>
    <button class="removeParent">X</button>`;

  const div = document.createElement('div');
  div.setAttribute('class', 'row customs');
  div.innerHTML = html;

  const customsElement = document.getElementById('customs');
  if (!customsElement) { return; }

  customsElement.insertBefore(
    div,
    customsElement.children[customsElement.childElementCount - 1] ?? null
  );

  const customValue = div.querySelector('.customValue');
  const forceSelect = document.createElement('select');
  forceSelect.className = 'customForce';
  forceSelect.innerHTML = `
    <option value="false">Default behavior</option>
    <option value="true">Override site keys</option>
  `;
  customValue?.parentNode?.insertBefore(forceSelect, customValue.nextSibling);
}

function createKeyBindings(item: Element): void {
  const actionSelect = item.querySelector('.customDo') as HTMLSelectElement | null;
  const keyInput = item.querySelector('.customKey') as (HTMLInputElement & { keyCode?: number }) | null;
  const valueInput = item.querySelector('.customValue') as HTMLInputElement | null;
  const forceElement = item.querySelector('.customForce') as HTMLSelectElement | null;

  const action = actionSelect?.value ?? '';
  const key = keyInput?.keyCode ?? 0;
  const value = Number(valueInput?.value ?? 0);
  const force = forceElement?.value === 'true'; // Boolean immediately, no string storage
  const predefined = !!item.id;

  keyBindings.push({ action, key, value, force, predefined });
}

function validate(): boolean {
  let valid = true;
  const status = document.getElementById('status');
  const blacklist = document.getElementById('blacklist') as HTMLTextAreaElement | null;
  if (!status || !blacklist) { return false; }

  if ((window as unknown as { validationTimeout?: ReturnType<typeof setTimeout> }).validationTimeout) {
    clearTimeout((window as unknown as { validationTimeout?: ReturnType<typeof setTimeout> }).validationTimeout);
  }

  for (const line of blacklist.value.split('\n')) {
    const match = line.replace(window.VSC.Constants.regStrip, '');

    if (match.startsWith('/')) {
      try {
        const parts = match.split('/');
        if (parts.length < 3) { throw new Error('invalid regex'); }
        const flags = parts.pop() ?? '';
        const regex = parts.slice(1).join('/');
        new RegExp(regex, flags); // Validate regex
      } catch {
        status.textContent = `Error: Invalid blacklist regex: "${match}". Unable to save.`;
        status.classList.add('show', 'error');
        valid = false;

        (window as unknown as { validationTimeout?: ReturnType<typeof setTimeout> }).validationTimeout = setTimeout(() => {
          status.textContent = '';
          status.classList.remove('show', 'error');
        }, 5000);
        return false;
      }
    }
  }
  return valid;
}

async function saveOptions(): Promise<void> {
  if (!validate()) { return; }

  const status = document.getElementById('status');
  if (!status) { return; }
  status.textContent = 'Saving...';
  status.classList.remove('success', 'error');
  status.classList.add('show');

  try {
    keyBindings = [];
    document.querySelectorAll('.customs').forEach((item) => createKeyBindings(item));

    const getChecked = (id: string): boolean => (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false;
    const getNumber = (id: string): number => Number((document.getElementById(id) as HTMLInputElement | null)?.value ?? 0);
    const getString = (id: string): string => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';

    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig() as Window['VSC']['videoSpeedConfig'];
    }

    const settingsToSave = {
      rememberSpeed: getChecked('rememberSpeed'),
      forceLastSavedSpeed: getChecked('forceLastSavedSpeed'),
      audioBoolean: getChecked('audioBoolean'),
      startHidden: getChecked('startHidden'),
      controllerOpacity: getNumber('controllerOpacity'),
      controllerButtonSize: getNumber('controllerButtonSize'),
      logLevel: parseInt(getString('logLevel'), 10),
      keyBindings,
      blacklist: getString('blacklist').replace(window.VSC.Constants.regStrip, ''),
    };

    await window.VSC.videoSpeedConfig.save(settingsToSave);

    status.textContent = 'Options saved';
    status.classList.add('success');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'success');
    }, 2000);
  } catch (error) {
    window.VSC.logger.error(`Failed to save options: ${(error as Error).message}`);
    status.textContent = `Error saving options: ${(error as Error).message}`;
    status.classList.add('show', 'error');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'error');
    }, 3000);
  }
}

async function restoreOptions(): Promise<void> {
  try {
    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig() as Window['VSC']['videoSpeedConfig'];
    }

    await window.VSC.videoSpeedConfig.load();
    const storage = window.VSC.videoSpeedConfig.settings;

    const setChecked = (id: string, val: boolean): void => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) { el.checked = val; }
    };
    const setValue = (id: string, val: string | number): void => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) { el.value = String(val); }
    };

    setChecked('rememberSpeed', storage.rememberSpeed);
    setChecked('forceLastSavedSpeed', storage.forceLastSavedSpeed);
    setChecked('audioBoolean', storage.audioBoolean);
    setChecked('startHidden', storage.startHidden);
    setValue('controllerOpacity', storage.controllerOpacity);
    setValue('controllerButtonSize', storage.controllerButtonSize);
    setValue('logLevel', storage.logLevel);
    setValue('blacklist', storage.blacklist);

    const bindings = storage.keyBindings || window.VSC.Constants.DEFAULT_SETTINGS.keyBindings;

    for (const item of bindings) {
      if (item.predefined) {
        if (item.action === 'display' && typeof item.key === 'undefined') {
          (item as { key: number }).key = storage.displayKeyCode || window.VSC.Constants.DEFAULT_SETTINGS.displayKeyCode;
        }

        if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(item.action)) {
          const valueInput = document.querySelector(`#${item.action} .customValue`) as HTMLElement | null;
          if (valueInput) { valueInput.style.display = 'none'; }
        }

        const keyInput = document.querySelector(`#${item.action} .customKey`) as (HTMLInputElement & { keyCode?: number }) | null;
        const valueInput = document.querySelector(`#${item.action} .customValue`) as HTMLInputElement | null;
        const forceInput = document.querySelector(`#${item.action} .customForce`) as HTMLSelectElement | null;

        if (keyInput) { setKeyInput(keyInput, item.key); }
        if (valueInput) { valueInput.value = String(item.value); }
        if (forceInput) { forceInput.value = String(item.force); }
      } else {
        addShortcut();
        const dom = document.querySelector('.customs:last-of-type');
        if (!dom) { continue; }

        const doSelect = dom.querySelector('.customDo') as HTMLSelectElement | null;
        if (doSelect) { doSelect.value = item.action; }

        if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(item.action)) {
          const valueInput = dom.querySelector('.customValue') as HTMLElement | null;
          if (valueInput) { valueInput.style.display = 'none'; }
        }

        const keyInput = dom.querySelector('.customKey') as (HTMLInputElement & { keyCode?: number }) | null;
        if (keyInput) { setKeyInput(keyInput, item.key); }

        const valueInput = dom.querySelector('.customValue') as HTMLInputElement | null;
        if (valueInput) { valueInput.value = String(item.value); }

        const forceSelect = dom.querySelector('.customForce') as HTMLSelectElement | null;
        if (item.force !== undefined && !forceSelect) {
          const customValue = dom.querySelector('.customValue');
          const select = document.createElement('select');
          select.className = 'customForce';
          select.innerHTML = `
            <option value="false">Default behavior</option>
            <option value="true">Override site keys</option>
          `;
          select.value = String(item.force);
          customValue?.parentNode?.insertBefore(select, customValue.nextSibling);
        } else if (forceSelect) {
          forceSelect.value = String(item.force);
        }
      }
    }
  } catch (error) {
    window.VSC.logger.error(`Failed to restore options: ${(error as Error).message}`);
    const status = document.getElementById('status');
    if (status) {
      status.textContent = `Error loading options: ${(error as Error).message}`;
      status.classList.add('show', 'error');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('show', 'error');
      }, 3000);
    }
  }
}

async function restoreDefaults(): Promise<void> {
  const status = document.getElementById('status');
  if (!status) { return; }

  try {
    status.textContent = 'Restoring defaults...';
    status.classList.remove('success', 'error');
    status.classList.add('show');

    await window.VSC.StorageManager.clear();

    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig() as Window['VSC']['videoSpeedConfig'];
    }

    await window.VSC.videoSpeedConfig.save(window.VSC.Constants.DEFAULT_SETTINGS);

    document.querySelectorAll('.removeParent').forEach((button) => (button as HTMLElement).click());

    await restoreOptions();

    status.textContent = 'Default options restored';
    status.classList.add('success');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'success');
    }, 2000);
  } catch (error) {
    window.VSC.logger.error(`Failed to restore defaults: ${(error as Error).message}`);
    status.textContent = `Error restoring defaults: ${(error as Error).message}`;
    status.classList.add('show', 'error');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'error');
    }, 3000);
  }
}

function eventCaller(event: Event, className: string, funcName: (e: Event) => void): void {
  if (!(event.target as HTMLElement)?.classList?.contains(className)) { return; }
  funcName(event);
}

document.addEventListener('DOMContentLoaded', async () => {
  window.VSC.StorageManager.onError((error: Error, data?: unknown) => {
    console.warn('Storage operation failed:', error.message, data);
  });

  await restoreOptions();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = (btn as HTMLElement).dataset.tab;
      document.querySelector(`.tab-content[data-tab="${tab}"]`)?.classList.add('active');
      const actionButtons = document.getElementById('action-buttons');
      if (actionButtons) {
        actionButtons.style.display = tab === 'help' ? 'none' : '';
      }
    });
  });

  // Disable action dropdowns for predefined shortcuts
  document.querySelectorAll('.row.customs[id] .customDo').forEach((select) => {
    (select as HTMLSelectElement).disabled = true;
  });

  document.getElementById('save')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await saveOptions();
  });

  document.getElementById('add')?.addEventListener('click', addShortcut);

  document.getElementById('restore')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await restoreDefaults();
  });

  document.getElementById('about')?.addEventListener('click', () => {
    window.open('https://github.com/igrigorik/videospeed');
  });

  document.getElementById('feedback')?.addEventListener('click', () => {
    window.open('https://github.com/igrigorik/videospeed/issues');
  });

  document.addEventListener('keypress', (event) => eventCaller(event, 'customValue', inputFilterNumbersOnly));
  document.addEventListener('focus', (event) => eventCaller(event, 'customKey', inputFocus), true);
  document.addEventListener('blur', (event) => eventCaller(event, 'customKey', inputBlur), true);
  document.addEventListener('keydown', (event) => eventCaller(event, 'customKey', recordKeyPress));
  document.addEventListener('click', (event) => {
    eventCaller(event, 'removeParent', () => {
      (event.target as HTMLElement)?.parentNode?.removeChild(event.target as HTMLElement);
    });
  });
  document.addEventListener('change', (event) => {
    eventCaller(event, 'customDo', () => {
      const valueInput = (event.target as HTMLElement)?.closest('.row.customs')?.querySelector('.customValue') as HTMLElement | null;
      if (!valueInput) { return; }
      if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes((event.target as HTMLSelectElement).value)) {
        valueInput.style.display = 'none';
        (valueInput as HTMLInputElement).value = '0';
      } else {
        valueInput.style.display = 'inline-block';
      }
    });
  });
});
