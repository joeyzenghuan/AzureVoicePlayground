/**
 * Ctrip Break Audio — Voice Live Translator Upload Test
 *
 * Audio: break非常抱歉您入住的_20260412-011846_zh-CN-Xiaochen_DragonHDLatestNeural.wav
 *        67.45s, Chinese customer service (hotel complaint handling)
 * Method: Upload audio file (not microphone)
 * Model: gpt-4.1-mini
 * VAD: azure_semantic_vad
 * Voice: en-US-AndrewMultilingualNeural (Azure Neural)
 *
 * Reference text (TTS input):
 *   非常抱歉您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，
 *   我现在也非常理解您现在的心情，遇到这样的情况确实让人不舒服，也很影响出行的心情。
 *   但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。
 *   目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：
 *   首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；
 *   第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，
 *   并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响；
 *   第三我们会主动向酒店方面提出补偿要求，比如申请房费减免，或者升级您的房型，
 *   让您能获得一定的补偿和更好的服务。
 *   请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。
 *   我们会一直为您跟进，直到问题圆满解决。
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts ctrip-break-translator-test.test.ts
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

const AUDIO_FILE = '/Users/joey/gitrepo/OpenAI-examples/Cog/Voice-Live/live-interpreter/Ctrip-solution/audios/break非常抱歉您入住的_20260412-011846_zh-CN-Xiaochen_DragonHDLatestNeural.wav';
const AUDIO_DURATION_S = 67.45;

const REPORT_DIR = path.resolve(__dirname, 'ctrip-break-test');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

const REFERENCE_TEXT = `非常抱歉您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情，遇到这样的情况确实让人不舒服，也很影响出行的心情。但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响；第三我们会主动向酒店方面提出补偿要求，比如申请房费减免，或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。`;

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
  turnDetectionType: 'azure_semantic_vad',
  threshold: 0.5,
  prefixPaddingInMs: 300,
  silenceDurationInMs: 200,
  speechDurationInMs: 80,
  removeFillerWords: false,
  voiceProvider: 'azure-standard',
  voiceName: 'en-US-AndrewMultilingualNeural',
  inputAudioFormat: 'pcm16',
  inputAudioSamplingRate: 16000,
  outputAudioFormat: 'pcm16',
  interruptResponse: false,
};

test('ctrip-break audio upload: gpt-4.1-mini + semantic_vad + Andrew voice', async ({ page }) => {
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

  // ── Step 3: Start translation (connect) ──
  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 20000 });
  console.log('[Test] Connected');

  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-connected.png` });

  // ── Step 4: Upload audio file ──
  console.log('[Test] Uploading audio file...');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(AUDIO_FILE);

  // Wait for streaming status to appear
  await expect(page.locator('text=Streaming')).toBeVisible({ timeout: 10000 });
  console.log('[Test] Audio file streaming started');

  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-streaming.png` });

  // ── Step 5: Wait for streaming to complete ──
  // Audio is ~67s, streamed at real-time speed, plus processing buffer for final turn
  const TOTAL_WAIT_MS = Math.ceil(AUDIO_DURATION_S * 1000) + 15000;
  console.log(`[Test] Waiting ${(TOTAL_WAIT_MS / 1000).toFixed(0)}s for streaming + processing...`);

  const startTime = Date.now();
  const pollInterval = 10000;
  const polls = Math.ceil(TOTAL_WAIT_MS / pollInterval);
  for (let tick = 0; tick < polls; tick++) {
    await page.waitForTimeout(pollInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const turnsText = await page.locator('.bg-gray-50.rounded-lg.p-2\\.5').first()
      .locator('p.text-sm').textContent().catch(() => '?');
    console.log(`[Test] ${elapsed}s elapsed, turns: ${turnsText}`);
  }

  // Wait a bit more for the last response to complete
  await page.waitForTimeout(5000);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-all-turns.png`, fullPage: true });

  // ── Step 6: Expand per-turn table ──
  const turnTableBtn = page.locator('button', { hasText: 'Per-Turn Statistics' });
  if (await turnTableBtn.isVisible()) {
    await turnTableBtn.click();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 }).catch(() => {
      console.log('[Test] Per-turn table did not expand, clicking again...');
      return turnTableBtn.click();
    });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-turn-table.png`, fullPage: true });

  // ── Step 7: Collect all metrics from page ──
  const metrics = await page.evaluate(() => {
    const statBlocks = document.querySelectorAll('.bg-gray-50.rounded-lg.p-2\\.5');
    const stats: Record<string, string> = {};
    statBlocks.forEach((block) => {
      const label = block.querySelector('.text-xs')?.textContent?.trim() ?? '';
      const value = block.querySelector('.text-sm')?.textContent?.trim() ?? '';
      if (label) stats[label] = value;
    });

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

  // ── Step 10: Stop translation ──
  const stopBtn = page.locator('button:has-text("Stop")');
  if (await stopBtn.isVisible()) {
    await stopBtn.click();
    console.log('[Test] Stopped translation');
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-final.png`, fullPage: true });

  // ── Step 11: Generate report ──
  const report = buildReport(metrics, conversationLogs);
  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), report, 'utf-8');
  fs.writeFileSync(
    path.join(REPORT_DIR, 'metrics.json'),
    JSON.stringify({ config: TEST_CONFIG, metrics, conversationLogs, referenceText: REFERENCE_TEXT }, null, 2),
    'utf-8',
  );

  console.log(`[Test] Report saved to ${REPORT_DIR}/report.md`);
  console.log(`[Test] Per-turn rows collected: ${metrics.turns.length}`);

  // Print conversation summary to console
  console.log('\n═══════════════════════════════════════');
  console.log('  CONVERSATION SUMMARY');
  console.log('═══════════════════════════════════════');
  for (const log of conversationLogs) {
    const icon = log.text.startsWith('🎤') ? '🎤 INPUT ' : log.text.startsWith('🔊') ? '🔊 OUTPUT' : '   INFO  ';
    console.log(`${log.timestamp} ${icon} ${log.text}`);
  }
  console.log('═══════════════════════════════════════\n');

  // Print reference text for comparison
  console.log('REFERENCE TEXT (TTS input):');
  console.log(REFERENCE_TEXT);
  console.log('');

  // Concatenate all ASR inputs
  const asrInputs = metrics.turns.map(t => t.inputASR).filter(Boolean).join('');
  console.log('ASR RECOGNIZED TEXT (concatenated):');
  console.log(asrInputs);
  console.log('');

  // Concatenate all translation outputs
  const translationOutputs = metrics.turns.map(t => t.outputTranslation).filter(Boolean).join(' ');
  console.log('TRANSLATION OUTPUT (concatenated):');
  console.log(translationOutputs);
  console.log('');

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

  let md = `# Voice Live Translator — Ctrip Break Audio Upload Test Report

**Generated:** ${now}

---

## Test Setup

| Parameter | Value |
|-----------|-------|
| Audio File | break非常抱歉您入住的_..._zh-CN-Xiaochen_DragonHDLatestNeural.wav (67.45s) |
| Method | Upload audio file (simulating microphone input) |
| Model | gpt-4.1-mini (Voice Live Basic / standard pricing) |
| VAD Type | azure_semantic_vad |
| VAD Threshold | 0.5 |
| Prefix Padding | 300 ms |
| Silence Duration | 200 ms |
| Speech Duration | 80 ms |
| Voice Provider | Azure Neural |
| Voice Name | en-US-AndrewMultilingualNeural (Andrew, Male, conversational) |
| ASR Model | azure-speech |
| ASR Languages | zh, en |
| Target Language | English |
| Input Audio Format | pcm16 @ 16 kHz |
| Output Audio Format | pcm16 @ 24 kHz |

---

## Reference Text (TTS Input)

${REFERENCE_TEXT}

---

## Summary Statistics

| Metric | Value |
|--------|-------|
`;

  for (const [key, value] of Object.entries(metrics.stats)) {
    md += `| ${key} | **${value}** |\n`;
  }

  // Per-Turn Table
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

  // ASR vs Reference comparison
  const asrInputs = metrics.turns.map(t => t.inputASR).filter(Boolean).join('');
  md += `\n---\n\n## ASR Recognition vs Reference\n\n`;
  md += `### ASR Recognized Text (concatenated)\n\n${asrInputs || '_No ASR text captured_'}\n\n`;
  md += `### Reference Text\n\n${REFERENCE_TEXT}\n\n`;

  // Translation output
  const translationOutputs = metrics.turns.map(t => t.outputTranslation).filter(Boolean).join(' ');
  md += `\n---\n\n## Full Translation Output\n\n${translationOutputs || '_No translation captured_'}\n\n`;

  // Conversation Log
  md += `\n---\n\n## Conversation Log\n\n`;

  if (conversationLogs.length > 0) {
    md += `| # | Timestamp | Content |\n`;
    md += `|--:|-----------|----------|\n`;
    let idx = 1;
    for (const log of conversationLogs) {
      md += `| ${idx++} | ${log.timestamp} | ${esc(log.text)} |\n`;
    }
  } else {
    md += `_No conversation entries captured._\n`;
  }

  // Config JSON
  md += `\n---\n\n## Full Configuration\n\n`;
  md += '```json\n';
  md += JSON.stringify(TEST_CONFIG, null, 2);
  md += '\n```\n';

  return md;
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
