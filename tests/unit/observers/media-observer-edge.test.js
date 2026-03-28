import {
  installChromeMock,
  cleanupChromeMock,
  resetMockStorage,
} from '../../helpers/chrome-mock.js';
import {
  SimpleTestRunner,
  assert,
  createMockDOM,
  wait as _wait,
} from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

await loadCoreModules();
const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  // Remove any lingering video/audio elements from previous tests
  document.querySelectorAll('video, audio').forEach(el => el.remove());
  mockDOM = createMockDOM();
  if (window.VSC && window.VSC.stateManager) {
    window.VSC.stateManager.controllers.clear();
  }
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}
});

/**
 * Helper: create a fully wired MediaElementObserver with config loaded
 */
async function createMediaObserver(configOverrides = {}) {
  const config = window.VSC.videoSpeedConfig;
  await config.load();

  // Apply any config overrides
  if (configOverrides.audioBoolean !== undefined) {
    config.settings.audioBoolean = configOverrides.audioBoolean;
  }

  const siteHandlerManager = window.VSC.siteHandlerManager;
  const mutationObserver = new window.VSC.VideoMutationObserver(
    config,
    () => {},
    () => {}
  );
  const mediaObserver = new window.VSC.MediaElementObserver(config, siteHandlerManager);
  mediaObserver.mutationObserver = mutationObserver;
  return mediaObserver;
}

// --- Tests ---

runner.test('scanForMediaLight finds video elements in document', async () => {
  const mediaObserver = await createMediaObserver();

  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  mockDOM.container.appendChild(video);

  const found = mediaObserver.scanForMediaLight(document);

  assert.greaterThan(found.length, 0, 'Should find at least one video');
  assert.true(found.includes(video), 'Should include the appended video element');
});

runner.test('scanForMediaLight returns empty when no media exists', async () => {
  const mediaObserver = await createMediaObserver();

  // Ensure no video/audio in the DOM (mockDOM.container is empty)
  const found = mediaObserver.scanForMediaLight(document);

  assert.equal(found.length, 0, 'Should find no media elements in a clean DOM');
});

runner.test('scanForMedia finds videos including shadow DOM', async () => {
  const mediaObserver = await createMediaObserver();

  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  mockDOM.container.appendChild(video);

  const found = mediaObserver.scanForMedia(document);

  assert.greaterThan(found.length, 0, 'Should find at least one video');
  assert.true(found.includes(video), 'Should include the appended video element');
});

runner.test('isValidMediaElement returns true for connected video with source', async () => {
  const mediaObserver = await createMediaObserver();

  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  mockDOM.container.appendChild(video);

  const result = mediaObserver.isValidMediaElement(video);
  assert.true(result, 'Connected video with source should be valid');
});

runner.test('isValidMediaElement returns false for disconnected element', async () => {
  const mediaObserver = await createMediaObserver();

  // Create a video but do NOT add it to the DOM
  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';

  const result = mediaObserver.isValidMediaElement(video);
  assert.false(result, 'Disconnected video should be invalid');
});

runner.test('isValidMediaElement returns false for audio when audioBoolean is false', async () => {
  const mediaObserver = await createMediaObserver({ audioBoolean: false });

  const audio = document.createElement('audio');
  audio.src = 'https://example.com/audio.mp3';
  mockDOM.container.appendChild(audio);

  const result = mediaObserver.isValidMediaElement(audio);
  assert.false(result, 'Audio should be invalid when audioBoolean is false');
});

runner.test('isValidMediaElement returns true for audio when audioBoolean is true', async () => {
  const mediaObserver = await createMediaObserver({ audioBoolean: true });

  const audio = document.createElement('audio');
  audio.src = 'https://example.com/audio.mp3';
  mockDOM.container.appendChild(audio);

  const result = mediaObserver.isValidMediaElement(audio);
  assert.true(result, 'Audio should be valid when audioBoolean is true');
});

runner.test('findControllerParent returns parent element for video', async () => {
  const mediaObserver = await createMediaObserver();

  const wrapper = document.createElement('div');
  wrapper.id = 'video-wrapper';
  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  wrapper.appendChild(video);
  mockDOM.container.appendChild(wrapper);

  const parent = mediaObserver.findControllerParent(video);
  assert.equal(parent, wrapper, 'Controller parent should be the video parentElement');
});

export { runner as mediaObserverEdgeTestRunner };
