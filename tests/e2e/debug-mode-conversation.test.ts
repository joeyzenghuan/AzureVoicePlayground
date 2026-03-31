/**
 * E2E conversation test for Voice Live Translator Debug Mode
 * Uses real audio input via Chromium's fake audio capture with a pre-generated WAV file.
 *
 * Prerequisites:
 *   1. npm install --save-dev @playwright/test
 *   2. npx vite dev --port 5199
 *   3. Generate the test audio file (requires macOS `say` + `sox`):
 *        say -o /tmp/speech1.aiff "Hello, can you hear me? I'm testing the voice translator."
 *        say -o /tmp/speech2.aiff "The weather today is very nice. I would like to go for a walk in the park."
 *        sox /tmp/speech1.aiff -r 16000 -c 1 -b 16 -e signed-integer /tmp/speech1.wav
 *        sox /tmp/speech2.aiff -r 16000 -c 1 -b 16 -e signed-integer /tmp/speech2.wav
 *        sox -n -r 16000 -c 1 -b 16 -e signed-integer /tmp/silence5s.wav trim 0.0 5.0
 *        sox /tmp/speech1.wav /tmp/silence5s.wav /tmp/speech2.wav /tmp/silence5s.wav /tmp/combined_speech.wav
 *        sox /tmp/combined_speech.wav -r 48000 -c 1 -b 16 /tmp/combined_speech_48k.wav
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts debug-mode-conversation.test.ts
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5199';
const ENDPOINT = process.env.VOICE_LIVE_ENDPOINT ?? '';
const API_KEY = process.env.VOICE_LIVE_API_KEY ?? '';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/conversation-tests';

// Override browser launch to use the real audio file as fake mic input
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

test('Voice Live Translator - Real conversation with 2 turns of audio input', async ({ page }) => {
  // --- Step 1: Set credentials ---
  await page.goto(BASE_URL);
  await page.evaluate(
    ({ endpoint, apiKey }) => {
      localStorage.setItem(
        'azure-voice-live-settings',
        JSON.stringify({ endpoint, apiKey })
      );
      const existing = localStorage.getItem('azure-tts-settings');
      const settings = existing ? JSON.parse(existing) : {};
      settings.voiceLiveEndpoint = endpoint;
      settings.voiceLiveApiKey = apiKey;
      localStorage.setItem('azure-tts-settings', JSON.stringify(settings));
    },
    { endpoint: ENDPOINT, apiKey: API_KEY }
  );

  // --- Step 2: Navigate to Voice Live Translator ---
  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(1500);
  await expect(page.locator('h1:has-text("Voice Live Translator")')).toBeVisible();

  // --- Step 3: Enable Debug Mode ---
  const debugBtn = page.locator('button:has-text("Debug OFF")');
  await debugBtn.click();
  await expect(page.locator('button:has-text("Debug ON")')).toBeVisible();
  console.log('[Test] Debug mode enabled');

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-01-before-connect.png` });

  // --- Step 4: Start translation (connect + mic) ---
  const startBtn = page.locator('button:has-text("Start Translation")');
  await expect(startBtn).toBeEnabled();
  await startBtn.click();
  console.log('[Test] Clicked Start Translation');

  // Wait for connection
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=Microphone active')).toBeVisible({ timeout: 10000 });
  console.log('[Test] Connected and microphone active');

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-02-connected.png` });

  // --- Step 5: Wait for first speech segment to be processed ---
  // The combined audio file has: ~2.7s speech1 + 5s silence + ~4.5s speech2 + 5s silence
  console.log('[Test] Waiting for first speech turn to be recognized...');

  // Wait for at least one INPUT (transcription) to appear
  await expect(page.locator('.bg-gray-900 >> text=/INPUT|Conversation/')).toBeVisible({ timeout: 20000 });
  console.log('[Test] First transcription detected');
  await page.waitForTimeout(3000); // Give time for translation response

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-03-first-turn.png` });

  // --- Step 6: Wait for second speech segment ---
  console.log('[Test] Waiting for second speech turn...');
  await page.waitForTimeout(12000); // Wait for second speech + processing

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-04-second-turn.png` });

  // --- Step 7: Check statistics ---
  const turnsText = await page.locator('.bg-gray-50.rounded-lg.p-2\\.5').first().locator('p.text-sm').textContent();
  console.log(`[Test] Turns count: ${turnsText}`);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-05-stats.png` });

  // --- Step 8: Examine debug logs in detail ---
  const logEntries = page.locator('.bg-gray-900 .group');
  const totalLogs = await logEntries.count();
  console.log(`[Test] Total debug log entries: ${totalLogs}`);

  // Look for specific category badges
  const categories = ['Session', 'Client Events', 'Server Events', 'VAD', 'ASR', 'Latency', 'Token Usage', 'Cost', 'Conversation'];
  for (const cat of categories) {
    const badges = page.locator(`.bg-gray-900 span:has-text("${cat}")`);
    const count = await badges.count();
    if (count > 0) {
      console.log(`[Test] Found ${count} "${cat}" entries`);
    }
  }

  // --- Step 9: Try expanding detail entries ---
  const expandable = page.locator('.bg-gray-900 .group svg.w-4');
  const expandableCount = await expandable.count();
  console.log(`[Test] Found ${expandableCount} expandable entries`);

  if (expandableCount > 0) {
    const firstExpandableRow = expandable.first().locator('xpath=ancestor::div[contains(@class,"group")]').first();
    const clickTarget = firstExpandableRow.locator('div').first();
    await clickTarget.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-06-expanded-detail.png` });
    console.log('[Test] Expanded first detail entry');

    for (let i = 1; i < Math.min(expandableCount, 4); i++) {
      const row = expandable.nth(i).locator('xpath=ancestor::div[contains(@class,"group")]').first();
      await row.locator('div').first().click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-07-multiple-expanded.png` });
    console.log('[Test] Expanded multiple detail entries');
  }

  // --- Step 10: Test category filtering - Token Usage + Cost + Latency only ---
  await page.locator('button:has-text("None")').click();
  await page.waitForTimeout(300);

  await page.locator('.flex.flex-wrap button', { hasText: 'Token Usage' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Cost' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Latency' }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-08-metrics-filter.png` });

  const metricsLogs = page.locator('.bg-gray-900 .group');
  const metricsCount = await metricsLogs.count();
  console.log(`[Test] Token/Cost/Latency filtered entries: ${metricsCount}`);

  // --- Step 11: Switch to conversation-only view ---
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Conversation' }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-09-conversation-only.png` });

  const convLogs = page.locator('.bg-gray-900 .group');
  const convCount = await convLogs.count();
  console.log(`[Test] Conversation-only entries: ${convCount}`);

  // --- Step 12: Switch to non-debug mode to see clean conversation ---
  await page.locator('button:has-text("Debug ON")').click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-10-clean-conversation.png` });

  // --- Step 13: Stop translation ---
  const stopBtn = page.locator('button:has-text("Stop")');
  if (await stopBtn.isVisible()) {
    await stopBtn.click();
    console.log('[Test] Clicked Stop');
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/conv-test-11-final.png` });

  // --- Assertions ---
  expect(totalLogs).toBeGreaterThan(0);
  console.log('[Test] All checks passed!');
});
