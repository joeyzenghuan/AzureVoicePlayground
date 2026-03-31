/**
 * Quick verification test - expand latency & cost details and screenshot
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5199';
const ENDPOINT = process.env.VOICE_LIVE_ENDPOINT ?? '';
const API_KEY = process.env.VOICE_LIVE_API_KEY ?? '';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/detail-verify';

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=/tmp/combined_speech_48k.wav',
      '--allow-file-access',
    ],
  },
});

test('Verify latency & cost expanded details', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(
    ({ endpoint, apiKey }) => {
      localStorage.setItem('azure-voice-live-settings', JSON.stringify({ endpoint, apiKey }));
      const s = JSON.parse(localStorage.getItem('azure-tts-settings') || '{}');
      s.voiceLiveEndpoint = endpoint;
      s.voiceLiveApiKey = apiKey;
      localStorage.setItem('azure-tts-settings', JSON.stringify(s));
    },
    { endpoint: ENDPOINT, apiKey: API_KEY }
  );

  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(1500);

  // Enable debug mode
  await page.locator('button:has-text("Debug OFF")').click();

  // Connect and wait for 2 turns
  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 15000 });
  console.log('[Test] Connected, waiting for 2 turns...');
  await page.waitForTimeout(20000);

  // Filter to Latency + Cost + Token Usage only
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Latency' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Cost' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Token Usage' }).click();
  // Also show server events to see highlights
  await page.locator('.flex.flex-wrap button', { hasText: 'Server Events' }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-filtered.png` });

  // Now filter to only Latency + Cost + Token Usage and expand all
  await page.locator('.flex.flex-wrap button', { hasText: 'Server Events' }).click();
  await page.waitForTimeout(300);

  // Expand all visible entries
  const expandIcons = page.locator('.bg-gray-900 .group svg.w-4');
  const count = await expandIcons.count();
  console.log(`[Test] Found ${count} expandable entries`);
  for (let i = 0; i < count; i++) {
    const row = expandIcons.nth(i).locator('xpath=ancestor::div[contains(@class,"group")]').first();
    await row.locator('div').first().click();
    await page.waitForTimeout(200);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-all-expanded.png` });

  // Scroll to see the latency detail for Turn 1
  const logPanel = page.locator('.bg-gray-900.rounded-lg');
  await logPanel.evaluate(el => el.scrollTop = 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-latency-detail-top.png` });

  // Scroll down to see cost detail
  await logPanel.evaluate(el => el.scrollTop = el.scrollHeight / 2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-cost-detail-mid.png` });

  // Scroll to bottom
  await logPanel.evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-detail-bottom.png` });

  // Now show ALL categories and scroll to see highlights
  await page.locator('button:has-text("All")').click();
  await page.waitForTimeout(500);

  // Find and scroll to the highlighted entries
  const highlights = page.locator('.bg-gray-900 .border-amber-500\\/30');
  const hlCount = await highlights.count();
  console.log(`[Test] Found ${hlCount} highlighted entries`);

  if (hlCount > 0) {
    await highlights.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-highlight-first-audio.png` });
  }

  // Stop
  await page.locator('button:has-text("Stop")').click();
  await page.waitForTimeout(1000);

  console.log('[Test] Done');
});
