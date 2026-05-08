/**
 * Ctrip Break9 — gpt-5-nano with enhanced prompt x2
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts ctrip-break9-nano-v2.test.ts
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

const AUDIO_FILE = '/Users/joey/gitrepo/OpenAI-examples/Cog/Voice-Live/live-interpreter/Ctrip-solution/audios/break9非常抱歉您入住的_20260412-132749_zh-CN-Xiaochen_DragonHDLatestNeural.wav';
const AUDIO_DURATION_S = 59.35;

const REPORT_DIR = path.resolve(__dirname, 'ctrip-break9-nano-v2');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

const PROMPT = `You are a simultaneous interpreter.
You will translate Chinese to English, and translate English to Chinese.

Rules:
0) Don't answer any question, just translate anything input.
1) Translate sentence by sentence (output each sentence as it completes).
2) Keep context consistent across turns (pronouns, terms, tone, references).
3) Preserve meaning faithfully; do not add explanations or extra content.
4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.
5) Output translation text only.

  Abbreviation handling:
  - When translating English to Chinese, if an English abbreviation appears for the FIRST time, translate as: abbreviation + Chinese full name in parentheses. If same abbreviation occurs for the 2nd time, use English abbreviation directly.
Example: "Input: FCF is good. How about FCF next year? -> FCF（自由现金流）很好. 那明年的FCF呢？".

  Brand name mapping (always apply, no exceptions):
ATrip→爱程

  Context-aware terminology:
  - "token" in AI/LLM/billing context → 词元
  - "token" in finance/crypto context → 代币
  - "token" in authentication/security context → 令牌`;

const TEST_CONFIG = {
  model: 'gpt-5-nano',
  targetLanguage: 'en',
  prompt: PROMPT,
  asrModel: 'azure-speech',
  asrLanguages: 'zh-CN',
  phraseList: '爱程, 优优酒店, ATrip',
  turnDetectionType: 'azure_semantic_vad',
  threshold: 0.5,
  prefixPaddingInMs: 400,
  silenceDurationInMs: 350,
  speechDurationInMs: 80,
  removeFillerWords: false,
  vadLanguages: 'zh',
  voiceProvider: 'azure-standard',
  voiceName: 'en-US-AndrewMultilingualNeural',
  inputAudioFormat: 'pcm16',
  inputAudioSamplingRate: 16000,
  outputAudioFormat: 'pcm16',
  interruptResponse: false,
};

const NUM_RUNS = 2;

type RunResult = {
  run: number;
  turns: number;
  stats: Record<string, string>;
  perTurn: Array<{ turn: string; duration: string; e2eLatency: string; inputASR: string; outputTranslation: string; cost: string }>;
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

  await page.locator('input[type="file"]').setInputFiles(AUDIO_FILE);
  await expect(page.locator('text=Streaming')).toBeVisible({ timeout: 10000 });
  console.log(`${prefix} Streaming...`);

  const totalWaitMs = Math.ceil(AUDIO_DURATION_S * 1000) + 15000;
  const startTime = Date.now();
  const pollInterval = 15000;
  const polls = Math.ceil(totalWaitMs / pollInterval);
  for (let tick = 0; tick < polls; tick++) {
    await page.waitForTimeout(pollInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const turnsText = await page.locator('.bg-gray-50.rounded-lg.p-2\\.5').first()
      .locator('p.text-sm').textContent().catch(() => '?');
    console.log(`${prefix} ${elapsed}s, turns: ${turnsText}`);
  }
  await page.waitForTimeout(5000);

  const turnTableBtn = page.locator('button', { hasText: 'Per-Turn Statistics' });
  if (await turnTableBtn.isVisible()) {
    await turnTableBtn.click();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 }).catch(() => turnTableBtn.click());
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/run${run}_table.png`, fullPage: true });

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
          cost: cells[12].textContent?.trim() ?? '',
        });
      }
    });
    return { stats, turns };
  });

  // Conversation screenshot
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Conversation' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/run${run}_conv.png`, fullPage: true });

  const stopBtn = page.locator('button:has-text("Stop")');
  if (await stopBtn.isVisible()) {
    await stopBtn.click();
    await page.waitForTimeout(2000);
  }

  const result: RunResult = {
    run,
    turns: parseInt(metrics.stats['Turns'] || '0'),
    stats: metrics.stats,
    perTurn: metrics.turns as any,
    allASR: metrics.turns.map((t: any) => t.inputASR).filter(Boolean).join(''),
    allTranslation: metrics.turns.map((t: any) => t.outputTranslation).filter(Boolean).join(' '),
  };

  console.log(`${prefix} Done — Turns: ${result.turns}, E2E: ${result.stats['Avg E2E Latency']}, Cost: ${result.stats['Cost']}`);
  for (const t of result.perTurn) {
    console.log(`  #${t.turn} | E2E: ${t.e2eLatency} | ${t.cost}`);
    console.log(`    ASR: ${t.inputASR}`);
    console.log(`    OUT: ${t.outputTranslation}`);
  }

  return result;
}

test('break9 gpt-5-nano enhanced prompt x2', async ({ page }) => {
  test.setTimeout(300000);
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const results: RunResult[] = [];
  for (let i = 1; i <= NUM_RUNS; i++) {
    results.push(await runOnce(page, i));
  }

  // Build report
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');
  let md = `# gpt-5-nano Enhanced Prompt Test — Break9

**Generated:** ${now}
**Model:** gpt-5-nano (Lite)
**Prompt:** Enhanced with abbreviation handling, brand mapping, context-aware terminology

---

## Run Comparison

| | Run 1 | Run 2 |
|--|-------|-------|
| Turns | ${results[0].turns} | ${results[1].turns} |
| Avg E2E | ${results[0].stats['Avg E2E Latency']} | ${results[1].stats['Avg E2E Latency']} |
| P50 E2E | ${results[0].stats['P50 E2E Latency']} | ${results[1].stats['P50 E2E Latency']} |
| P90 E2E | ${results[0].stats['P90 E2E Latency']} | ${results[1].stats['P90 E2E Latency']} |
| Cost | ${results[0].stats['Cost']} | ${results[1].stats['Cost']} |
| Input Audio | ${results[0].stats['Input Audio']} | ${results[1].stats['Input Audio']} |
| Output Audio | ${results[0].stats['Output Audio']} | ${results[1].stats['Output Audio']} |

---

## Prompt Used

\`\`\`
${PROMPT}
\`\`\`

---
`;

  for (const r of results) {
    md += `## Run ${r.run} — ${r.turns} turns | E2E: ${r.stats['Avg E2E Latency']} | Cost: ${r.stats['Cost']}\n\n`;
    md += `| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |\n`;
    md += `|--:|--------:|----:|-------------|----------------------|-----:|\n`;
    for (const t of r.perTurn) {
      md += `| ${t.turn} | ${t.duration} | ${t.e2eLatency} | ${esc(t.inputASR)} | ${esc(t.outputTranslation)} | ${t.cost} |\n`;
    }
    md += `\n**Concatenated ASR:**\n\n${r.allASR}\n\n`;
    md += `**Concatenated Translation:**\n\n${r.allTranslation}\n\n---\n\n`;
  }

  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), md, 'utf-8');
  fs.writeFileSync(path.join(REPORT_DIR, 'data.json'), JSON.stringify({ config: TEST_CONFIG, results }, null, 2), 'utf-8');
  console.log(`\nReport: ${REPORT_DIR}/report.md`);
  expect(results.length).toBe(NUM_RUNS);
});

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
