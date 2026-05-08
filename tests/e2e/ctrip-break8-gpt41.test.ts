/**
 * Ctrip Break8 Audio — gpt-4.1 + semantic_vad silence=350ms
 *
 * Audio: break8非常抱歉您入住的_20260412-122251_zh-CN-Xiaochen_DragonHDLatestNeural.wav (59.70s)
 * Same config as break7 test. Run 3 times for consistency check.
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts ctrip-break8-gpt41.test.ts
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

const AUDIO_FILE = '/Users/joey/gitrepo/OpenAI-examples/Cog/Voice-Live/live-interpreter/Ctrip-solution/audios/break8非常抱歉您入住的_20260412-122251_zh-CN-Xiaochen_DragonHDLatestNeural.wav';
const AUDIO_DURATION_S = 59.70;

const REPORT_DIR = path.resolve(__dirname, 'ctrip-break8-gpt41');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

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

const NUM_RUNS = 3;

type RunResult = {
  run: number;
  turns: number;
  avgE2eMs: string;
  cost: string;
  perTurn: Array<{ turn: string; e2eLatency: string; inputASR: string; outputTranslation: string }>;
  allASR: string;
  allTranslation: string;
};

async function runOnce(page: any, run: number): Promise<RunResult> {
  const prefix = `[Run ${run}/${NUM_RUNS}]`;
  console.log(`\n${'='.repeat(60)}\n${prefix} Starting\n${'='.repeat(60)}`);

  await page.goto(BASE_URL);
  await page.evaluate(
    ({ endpoint, apiKey, config }: any) => {
      localStorage.setItem('azure-voice-live-settings', JSON.stringify({ endpoint, apiKey }));
      const s = JSON.parse(localStorage.getItem('azure-tts-settings') || '{}');
      s.voiceLiveEndpoint = endpoint;
      s.voiceLiveApiKey = apiKey;
      localStorage.setItem('azure-tts-settings', JSON.stringify(s));
      localStorage.setItem('voicelive.translator.config', JSON.stringify(config));
    },
    { endpoint: ENDPOINT, apiKey: API_KEY, config: TEST_CONFIG },
  );

  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(2000);

  const debugBtn = page.locator('button:has-text("Debug OFF")');
  if (await debugBtn.isVisible()) await debugBtn.click();

  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 20000 });
  console.log(`${prefix} Connected`);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/run${run}_01_connected.png` });

  // Upload
  await page.locator('input[type="file"]').setInputFiles(AUDIO_FILE);
  await expect(page.locator('text=Streaming')).toBeVisible({ timeout: 10000 });
  console.log(`${prefix} Streaming started`);

  // Wait
  const totalWaitMs = Math.ceil(AUDIO_DURATION_S * 1000) + 15000;
  const startTime = Date.now();
  const pollInterval = 15000;
  const polls = Math.ceil(totalWaitMs / pollInterval);
  for (let tick = 0; tick < polls; tick++) {
    await page.waitForTimeout(pollInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const turnsText = await page.locator('.bg-gray-50.rounded-lg.p-2\\.5').first()
      .locator('p.text-sm').textContent().catch(() => '?');
    console.log(`${prefix} ${elapsed}s elapsed, turns: ${turnsText}`);
  }
  await page.waitForTimeout(5000);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/run${run}_02_done.png`, fullPage: true });

  // Expand turn table
  const turnTableBtn = page.locator('button', { hasText: 'Per-Turn Statistics' });
  if (await turnTableBtn.isVisible()) {
    await turnTableBtn.click();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 }).catch(() => turnTableBtn.click());
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/run${run}_03_table.png`, fullPage: true });

  // Collect
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
          e2eLatency: cells[2].textContent?.trim() ?? '',
          inputASR: cells[3].textContent?.trim() ?? '',
          outputTranslation: cells[4].textContent?.trim() ?? '',
        });
      }
    });
    return { stats, turns };
  });

  // Conversation screenshot
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Conversation' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/run${run}_04_conversation.png`, fullPage: true });

  // Stop
  const stopBtn = page.locator('button:has-text("Stop")');
  if (await stopBtn.isVisible()) {
    await stopBtn.click();
    await page.waitForTimeout(3000);
  }

  const result: RunResult = {
    run,
    turns: parseInt(metrics.stats['Turns'] || '0'),
    avgE2eMs: metrics.stats['Avg E2E Latency'] || '-',
    cost: metrics.stats['Cost'] || '-',
    perTurn: metrics.turns,
    allASR: metrics.turns.map((t) => t.inputASR).filter(Boolean).join(''),
    allTranslation: metrics.turns.map((t) => t.outputTranslation).filter(Boolean).join(' '),
  };

  console.log(`${prefix} Done — Turns: ${result.turns}, Avg E2E: ${result.avgE2eMs}, Cost: ${result.cost}`);

  // Print turns
  for (const t of result.perTurn) {
    console.log(`  Turn #${t.turn} | E2E: ${t.e2eLatency}`);
    console.log(`    ASR: ${t.inputASR}`);
    console.log(`    OUT: ${t.outputTranslation}`);
  }

  return result;
}

test('ctrip-break8: gpt-4.1 x3 runs', async ({ page }) => {
  test.setTimeout(600000); // 10 min

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const results: RunResult[] = [];
  for (let i = 1; i <= NUM_RUNS; i++) {
    results.push(await runOnce(page, i));
  }

  // Build comparison report
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');
  let md = `# Voice Live Translator — Ctrip Break8 (gpt-4.1) x3 Runs Report

**Generated:** ${now}
**Audio:** break8非常抱歉您入住的 (59.70s)
**Model:** gpt-4.1 | **VAD:** semantic_vad, silence=350ms, speech=80ms, prefix=400ms

---

## Run Comparison

| | Run 1 | Run 2 | Run 3 |
|--|-------|-------|-------|
| Turns | ${results.map(r => r.turns).join(' | ')} |
| Avg E2E | ${results.map(r => r.avgE2eMs).join(' | ')} |
| Cost | ${results.map(r => r.cost).join(' | ')} |

`;

  for (const r of results) {
    md += `---\n\n## Run ${r.run} — ${r.turns} turns\n\n`;
    md += `| # | E2E | Input (ASR) | Output (Translation) |\n`;
    md += `|--:|----:|-------------|----------------------|\n`;
    for (const t of r.perTurn) {
      md += `| ${t.turn} | ${t.e2eLatency} | ${esc(t.inputASR)} | ${esc(t.outputTranslation)} |\n`;
    }
    md += `\n**ASR:** ${r.allASR}\n\n`;
    md += `**Translation:** ${r.allTranslation}\n\n`;
  }

  md += `---\n\n## Configuration\n\n\`\`\`json\n${JSON.stringify(TEST_CONFIG, null, 2)}\n\`\`\`\n`;

  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), md, 'utf-8');
  fs.writeFileSync(path.join(REPORT_DIR, 'data.json'), JSON.stringify({ config: TEST_CONFIG, results }, null, 2), 'utf-8');

  console.log(`\nReport saved to ${REPORT_DIR}/report.md`);
  expect(results.length).toBe(NUM_RUNS);
});

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
