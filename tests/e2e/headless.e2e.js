/**
 * Headless E2E tests for Video Speed Controller extension
 * Verifies that the extension works correctly in headless Chrome mode
 */

import {
  launchChromeWithExtension,
  waitForExtension,
  waitForVideo,
  waitForController as _waitForController,
  getVideoSpeed,
  controlVideo,
  sleep,
  assert,
} from './e2e-utils.js';

export default async function runHeadlessE2ETests() {
  console.log('🎭 Running Headless E2E Tests...\n');

  let browser;
  let passed = 0;
  let failed = 0;

  const runTest = async (testName, testFn) => {
    try {
      console.log(`  🧪 ${testName}`);
      await testFn();
      console.log(`  ✅ ${testName}`);
      passed++;
    } catch (error) {
      console.log(`  ❌ ${testName}: ${error.message}`);
      failed++;
    }
  };

  try {
    const { browser: b, page } = await launchChromeWithExtension({ headless: true });
    browser = b;

    const testPagePath = `file://${process.cwd()}/tests/e2e/test-video.html`;
    await page.goto(testPagePath, { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    await runTest('Extension loads in headless Chrome', async () => {
      const loaded = await waitForExtension(page, 10000);
      assert.true(loaded, 'Extension should load in headless mode');

      // Verify window.VSC exists
      const hasVSC = await page.evaluate(() => !!window.VSC);
      assert.true(hasVSC, 'window.VSC should exist in headless mode');
    });

    await runTest('Controller attaches to video in headless mode', async () => {
      const videoReady = await waitForVideo(page, 'video', 10000);
      assert.true(videoReady, 'Video should be ready in headless mode');

      const controllerFound = await page.evaluate(() => {
        return document.querySelector('.vsc-controller') !== null;
      });
      assert.true(controllerFound, '.vsc-controller should be found in headless mode');
    });

    await runTest('Speed changes work in headless mode', async () => {
      const initialSpeed = await getVideoSpeed(page);
      assert.exists(initialSpeed, 'Initial speed should exist');

      const success = await controlVideo(page, 'faster');
      assert.true(success, 'Faster button should work in headless mode');

      const newSpeed = await getVideoSpeed(page);
      assert.true(newSpeed > initialSpeed, `Speed should increase from ${initialSpeed}, got ${newSpeed}`);
    });

    await runTest('Shadow DOM renders correctly in headless mode', async () => {
      const shadowDOMInfo = await page.evaluate(() => {
        const controller = document.querySelector('.vsc-controller');
        if (!controller) {return { exists: false };}

        const shadowRoot = controller.shadowRoot;
        if (!shadowRoot) {return { exists: true, hasShadowRoot: false };}

        const controllerEl = shadowRoot.querySelector('#controller');
        return {
          exists: true,
          hasShadowRoot: true,
          hasControllerElement: !!controllerEl,
        };
      });

      assert.true(shadowDOMInfo.exists, 'Controller element should exist');
      assert.true(shadowDOMInfo.hasShadowRoot, 'Controller should have a shadowRoot');
      assert.true(shadowDOMInfo.hasControllerElement, '#controller element should exist inside shadowRoot');
    });
  } catch (error) {
    console.log(`  💥 Test setup failed: ${error.message}`);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log(`\n  📊 Headless E2E Results: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
