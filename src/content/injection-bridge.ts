/**
 * Content script injection helpers for bundled architecture
 * Handles script injection and message bridging between contexts
 */

interface VSCBridgeMessage {
  source: string;
  action: string;
  data: Record<string, unknown>;
}

interface VSCRuntimeMessage {
  type: string;
  action?: string;
  [key: string]: unknown;
}

/**
 * Inject a bundled script file into the page context
 */
export function injectScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptPath);
    script.onload = (): void => {
      script.remove();
      resolve();
    };
    script.onerror = (): void => {
      script.remove();
      reject(new Error(`Failed to load script: ${scriptPath}`));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

/**
 * Set up message bridge between content script and page context
 * Handles bi-directional communication for popup and settings updates
 */
export function setupMessageBridge(): void {
  // Listen for messages from the page context (injected script)
  window.addEventListener('message', (event: MessageEvent<VSCBridgeMessage>) => {
    if (event.source !== window || !event.data?.source?.startsWith('vsc-')) {
      return;
    }

    const { source, action, data } = event.data;

    if (source === 'vsc-page') {
      // Forward page messages to extension runtime
      if (action === 'storage-update') {
        chrome.storage.sync.set(data);
      } else if (action === 'runtime-message') {
        // Forward runtime messages
        const msg = data as unknown as VSCRuntimeMessage;
        if (msg.type !== 'VSC_STATE_UPDATE') {
          chrome.runtime.sendMessage(data);
        }
      } else if (action === 'get-storage') {
        // Page script requesting current storage
        chrome.storage.sync.get(null, (items: Record<string, unknown>) => {
          window.postMessage(
            {
              source: 'vsc-content',
              action: 'storage-data',
              data: items,
            },
            '*'
          );
        });
      }
    }
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(
    (
      request: VSCRuntimeMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ): boolean | undefined => {
      // Forward to page context using CustomEvent (matching what inject.js expects)
      window.dispatchEvent(
        new CustomEvent('VSC_MESSAGE', {
          detail: request,
        })
      );

      // Handle responses if needed
      if (request.action === 'get-status') {
        // Wait for response from page context with timeout cleanup
        const responseHandler = (event: MessageEvent<VSCBridgeMessage>): void => {
          if (
            event.data?.source === 'vsc-page' &&
            event.data?.action === 'status-response'
          ) {
            clearTimeout(timeoutId);
            window.removeEventListener('message', responseHandler);
            sendResponse(event.data.data);
          }
        };
        window.addEventListener('message', responseHandler);
        const timeoutId = setTimeout(() => {
          window.removeEventListener('message', responseHandler);
        }, 5000);
        return true; // Keep message channel open for async response
      }
      return undefined;
    }
  );

  // Listen for storage changes from other extension contexts
  chrome.storage.onChanged.addListener(
    (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => {
      if (namespace === 'sync') {
        // Forward storage changes to page context
        const changedData: Record<string, unknown> = {};
        for (const [key, { newValue }] of Object.entries(changes)) {
          changedData[key] = newValue;
        }
        window.postMessage(
          {
            source: 'vsc-content',
            action: 'storage-changed',
            data: changedData,
          },
          '*'
        );
      }
    }
  );
}
