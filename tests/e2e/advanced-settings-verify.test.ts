import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5199';
const SCREENSHOT_DIR = 'tests/e2e/screenshots/advanced-settings';

test('Advanced Settings - all categories', async ({ page }) => {
  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(1000);

  // The right sidebar config panel
  const panel = page.locator('.md\\:w-80');

  // Open Advanced Settings
  await panel.locator('button:has-text("Advanced Settings")').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-advanced-open.png` });

  // Open Model Parameters
  await panel.locator('button:has-text("Model Parameters")').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-model-params.png` });

  // Open ASR & Recognition
  await panel.locator('button:has-text("ASR & Recognition")').click();
  await page.waitForTimeout(300);
  await panel.evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-asr.png` });

  // Open Turn Detection (VAD)
  await panel.locator('button:has-text("Turn Detection")').click();
  await page.waitForTimeout(300);
  await panel.evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-vad.png` });

  // Open Voice section (use the settings group button, not sidebar nav)
  await panel.locator('button:has-text("VOICE")').click();
  await page.waitForTimeout(300);
  await panel.evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-voice.png` });

  // Open Audio Format
  await panel.locator('button:has-text("Audio Format")').click();
  await page.waitForTimeout(300);
  await panel.evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-audio-format.png` });

  // Test info tooltip - hover on Temperature info icon
  await panel.evaluate(el => el.scrollTop = 0);
  await page.waitForTimeout(200);
  await panel.locator('button:has-text("Model Parameters")').scrollIntoViewIfNeeded();
  const tempLabel = panel.locator('text=Temperature').first();
  const tempInfo = tempLabel.locator('..').locator('button').first();
  await tempInfo.hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-tooltip.png` });

  console.log('[Test] All sections verified');
});
