/**
 * Unit tests for ShadowDOMManager class
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockVideo, createMockDOM } from '../../helpers/test-utils.js';
import { loadCoreModules } from '../../helpers/module-loader.js';

await loadCoreModules();

const runner = new SimpleTestRunner();
let mockDOM;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) {mockDOM.cleanup();}
});

runner.test('createShadowDOM creates shadow root on wrapper', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  window.VSC.ShadowDOMManager.createShadowDOM(wrapper);

  assert.exists(wrapper.shadowRoot, 'Shadow root should exist on wrapper');
});

runner.test('createShadowDOM creates #controller element inside shadow', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);
  const controller = shadow.querySelector('#controller');

  assert.exists(controller, 'Should find #controller inside shadow DOM');
  assert.equal(controller.id, 'controller');
});

runner.test('createShadowDOM creates draggable speed indicator', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);
  const draggable = shadow.querySelector('.draggable');

  assert.exists(draggable, 'Draggable element should exist');
  assert.equal(draggable.className, 'draggable');
  assert.equal(draggable.getAttribute('data-action'), 'drag');
});

runner.test('createShadowDOM creates all 5 control buttons', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);
  const buttons = shadow.querySelectorAll('button');

  assert.equal(buttons.length, 5, 'Should have 5 buttons');

  const actions = Array.from(buttons).map((b) => b.getAttribute('data-action'));
  assert.deepEqual(actions, ['rewind', 'slower', 'faster', 'advance', 'display']);
});

runner.test('createShadowDOM applies custom opacity via inline style', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, { opacity: 0.5 });
  const controller = shadow.querySelector('#controller');

  assert.true(
    controller.style.cssText.includes('opacity'),
    'Should set opacity in controller inline style'
  );
});

runner.test('createShadowDOM applies custom buttonSize via CSS properties', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  window.VSC.ShadowDOMManager.createShadowDOM(wrapper, { buttonSize: 16 });

  assert.equal(
    wrapper.style.getPropertyValue('--vsc-button-size'),
    '16px',
    'Should set --vsc-button-size custom property'
  );
});

runner.test('createShadowDOM uses inline style element in JSDOM', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);

  // JSDOM lacks CSSStyleSheet.replaceSync, so it should fall back to inline <style>
  const styleEl = shadow.querySelector('style');
  assert.exists(styleEl, 'Should create an inline style element in JSDOM');
  assert.true(
    styleEl.textContent.length > 0,
    'Style element should have CSS content'
  );
});

runner.test('getController returns #controller element', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);
  const controller = window.VSC.ShadowDOMManager.getController(shadow);

  assert.exists(controller, 'getController should return an element');
  assert.equal(controller.id, 'controller');
});

runner.test('updateSpeedDisplay updates speed text', async () => {
  const wrapper = document.createElement('div');
  mockDOM.container.appendChild(wrapper);

  const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, { speed: '1.00' });
  window.VSC.ShadowDOMManager.updateSpeedDisplay(shadow, 2.5);

  const indicator = shadow.querySelector('.draggable');
  assert.equal(indicator.textContent, '2.50', 'Speed text should read "2.50"');
});

runner.test('calculatePosition returns top/left based on video rect', async () => {
  const video = createMockVideo();
  // Override getBoundingClientRect to return known values
  video.getBoundingClientRect = () => ({
    top: 100,
    left: 200,
    width: 640,
    height: 480,
  });

  // Mock offsetParent with its own rect
  Object.defineProperty(video, 'offsetParent', {
    value: {
      getBoundingClientRect: () => ({
        top: 50,
        left: 80,
        width: 800,
        height: 600,
      }),
    },
    configurable: true,
  });

  const position = window.VSC.ShadowDOMManager.calculatePosition(video);

  assert.equal(position.top, '50px', 'Top should be video.top - offsetParent.top');
  assert.equal(position.left, '120px', 'Left should be video.left - offsetParent.left');
});

export { runner as shadowDomTestRunner };
