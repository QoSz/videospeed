/**
 * Unit tests for DragHandler class
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockVideo, createMockDOM } from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;

/**
 * Flush pending requestAnimationFrame callbacks (polyfilled as setTimeout(fn, 0))
 */
function flushRAF() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();
  window.VSC.DragHandler._isDragging = false;
  window.VSC.DragHandler._rafId = null;
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) mockDOM.cleanup();
  window.VSC.DragHandler._isDragging = false;
  window.VSC.DragHandler._rafId = null;
});

/**
 * Helper to create a valid drag setup with video, wrapper, shadow DOM, and parent
 */
function createDragSetup() {
  const video = createMockVideo();
  const wrapper = document.createElement('div');
  wrapper.className = 'vsc-controller';

  const parentDiv = document.createElement('div');
  Object.defineProperty(parentDiv, 'offsetHeight', { value: 480, configurable: true });
  Object.defineProperty(parentDiv, 'offsetWidth', { value: 640, configurable: true });
  parentDiv.appendChild(wrapper);
  document.body.appendChild(parentDiv);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);
  video.vsc = { div: wrapper };

  const mockEvent = {
    clientX: 100,
    clientY: 200,
  };

  return {
    video,
    wrapper,
    shadow,
    parentDiv,
    mockEvent,
    cleanup: () => {
      if (parentDiv.parentNode) {
        parentDiv.parentNode.removeChild(parentDiv);
      }
    },
  };
}

runner.test('DragHandler prevents concurrent drags', async () => {
  const setup = createDragSetup();

  // Start a drag to set the flag
  window.VSC.DragHandler._isDragging = true;

  // Attempting another drag should return early without error
  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);

  // Flag should still be true (no new drag started)
  assert.true(window.VSC.DragHandler._isDragging, 'Should still be dragging');

  setup.cleanup();
});

runner.test('DragHandler returns early when video.vsc.div is missing', async () => {
  const video = createMockVideo();
  video.vsc = {}; // No div property

  // Should not throw
  window.VSC.DragHandler.handleDrag(video, { clientX: 0, clientY: 0 });

  assert.false(window.VSC.DragHandler._isDragging, 'Should not start dragging');
});

runner.test('DragHandler returns early when shadowRoot is missing', async () => {
  const video = createMockVideo();
  const wrapper = document.createElement('div');
  // Do NOT attach shadow DOM
  video.vsc = { div: wrapper };

  window.VSC.DragHandler.handleDrag(video, { clientX: 0, clientY: 0 });

  assert.false(window.VSC.DragHandler._isDragging, 'Should not start dragging without shadowRoot');
});

runner.test('DragHandler sets _isDragging flag on start', async () => {
  const setup = createDragSetup();

  assert.false(window.VSC.DragHandler._isDragging, 'Should not be dragging initially');

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);

  assert.true(window.VSC.DragHandler._isDragging, 'Should be dragging after handleDrag');

  // Clean up by dispatching mouseup
  window.dispatchEvent(new Event('mouseup'));
  setup.cleanup();
});

runner.test('DragHandler adds dragging class to shadow controller', async () => {
  const setup = createDragSetup();

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);

  const shadowController = setup.shadow.querySelector('#controller');
  assert.true(
    shadowController.classList.contains('dragging'),
    'Shadow controller should have dragging class'
  );

  // Clean up
  window.dispatchEvent(new Event('mouseup'));
  setup.cleanup();
});

runner.test('DragHandler uses GPU-accelerated transform during drag', async () => {
  const setup = createDragSetup();

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);

  const shadowController = setup.shadow.querySelector('#controller');

  // Simulate mousemove on window (drag now uses window-level listeners)
  const moveEvent = new Event('mousemove', { bubbles: true });
  moveEvent.clientX = 150; // 50px right of initial 100
  moveEvent.clientY = 250; // 50px below initial 200
  window.dispatchEvent(moveEvent);

  // Flush requestAnimationFrame (polyfilled as setTimeout(fn, 0))
  await flushRAF();

  // During drag, position is applied via transform (GPU-accelerated)
  assert.true(
    shadowController.style.transform.includes('translate'),
    'Should use transform: translate() during drag'
  );
  assert.true(
    shadowController.style.transform.includes('50'),
    'Transform should reflect 50px movement'
  );

  // Clean up
  window.dispatchEvent(new Event('mouseup'));
  setup.cleanup();
});

runner.test('DragHandler commits final position to left/top on mouseup', async () => {
  const setup = createDragSetup();

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);

  const shadowController = setup.shadow.querySelector('#controller');

  // Move 50px right and 50px down
  const moveEvent = new Event('mousemove', { bubbles: true });
  moveEvent.clientX = 150;
  moveEvent.clientY = 250;
  window.dispatchEvent(moveEvent);
  await flushRAF();

  // Dispatch mouseup to finalize
  window.dispatchEvent(new Event('mouseup'));

  // After drag ends, position is committed to left/top and transform is cleared
  assert.true(
    shadowController.style.left.includes('50'),
    'Left position should be committed after drag'
  );
  assert.true(
    shadowController.style.top.includes('50'),
    'Top position should be committed after drag'
  );
  assert.equal(shadowController.style.transform, '', 'Transform should be cleared after drag');

  setup.cleanup();
});

runner.test('DragHandler cleans up on mouseup', async () => {
  const setup = createDragSetup();

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);
  assert.true(window.VSC.DragHandler._isDragging, 'Should be dragging');

  // Dispatch mouseup on window
  window.dispatchEvent(new Event('mouseup'));

  assert.false(window.VSC.DragHandler._isDragging, 'Should stop dragging after mouseup');

  setup.cleanup();
});

runner.test('DragHandler removes dragging class on cleanup', async () => {
  const setup = createDragSetup();

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);

  const shadowController = setup.shadow.querySelector('#controller');
  assert.true(shadowController.classList.contains('dragging'), 'Should have dragging class');

  // Dispatch mouseup to trigger cleanup
  window.dispatchEvent(new Event('mouseup'));

  assert.false(
    shadowController.classList.contains('dragging'),
    'Should remove dragging class after mouseup'
  );

  setup.cleanup();
});

runner.test('DragHandler continues drag when cursor leaves parent', async () => {
  const setup = createDragSetup();

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);
  assert.true(window.VSC.DragHandler._isDragging, 'Should be dragging');

  // Dispatch mouseleave on parentElement - drag should NOT stop
  setup.parentDiv.dispatchEvent(new Event('mouseleave'));

  assert.true(
    window.VSC.DragHandler._isDragging,
    'Should continue dragging after mouseleave (listeners are on window)'
  );

  // Clean up
  window.dispatchEvent(new Event('mouseup'));
  setup.cleanup();
});

runner.test('DragHandler resets _isDragging flag on cleanup', async () => {
  const setup = createDragSetup();

  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);
  assert.true(window.VSC.DragHandler._isDragging, 'Flag should be true during drag');

  // Use mouseup to trigger cleanup
  window.dispatchEvent(new Event('mouseup'));

  assert.false(
    window.VSC.DragHandler._isDragging,
    'Flag should be false after cleanup'
  );

  // Verify we can start a new drag after cleanup
  window.VSC.DragHandler.handleDrag(setup.video, setup.mockEvent);
  assert.true(
    window.VSC.DragHandler._isDragging,
    'Should be able to start new drag after cleanup'
  );

  // Final cleanup
  window.dispatchEvent(new Event('mouseup'));
  setup.cleanup();
});

export { runner as dragHandlerTestRunner };
