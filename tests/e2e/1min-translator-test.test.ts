/**
 * 1-Minute Voice Live Translator Performance Test
 *
 * Audio: xiecheng-finance.wav (60.14s, Chinese finance content)
 * Model: gpt-4.1-mini
 * VAD: server_vad (threshold 0.5, prefix 500ms, silence 300ms)
 * Voice: Andrew (en-US-AndrewMultilingualNeural, Azure Neural)
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts 1min-translator-test.test.ts
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const BASE_URL = 'http://localhost:5173/AzureVoicePlayground';
const ENDPOINT = process.env.VOICE_LIVE_ENDPOINT ?? '';
const API_KEY = process.env.VOICE_LIVE_API_KEY ?? '';
const REPORT_DIR = path.resolve(__dirname, '1min-test');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

const TEST_CONFIG = {
  model: 'gpt-4.1-mini',
  targetLanguage: 'en',
  prompt: [
    'You are a simultaneous interpreter.',
    'Target language: en.',
    '',
    'Rules:',
    '1) Translate sentence by sentence (output each sentence as it completes).',
    '2) Keep context consistent across turns (pronouns, terms, tone, references).',
    '3) Preserve meaning faithfully; do not add explanations or extra content.',
    '4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.',
    '5) Output translation text only.',
  ].join('\n'),
  asrModel: 'azure-speech',
  asrLanguages: 'zh,en',
  turnDetectionType: 'server_vad',
  threshold: 0.5,
  prefixPaddingInMs: 500,
  silenceDurationInMs: 300,
  voiceProvider: 'azure-standard',
  voiceName: 'en-US-AndrewMultilingualNeural',
  inputAudioFormat: 'pcm16',
  inputAudioSamplingRate: 16000,
  outputAudioFormat: 'pcm16',
  interruptResponse: false,
  removeFillerWords: false,
  speechDurationInMs: 80,
};

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=/tmp/xiecheng-finance-48k.wav',
      '--allow-file-access',
    ],
  },
});

test('1min xiecheng-finance: gpt-4.1-mini + server_vad + Andrew voice', async ({ page }) => {
  test.setTimeout(300000); // 5 min timeout

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // ── Step 1: Set credentials & config ──
  await page.goto(BASE_URL);
  await page.evaluate(
    ({ endpoint, apiKey, config }) => {
      localStorage.setItem('azure-voice-live-settings', JSON.stringify({ endpoint, apiKey }));
      const s = JSON.parse(localStorage.getItem('azure-tts-settings') || '{}');
      s.voiceLiveEndpoint = endpoint;
      s.voiceLiveApiKey = apiKey;
      localStorage.setItem('azure-tts-settings', JSON.stringify(s));
      localStorage.setItem('voicelive.translator.config', JSON.stringify(config));
    },
    { endpoint: ENDPOINT, apiKey: API_KEY, config: TEST_CONFIG },
  );

  // ── Step 2: Navigate & enable debug ──
  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(2000);

  const debugBtn = page.locator('button:has-text("Debug OFF")');
  if (await debugBtn.isVisible()) {
    await debugBtn.click();
    await expect(page.locator('button:has-text("Debug ON")')).toBeVisible();
  }
  console.log('[Test] Debug mode enabled');

  // ── Step 3: Start translation ──
  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 20000 });
  console.log('[Test] Connected');

  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-connected.png` });

  // ── Step 4: Wait for first speech turn ──
  console.log('[Test] Waiting for first speech recognition...');
  const firstTurnLocator = page.locator('.bg-gray-900.rounded-lg .group');
  await expect(firstTurnLocator.first()).toBeVisible({ timeout: 30000 });

  // Wait for conversation entries
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-first-turn.png` });

  // ── Step 5: Wait for full audio (~60s) + processing buffer ──
  // Chromium's fake audio capture loops the file, so we wait a fixed duration
  // matching one full playback (60s) plus extra time for the last turn to finish.
  const AUDIO_DURATION_MS = 61_000; // 60.14s audio
  const PROCESSING_BUFFER_MS = 9_000; // extra time for final response (keep short to avoid loop)
  const TOTAL_WAIT = AUDIO_DURATION_MS + PROCESSING_BUFFER_MS;
  console.log(`[Test] Waiting ${TOTAL_WAIT / 1000}s for one full audio pass + processing...`);

  // Poll every 10s just for progress logging
  const startTime = Date.now();
  const pollInterval = 10_000;
  const polls = Math.ceil(TOTAL_WAIT / pollInterval);
  for (let tick = 0; tick < polls; tick++) {
    await page.waitForTimeout(pollInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const turnsText = await page.locator('.bg-gray-50.rounded-lg.p-2\\.5').first()
      .locator('p.text-sm').textContent();
    console.log(`[Test] ${elapsed}s elapsed, turns: ${turnsText}`);
  }
  // ── Step 5b: Stop translation immediately to prevent audio loop ──
  const stopBtn = page.locator('button:has-text("Stop")');
  if (await stopBtn.isVisible()) {
    await stopBtn.click();
    console.log('[Test] Stopped translation');
    await page.waitForTimeout(3000); // let final responses settle
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-all-turns.png`, fullPage: true });

  // ── Step 6: Expand per-turn table ──
  const turnTableBtn = page.locator('button', { hasText: 'Per-Turn Statistics' });
  if (await turnTableBtn.isVisible()) {
    await turnTableBtn.click();
    // Wait for table to actually render
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('[Test] Per-turn table did not expand, clicking again...');
      return turnTableBtn.click();
    });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-turn-table.png`, fullPage: true });

  // ── Step 7: Collect all metrics from page ──
  const metrics = await page.evaluate(() => {
    // Summary stats bar
    const statBlocks = document.querySelectorAll('.bg-gray-50.rounded-lg.p-2\\.5');
    const stats: Record<string, string> = {};
    statBlocks.forEach((block) => {
      const label = block.querySelector('.text-xs')?.textContent?.trim() ?? '';
      const value = block.querySelector('.text-sm')?.textContent?.trim() ?? '';
      if (label) stats[label] = value;
    });

    // Per-turn table rows
    const turnRows = document.querySelectorAll('table tbody tr');
    const turns: Array<Record<string, string>> = [];
    turnRows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 13) {
        turns.push({
          turn: cells[0].textContent?.trim() ?? '',
          duration: cells[1].textContent?.trim() ?? '',
          e2eLatency: cells[2].textContent?.trim() ?? '',
          inputASR: cells[3].textContent?.trim() ?? '',
          outputTranslation: cells[4].textContent?.trim() ?? '',
          inputTextTokens: cells[5].textContent?.trim() ?? '',
          cachedTextTokens: cells[6].textContent?.trim() ?? '',
          inputAudioTokens: cells[7].textContent?.trim() ?? '',
          cachedAudioTokens: cells[8].textContent?.trim() ?? '',
          outputTextTokens: cells[9].textContent?.trim() ?? '',
          outputAudioTokens: cells[10].textContent?.trim() ?? '',
          totalTokens: cells[11].textContent?.trim() ?? '',
          cost: cells[12].textContent?.trim() ?? '',
        });
      }
    });

    // Totals row
    const footerRow = document.querySelector('table tfoot tr');
    const fc = footerRow?.querySelectorAll('td');
    const totals: Record<string, string> = {};
    if (fc && fc.length >= 13) {
      totals.duration = fc[1].textContent?.trim() ?? '';
      totals.avgE2eLatency = fc[2].textContent?.trim() ?? '';
      totals.inputTextTokens = fc[5].textContent?.trim() ?? '';
      totals.cachedTextTokens = fc[6].textContent?.trim() ?? '';
      totals.inputAudioTokens = fc[7].textContent?.trim() ?? '';
      totals.cachedAudioTokens = fc[8].textContent?.trim() ?? '';
      totals.outputTextTokens = fc[9].textContent?.trim() ?? '';
      totals.outputAudioTokens = fc[10].textContent?.trim() ?? '';
      totals.totalTokens = fc[11].textContent?.trim() ?? '';
      totals.totalCost = fc[12].textContent?.trim() ?? '';
    }

    return { stats, turns, totals };
  });

  console.log('[Test] Summary stats:', JSON.stringify(metrics.stats));
  console.log(`[Test] Collected ${metrics.turns.length} turns`);

  // ── Step 8: Capture conversation-only view ──
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Conversation' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-conversation.png`, fullPage: true });

  const conversationLogs = await page.evaluate(() => {
    const entries = document.querySelectorAll('.bg-gray-900.rounded-lg .group');
    const logs: Array<{ timestamp: string; category: string; text: string }> = [];
    entries.forEach((entry) => {
      const ts = entry.querySelector('.tabular-nums')?.textContent?.trim() ?? '';
      const badge = entry.querySelector('span.inline-flex.items-center.px-1\\.5')?.textContent?.trim() ?? '';
      const text = entry.querySelector('.break-all')?.textContent?.trim() ?? '';
      if (ts && text) logs.push({ timestamp: ts, category: badge, text });
    });
    return logs;
  });

  // ── Step 9: Metrics-only view (Latency + Cost + Token Usage) ──
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Latency' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Cost' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Token Usage' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-metrics.png`, fullPage: true });

  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-final.png`, fullPage: true });

  // ── Step 10: Generate report ──
  const report = buildReport(metrics, conversationLogs);
  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), report, 'utf-8');
  fs.writeFileSync(
    path.join(REPORT_DIR, 'metrics.json'),
    JSON.stringify({ config: TEST_CONFIG, metrics, conversationLogs }, null, 2),
    'utf-8',
  );

  console.log(`[Test] Report saved to ${REPORT_DIR}/report.md`);
  console.log(`[Test] Per-turn rows collected: ${metrics.turns.length}`);
  // Summary stats are the critical output; per-turn table is best-effort
  expect(Object.keys(metrics.stats).length).toBeGreaterThan(0);
});


function buildReport(
  metrics: {
    stats: Record<string, string>;
    turns: Array<Record<string, string>>;
    totals: Record<string, string>;
  },
  conversationLogs: Array<{ timestamp: string; category: string; text: string }>,
): string {
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');

  let md = `# Voice Live Translator — 1-Minute Performance Test Report

**Generated:** ${now}

---

## Test Setup

| Parameter | Value |
|-----------|-------|
| Audio File | xiecheng-finance.wav (60.14 s, Chinese finance news) |
| Model | gpt-4.1-mini (Voice Live Basic / standard pricing) |
| VAD Type | server_vad |
| VAD Threshold | 0.5 |
| Prefix Padding | 500 ms |
| Silence Duration | 300 ms |
| Voice Provider | Azure Neural |
| Voice Name | en-US-AndrewMultilingualNeural (Andrew, Male, conversational) |
| ASR Model | azure-speech |
| ASR Languages | zh, en |
| Target Language | English |
| Input Audio Format | pcm16 @ 16 kHz |
| Output Audio Format | pcm16 @ 24 kHz |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
`;

  for (const [key, value] of Object.entries(metrics.stats)) {
    md += `| ${key} | **${value}** |\n`;
  }

  // ── Per-Turn Table ──
  md += `\n---\n\n## Per-Turn Breakdown\n\n`;
  md += `| # | Duration | E2E Latency | Input (ASR) | Output (Translation) | In Text | Cached Text | In Audio | Cached Audio | Out Text | Out Audio | Total Tokens | Cost |\n`;
  md += `|--:|--------:|-----------:|-------------|----------------------|--------:|------------:|---------:|-------------:|---------:|----------:|-------------:|-----:|\n`;

  for (const t of metrics.turns) {
    md += `| ${t.turn} | ${t.duration} | ${t.e2eLatency} | ${esc(t.inputASR)} | ${esc(t.outputTranslation)} | ${t.inputTextTokens} | ${t.cachedTextTokens} | ${t.inputAudioTokens} | ${t.cachedAudioTokens} | ${t.outputTextTokens} | ${t.outputAudioTokens} | ${t.totalTokens} | ${t.cost} |\n`;
  }

  if (Object.keys(metrics.totals).length > 0) {
    const t = metrics.totals;
    md += `| **Avg/Total** | ${t.duration} | ${t.avgE2eLatency} | | | ${t.inputTextTokens} | ${t.cachedTextTokens} | ${t.inputAudioTokens} | ${t.cachedAudioTokens} | ${t.outputTextTokens} | ${t.outputAudioTokens} | ${t.totalTokens} | ${t.totalCost} |\n`;
  }

  // ── Conversation Log ──
  md += `\n---\n\n## Conversation Log\n\n`;

  const inputs = conversationLogs.filter((l) => l.text.startsWith('[') || l.category === 'Conversation');
  if (inputs.length > 0) {
    md += `| # | Timestamp | Direction | Content |\n`;
    md += `|--:|-----------|-----------|----------|\n`;
    let idx = 1;
    for (const log of conversationLogs) {
      const dir = log.text.match(/^(INPUT|OUTPUT|USER)/)?.[0] ?? 'INFO';
      md += `| ${idx++} | ${log.timestamp} | ${dir} | ${esc(log.text)} |\n`;
    }
  } else {
    md += `_No conversation entries captured._\n`;
  }

  // ── Config JSON ──
  md += `\n---\n\n## Full Configuration\n\n`;
  md += '```json\n';
  md += JSON.stringify(TEST_CONFIG, null, 2);
  md += '\n```\n';

  return md;
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
