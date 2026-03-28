/**
 * Stress E2E tests for Video Speed Controller extension
 * Tests controller resilience under DOM mutations and rapid interactions
 */

import {
  launchChromeWithExtension,
  waitForExtension,
  waitForVideo,
  waitForController,
  getVideoSpeed,
  controlVideo as _controlVideo,
  sleep,
  assert,
} from './e2e-utils.js';

export default async function runStressE2ETests() {
  console.log('🎭 Running Stress E2E Tests...\n');

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
    const { browser: b, page } = await launchChromeWithExtension();
    browser = b;

    const testPagePath = `file://${process.cwd()}/tests/e2e/test-video.html`;
    await page.goto(testPagePath, { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    await runTest('Extension loads on test page', async () => {
      const loaded = await waitForExtension(page, 10000);
      assert.true(loaded, 'Extension should load');
    });

    await runTest('Controller removed when video element is removed', async () => {
      // Ensure controller is present first
      const controllerBefore = await waitForController(page, 10000);
      assert.true(controllerBefore, 'Controller should exist before removal');

      // Remove the video element from the DOM
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          video.remove();
        }
      });

      // Wait for the extension to react to the removal
      await sleep(2000);

      // Verify no .vsc-controller remains in the DOM
      const controllerAfter = await page.evaluate(() => {
        return document.querySelector('.vsc-controller') !== null;
      });
      assert.false(controllerAfter, 'Controller should be removed after video is removed');
    });

    await runTest('Video element replacement creates new controller', async () => {
      // Add a new video element to the page
      await page.evaluate(() => {
        const video = document.createElement('video');
        video.controls = true;
        video.width = 640;
        video.height = 480;
        video.loop = true;
        video.muted = true;
        video.innerHTML =
          '<source src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" type="video/mp4">' +
          '<source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">';
        document.body.appendChild(video);
      });

      // Wait for the extension to detect the new video and attach a controller
      await sleep(3000);

      const newController = await waitForController(page, 10000);
      assert.true(newController, 'New controller should appear for the replacement video');
    });

    await runTest('No console errors after controller removal', async () => {
      const consoleErrors = page.getConsoleErrors();

      // Filter for VSC-related errors
      const vscErrors = consoleErrors.filter(
        (err) =>
          err.toLowerCase().includes('vsc') ||
          err.toLowerCase().includes('videospeed') ||
          err.toLowerCase().includes('speed controller')
      );

      assert.equal(
        vscErrors.length,
        0,
        `Expected no VSC-related console errors, found ${vscErrors.length}: ${vscErrors.join('; ')}`
      );
    });

    await runTest('Rapid speed changes don\'t break controller', async () => {
      // Navigate to fresh page for a clean test
      await page.goto(testPagePath, { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      const loaded = await waitForExtension(page, 10000);
      assert.true(loaded, 'Extension should load on fresh page');
      const videoReady = await waitForVideo(page, 'video', 15000);
      assert.true(videoReady, 'Video should be ready');
      const controllerReady = await waitForController(page, 10000);
      assert.true(controllerReady, 'Controller should be ready');

      // Click the faster button 10 times rapidly using page.evaluate for speed
      const clickResults = await page.evaluate(() => {
        const controller = document.querySelector('.vsc-controller');
        if (!controller || !controller.shadowRoot) {return { clicks: 0, error: 'No controller' };}
        const button = controller.shadowRoot.querySelector('button[data-action="faster"]');
        if (!button) {return { clicks: 0, error: 'No faster button' };}
        let clicks = 0;
        for (let i = 0; i < 10; i++) {
          button.click();
          clicks++;
        }
        return { clicks, error: null };
      });
      assert.equal(clickResults.clicks, 10, 'Should have clicked 10 times');

      await sleep(1000);

      // Verify the video speed increased (controller may auto-hide but video.playbackRate persists)
      const videoSpeed = await getVideoSpeed(page);
      assert.exists(videoSpeed, 'Video playback rate should exist');
      assert.true(videoSpeed > 1.0, `Video playback rate should be > 1.0, got ${videoSpeed}`);

      // Verify speed display is accessible via shadow DOM (controller wrapper still in DOM even if hidden)
      const speedDisplay = await page.evaluate(() => {
        const controller = document.querySelector('.vsc-controller');
        if (!controller || !controller.shadowRoot) {return null;}
        const speedElement = controller.shadowRoot.querySelector('.draggable');
        return speedElement ? speedElement.textContent : null;
      });
      assert.exists(speedDisplay, 'Speed display should still show a value');
      const speedValue = parseFloat(speedDisplay);
      assert.true(!isNaN(speedValue), 'Speed display should be a valid number');
      assert.true(speedValue > 1.0, `Speed display should be > 1.0, got ${speedValue}`);
    });
  } catch (error) {
    console.log(`  💥 Test setup failed: ${error.message}`);
    failed++;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log(`\n  📊 Stress E2E Results: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
