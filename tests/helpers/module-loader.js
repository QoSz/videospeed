/**
 * Test module loader - loads all common dependencies for unit tests
 * This avoids the need for long import lists in individual test files
 */

/**
 * Load all core modules required for most tests
 * This mimics the global module loading pattern used in the extension
 */
export async function loadCoreModules() {
  // Core utilities (order matters due to dependencies)
  await import('../../src/utils/constants.ts');
  await import('../../src/utils/logger.ts');
  await import('../../src/utils/dom-utils.ts');
  await import('../../src/utils/event-manager.ts');

  // Storage and settings
  await import('../../src/core/storage-manager.ts');
  await import('../../src/core/settings.ts');

  // State management
  await import('../../src/core/state-manager.ts');

  // Site handlers
  await import('../../src/site-handlers/base-handler.ts');
  await import('../../src/site-handlers/netflix-handler.ts');
  await import('../../src/site-handlers/youtube-handler.ts');
  await import('../../src/site-handlers/facebook-handler.ts');
  await import('../../src/site-handlers/amazon-handler.ts');
  await import('../../src/site-handlers/apple-handler.ts');
  await import('../../src/site-handlers/index.ts');

  // Core controllers
  await import('../../src/core/action-handler.ts');
  await import('../../src/core/video-controller.ts');

  // UI components
  await import('../../src/ui/controls.ts');
  await import('../../src/ui/drag-handler.ts');
  await import('../../src/ui/shadow-dom.ts');
  await import('../../src/ui/vsc-controller-element.ts');

  // Observers
  await import('../../src/observers/mutation-observer.ts');
  await import('../../src/observers/media-observer.ts');
}

/**
 * Load injection script modules (includes core modules + inject.js)
 */
export async function loadInjectModules() {
  await loadCoreModules();
  await import('../../src/content/inject.ts');
}

/**
 * Load minimal modules for lightweight tests
 */
export async function loadMinimalModules() {
  await import('../../src/utils/constants.ts');
  await import('../../src/utils/logger.ts');
  await import('../../src/core/storage-manager.ts');
  await import('../../src/core/settings.ts');
}

/**
 * Load observer modules for observer tests
 */
export async function loadObserverModules() {
  await import('../../src/utils/logger.ts');
  await import('../../src/utils/dom-utils.ts');
  await import('../../src/observers/mutation-observer.ts');
}
