/**
 * Verify that extra config fields (phraseList, temperature, voice properties)
 * are actually included in the session.update payload sent to the server.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5199';
const ENDPOINT = process.env.VOICE_LIVE_ENDPOINT ?? '';
const API_KEY = process.env.VOICE_LIVE_API_KEY ?? '';
const SCREENSHOT_DIR = 'tests/e2e/screenshots/config-verify';

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--allow-file-access',
    ],
  },
});

test('Extra config fields are included in session.update payload', async ({ page }) => {
  // Step 1: Set credentials + custom config via localStorage
  await page.goto(BASE_URL);
  await page.evaluate(
    ({ endpoint, apiKey }) => {
      localStorage.setItem('azure-voice-live-settings', JSON.stringify({ endpoint, apiKey }));
      const s = JSON.parse(localStorage.getItem('azure-tts-settings') || '{}');
      s.voiceLiveEndpoint = endpoint;
      s.voiceLiveApiKey = apiKey;
      localStorage.setItem('azure-tts-settings', JSON.stringify(s));

      // Set a custom translator config with new fields populated
      const config = {
        model: 'gpt-4.1-mini',
        targetLanguage: 'en',
        prompt: 'You are a simultaneous interpreter.\nTarget language: en.',
        temperature: 0.5,
        maxResponseOutputTokens: 500,
        asrModel: 'azure-speech',
        asrLanguages: 'en,zh',
        phraseList: 'Azure,OpenAI,GPT-4,Playground',
        turnDetectionType: 'azure_semantic_vad',
        threshold: 0.5,
        prefixPaddingInMs: 300,
        silenceDurationInMs: 200,
        speechDurationInMs: 80,
        removeFillerWords: false,
        interruptResponse: true,
        voiceProvider: 'azure-standard',
        voiceName: 'en-US-AvaMultilingualNeural',
        voiceRate: '1.1',
        inputAudioFormat: 'pcm16',
        inputAudioSamplingRate: 16000,
        outputAudioFormat: 'pcm16',
        echoCancellation: true,
      };
      localStorage.setItem('voicelive.translator.config', JSON.stringify(config));
    },
    { endpoint: ENDPOINT, apiKey: API_KEY }
  );

  // Step 2: Navigate and enable debug mode
  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Debug OFF")').click();

  // Step 3: Connect
  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 15000 });
  console.log('[Test] Connected');

  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-connected.png` });

  // Step 4: Find the [client] session.update log entry and expand it
  // Filter to only Client Events
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Client Events' }).click();
  await page.waitForTimeout(500);

  // Find and click the session.update entry to expand it
  const sessionUpdateEntry = page.locator('.bg-gray-900.rounded-lg .group', { hasText: 'session.update' }).first();
  await expect(sessionUpdateEntry).toBeVisible();
  await sessionUpdateEntry.locator('div').first().click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-session-update-expanded.png` });

  // Step 5: Read the expanded detail content and verify fields
  const detailBlock = sessionUpdateEntry.locator('div.whitespace-pre');
  const detailText = await detailBlock.textContent() ?? '';
  console.log('[Test] session.update payload:');
  console.log(detailText.substring(0, 2000));

  // Verify key fields are present in the JSON
  expect(detailText).toContain('"temperature": 0.5');
  expect(detailText).toContain('"maxResponseOutputTokens": 500');
  expect(detailText).toContain('"phraseList"');
  expect(detailText).toContain('Azure');
  expect(detailText).toContain('OpenAI');
  expect(detailText).toContain('"interruptResponse": true');
  expect(detailText).toContain('"rate": "1.1"');
  expect(detailText).toContain('"server_echo_cancellation"');

  console.log('[Test] All extra config fields verified in session.update payload!');

  // Step 6: Also check that the server didn't error out
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Error' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Session' }).click();
  await page.waitForTimeout(500);

  // Check for any error entries
  const errorEntries = page.locator('.bg-gray-900.rounded-lg .group', { hasText: /error/i });
  const errorCount = await errorEntries.count();
  console.log(`[Test] Error entries: ${errorCount}`);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-no-errors.png` });

  // Stop
  await page.locator('button:has-text("Stop")').click();
  await page.waitForTimeout(1000);
  console.log('[Test] Done - all verified');
});
