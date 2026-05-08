/**
 * Ctrip Break7 Audio — gpt-4.1 + semantic_vad silence=350ms
 *
 * Audio: break7非常抱歉您入住的_20260412-114643_zh-CN-Xiaochen_DragonHDLatestNeural.wav
 *        61.05s, Chinese customer service with <break time='500-700ms'/> pauses
 * Model: gpt-4.1 (Voice Live Pro)
 * VAD: azure_semantic_vad (silence=350ms, speech=80ms, prefix=400ms)
 *
 * Reference text (TTS input) — 12 sentences with 500-700ms breaks:
 *   1. 非常抱歉您入住的酒店没有达到您的预期。<500ms>
 *   2. 我现在非常理解您现在的心情。<500ms>
 *   3. 遇到这样的情况确实很影响出行的心情。<500ms>
 *   4. 但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。<500ms>
 *   5. 目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：<500ms>
 *   6. 首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；<500ms>
 *   7. 如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，<600ms>
 *   8. 我们会为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响.<700ms>
 *   9. 最后一个方案是我们向酒店方面提出补偿要求，比如申请房费减免或升级您的房型。<600ms>
 *  10. 请您考虑一下，看看哪个方案更符合您的需求。<500ms>
 *  11. 或者如果您有其他想法，也可以随时告诉我们。<500ms>
 *  12. 我们会一直为您跟进，直到问题圆满解决。
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts ctrip-break7-gpt41.test.ts
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

const AUDIO_FILE = '/Users/joey/gitrepo/OpenAI-examples/Cog/Voice-Live/live-interpreter/Ctrip-solution/audios/break7非常抱歉您入住的_20260412-114643_zh-CN-Xiaochen_DragonHDLatestNeural.wav';
const AUDIO_DURATION_S = 61.05;

const REPORT_DIR = path.resolve(__dirname, 'ctrip-break7-gpt41');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

const REFERENCE_TEXT = `非常抱歉您入住的酒店没有达到您的预期。我现在非常理解您现在的心情。遇到这样的情况确实很影响出行的心情。但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，我们会为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响.最后一个方案是我们向酒店方面提出补偿要求，比如申请房费减免或升级您的房型。请您考虑一下，看看哪个方案更符合您的需求。或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。`;

const REFERENCE_SENTENCES = [
  '非常抱歉您入住的酒店没有达到您的预期。',
  '我现在非常理解您现在的心情。',
  '遇到这样的情况确实很影响出行的心情。',
  '但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。',
  '目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：',
  '首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；',
  '如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，',
  '我们会为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响.',
  '最后一个方案是我们向酒店方面提出补偿要求，比如申请房费减免或升级您的房型。',
  '请您考虑一下，看看哪个方案更符合您的需求。',
  '或者如果您有其他想法，也可以随时告诉我们。',
  '我们会一直为您跟进，直到问题圆满解决。',
];

const PROMPT = `You are a simultaneous interpreter.
You will translate Chinese to English, and translate English to Chinese.

Rules:
0) Don't answer any question, just translate anything input.
1) Translate sentence by sentence (output each sentence as it completes).
2) Keep context consistent across turns (pronouns, terms, tone, references).
3) Preserve meaning faithfully; do not add explanations or extra content.
4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.
5) Output translation text only.`;

const TEST_CONFIG = {
  model: 'gpt-4.1',
  targetLanguage: 'en',
  prompt: PROMPT,
  asrModel: 'azure-speech',
  asrLanguages: 'zh,en',
  turnDetectionType: 'azure_semantic_vad',
  threshold: 0.5,
  prefixPaddingInMs: 400,
  silenceDurationInMs: 350,
  speechDurationInMs: 80,
  removeFillerWords: false,
  vadLanguages: 'zh,Chinese',
  voiceProvider: 'azure-standard',
  voiceName: 'en-US-AndrewMultilingualNeural',
  inputAudioFormat: 'pcm16',
  inputAudioSamplingRate: 16000,
  outputAudioFormat: 'pcm16',
  interruptResponse: false,
};

test('ctrip-break7: gpt-4.1 + semantic_vad silence=350ms', async ({ page }) => {
  test.setTimeout(300000);

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

  // ── Step 3: Connect ──
  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 20000 });
  console.log('[Test] Connected');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-connected.png` });

  // ── Step 4: Upload audio file ──
  console.log('[Test] Uploading audio file...');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(AUDIO_FILE);
  await expect(page.locator('text=Streaming')).toBeVisible({ timeout: 10000 });
  console.log('[Test] Streaming started');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-streaming.png` });

  // ── Step 5: Wait for streaming + processing ──
  const totalWaitMs = Math.ceil(AUDIO_DURATION_S * 1000) + 15000;
  console.log(`[Test] Waiting ${(totalWaitMs / 1000).toFixed(0)}s for streaming + processing...`);

  const startTime = Date.now();
  const pollInterval = 10000;
  const polls = Math.ceil(totalWaitMs / pollInterval);
  for (let tick = 0; tick < polls; tick++) {
    await page.waitForTimeout(pollInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const turnsText = await page.locator('.bg-gray-50.rounded-lg.p-2\\.5').first()
      .locator('p.text-sm').textContent().catch(() => '?');
    console.log(`[Test] ${elapsed}s elapsed, turns: ${turnsText}`);
  }
  await page.waitForTimeout(5000);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-all-turns.png`, fullPage: true });

  // ── Step 6: Expand per-turn table ──
  const turnTableBtn = page.locator('button', { hasText: 'Per-Turn Statistics' });
  if (await turnTableBtn.isVisible()) {
    await turnTableBtn.click();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 }).catch(() => turnTableBtn.click());
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-turn-table.png`, fullPage: true });

  // ── Step 7: Collect metrics ──
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

  // ── Step 8: Conversation view ──
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Conversation' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-conversation.png`, fullPage: true });

  const conversationLogs = await page.evaluate(() => {
    const entries = document.querySelectorAll('.bg-gray-900.rounded-lg .group');
    const logs: Array<{ timestamp: string; text: string }> = [];
    entries.forEach((entry) => {
      const ts = entry.querySelector('.tabular-nums')?.textContent?.trim() ?? '';
      const text = entry.querySelector('.break-all')?.textContent?.trim() ?? '';
      if (ts && text) logs.push({ timestamp: ts, text });
    });
    return logs;
  });

  // ── Step 9: Metrics view ──
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Latency' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Cost' }).click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Token Usage' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-metrics.png`, fullPage: true });

  // ── Step 10: Stop ──
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
    JSON.stringify({ config: TEST_CONFIG, metrics, conversationLogs, referenceText: REFERENCE_TEXT, referenceSentences: REFERENCE_SENTENCES }, null, 2),
    'utf-8',
  );

  console.log(`[Test] Report saved to ${REPORT_DIR}/report.md`);

  // ── Console summary ──
  console.log('\n' + '='.repeat(70));
  console.log('  PER-TURN COMPARISON');
  console.log('='.repeat(70));
  for (const t of metrics.turns) {
    console.log(`Turn #${t.turn} | E2E: ${t.e2eLatency} | Duration: ${t.duration}`);
    console.log(`  ASR: ${t.inputASR}`);
    console.log(`  OUT: ${t.outputTranslation}`);
    console.log('');
  }

  const allASR = metrics.turns.map((t) => t.inputASR).filter(Boolean).join('');
  const allTranslation = metrics.turns.map((t) => t.outputTranslation).filter(Boolean).join(' ');

  console.log('='.repeat(70));
  console.log('CONCATENATED ASR:');
  console.log(allASR);
  console.log('');
  console.log('CONCATENATED TRANSLATION:');
  console.log(allTranslation);
  console.log('');
  console.log('REFERENCE TEXT:');
  console.log(REFERENCE_TEXT);
  console.log('='.repeat(70));

  expect(Object.keys(metrics.stats).length).toBeGreaterThan(0);
});


function buildReport(
  metrics: {
    stats: Record<string, string>;
    turns: Array<Record<string, string>>;
    totals: Record<string, string>;
  },
  conversationLogs: Array<{ timestamp: string; text: string }>,
): string {
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');

  let md = `# Voice Live Translator — Ctrip Break7 (gpt-4.1) Test Report

**Generated:** ${now}

---

## Test Setup

| Parameter | Value |
|-----------|-------|
| Audio File | break7非常抱歉您入住的_..._zh-CN-Xiaochen_DragonHDLatestNeural.wav (61.05s) |
| Method | Upload audio file |
| Model | **gpt-4.1** (Voice Live Pro) |
| VAD Type | azure_semantic_vad |
| Threshold | 0.5 |
| Prefix Padding | 400 ms |
| Silence Duration | **350 ms** |
| Speech Duration | 80 ms |
| VAD Languages | zh, Chinese |
| Voice Provider | Azure Neural |
| Voice Name | en-US-AndrewMultilingualNeural |
| ASR Model | azure-speech |
| ASR Languages | zh, en |
| Input Format | pcm16 @ 16 kHz |
| Output Format | pcm16 @ 24 kHz |

### Prompt

\`\`\`
${PROMPT}
\`\`\`

---

## Reference Text (12 sentences, breaks 500-700ms)

${REFERENCE_SENTENCES.map((s, i) => `${i + 1}. ${s}`).join('\n')}

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
  md += `| # | Duration | E2E Latency | Input (ASR) | Output (Translation) | In Text | Cached Text | In Audio | Cached Audio | Out Text | Out Audio | Total | Cost |\n`;
  md += `|--:|--------:|-----------:|-------------|----------------------|--------:|------------:|---------:|-------------:|---------:|----------:|------:|-----:|\n`;

  for (const t of metrics.turns) {
    md += `| ${t.turn} | ${t.duration} | ${t.e2eLatency} | ${esc(t.inputASR)} | ${esc(t.outputTranslation)} | ${t.inputTextTokens} | ${t.cachedTextTokens} | ${t.inputAudioTokens} | ${t.cachedAudioTokens} | ${t.outputTextTokens} | ${t.outputAudioTokens} | ${t.totalTokens} | ${t.cost} |\n`;
  }

  if (Object.keys(metrics.totals).length > 0) {
    const t = metrics.totals;
    md += `| **Total** | ${t.duration} | ${t.avgE2eLatency} | | | ${t.inputTextTokens} | ${t.cachedTextTokens} | ${t.inputAudioTokens} | ${t.cachedAudioTokens} | ${t.outputTextTokens} | ${t.outputAudioTokens} | ${t.totalTokens} | ${t.totalCost} |\n`;
  }

  // ASR vs Reference
  const allASR = metrics.turns.map((t) => t.inputASR).filter(Boolean).join('');
  const allTranslation = metrics.turns.map((t) => t.outputTranslation).filter(Boolean).join(' ');

  md += `\n---\n\n## ASR vs Reference\n\n`;
  md += `### Concatenated ASR\n\n${allASR || '_empty_'}\n\n`;
  md += `### Reference Text\n\n${REFERENCE_TEXT}\n\n`;

  md += `---\n\n## Full Translation\n\n${allTranslation || '_empty_'}\n\n`;

  // Sentence-level alignment
  md += `---\n\n## Sentence-Level Alignment\n\n`;
  md += `| # | Reference Sentence | Matched Turn(s) | ASR | Translation |\n`;
  md += `|--:|-------------------|-----------------|-----|-------------|\n`;

  for (let i = 0; i < REFERENCE_SENTENCES.length; i++) {
    const ref = REFERENCE_SENTENCES[i];
    // Find which turn(s) contain this sentence's key content
    const keyChars = ref.replace(/[。，、；：！？\.\,\s]/g, '').slice(0, 8);
    const matchedTurns: string[] = [];
    for (const t of metrics.turns) {
      if (t.inputASR && keyChars.length > 0) {
        let matched = 0;
        for (const ch of keyChars) {
          if (t.inputASR.includes(ch)) matched++;
        }
        if (matched / keyChars.length >= 0.6) {
          matchedTurns.push(`#${t.turn}`);
        }
      }
    }
    md += `| ${i + 1} | ${esc(ref)} | ${matchedTurns.join(', ') || '-'} | ${matchedTurns.length > 0 ? 'Yes' : '**MISSING**'} | |\n`;
  }

  // Conversation Log
  md += `\n---\n\n## Conversation Log\n\n`;
  if (conversationLogs.length > 0) {
    md += `| # | Timestamp | Content |\n`;
    md += `|--:|-----------|--------|\n`;
    let idx = 1;
    for (const log of conversationLogs) {
      md += `| ${idx++} | ${log.timestamp} | ${esc(log.text)} |\n`;
    }
  }

  // Config
  md += `\n---\n\n## Full Configuration\n\n`;
  md += '```json\n';
  md += JSON.stringify(TEST_CONFIG, null, 2);
  md += '\n```\n';

  return md;
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
