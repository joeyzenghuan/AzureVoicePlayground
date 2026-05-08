/**
 * Ctrip Break9 — All Models x2 Benchmark
 *
 * Audio: break9非常抱歉您入住的_20260412-132749_zh-CN-Xiaochen_DragonHDLatestNeural.wav (59.35s)
 * Tests all 12 models, 2 runs each = 24 total runs
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts ctrip-break9-all-models.test.ts
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

const REPORT_DIR = path.resolve(__dirname, 'ctrip-break9-all-models');
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

const MODELS = [
  // Pro
  'gpt-realtime', 'gpt-4o', 'gpt-4.1', 'gpt-5', 'gpt-5-chat',
  // Basic
  'gpt-realtime-mini', 'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini',
  // Lite
  'gpt-5-nano', 'phi4-mm-realtime', 'phi4-mini',
];

const RUNS_PER_MODEL = 2;

function buildConfig(model: string) {
  return {
    model,
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
}

type TurnData = {
  turn: string;
  duration: string;
  e2eLatency: string;
  inputASR: string;
  outputTranslation: string;
  inputTextTokens: string;
  cachedTextTokens: string;
  inputAudioTokens: string;
  cachedAudioTokens: string;
  outputTextTokens: string;
  outputAudioTokens: string;
  totalTokens: string;
  cost: string;
};

type RunResult = {
  model: string;
  run: number;
  turns: number;
  stats: Record<string, string>;
  perTurn: TurnData[];
  totals: Record<string, string>;
  allASR: string;
  allTranslation: string;
  error?: string;
};

async function runOnce(page: any, model: string, run: number, totalIdx: number, totalRuns: number): Promise<RunResult> {
  const prefix = `[${totalIdx}/${totalRuns} ${model} R${run}]`;
  console.log(`\n${prefix} Starting...`);

  const config = buildConfig(model);

  try {
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ endpoint, apiKey, config: c }: any) => {
        localStorage.setItem('azure-voice-live-settings', JSON.stringify({ endpoint, apiKey }));
        const s = JSON.parse(localStorage.getItem('azure-tts-settings') || '{}');
        s.voiceLiveEndpoint = endpoint;
        s.voiceLiveApiKey = apiKey;
        localStorage.setItem('azure-tts-settings', JSON.stringify(s));
        localStorage.setItem('voicelive.translator.config', JSON.stringify(c));
      },
      { endpoint: ENDPOINT, apiKey: API_KEY, config },
    );

    await page.goto(`${BASE_URL}/#voice-live-translator`);
    await page.waitForTimeout(2000);

    const debugBtn = page.locator('button:has-text("Debug OFF")');
    if (await debugBtn.isVisible()) await debugBtn.click();

    // Connect
    await page.locator('button:has-text("Start Translation")').click();
    await expect(page.locator('text=Connected')).toBeVisible({ timeout: 30000 });

    // Upload
    await page.locator('input[type="file"]').setInputFiles(AUDIO_FILE);
    await expect(page.locator('text=Streaming')).toBeVisible({ timeout: 10000 });
    console.log(`${prefix} Streaming...`);

    // Wait
    const totalWaitMs = Math.ceil(AUDIO_DURATION_S * 1000) + 15000;
    const startTime = Date.now();
    const pollInterval = 20000;
    const polls = Math.ceil(totalWaitMs / pollInterval);
    for (let tick = 0; tick < polls; tick++) {
      await page.waitForTimeout(pollInterval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const turnsText = await page.locator('.bg-gray-50.rounded-lg.p-2\\.5').first()
        .locator('p.text-sm').textContent().catch(() => '?');
      console.log(`${prefix} ${elapsed}s, turns: ${turnsText}`);
    }
    await page.waitForTimeout(5000);

    // Expand turn table
    const turnTableBtn = page.locator('button', { hasText: 'Per-Turn Statistics' });
    if (await turnTableBtn.isVisible()) {
      await turnTableBtn.click();
      await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 }).catch(() => turnTableBtn.click());
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/${model}_r${run}.png`, fullPage: true });

    // Collect metrics
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

    // Stop
    const stopBtn = page.locator('button:has-text("Stop")');
    if (await stopBtn.isVisible()) {
      await stopBtn.click();
      await page.waitForTimeout(2000);
    }

    const result: RunResult = {
      model,
      run,
      turns: parseInt(metrics.stats['Turns'] || '0'),
      stats: metrics.stats,
      perTurn: metrics.turns as TurnData[],
      totals: metrics.totals,
      allASR: metrics.turns.map((t: any) => t.inputASR).filter(Boolean).join(''),
      allTranslation: metrics.turns.map((t: any) => t.outputTranslation).filter(Boolean).join(' '),
    };

    console.log(`${prefix} Done — Turns: ${result.turns}, E2E: ${result.stats['Avg E2E Latency']}, Cost: ${result.stats['Cost']}`);
    return result;

  } catch (e: any) {
    console.log(`${prefix} ERROR: ${e.message}`);
    // Try to stop/disconnect on error
    try {
      const stopBtn = page.locator('button:has-text("Stop")');
      if (await stopBtn.isVisible({ timeout: 2000 })) await stopBtn.click();
    } catch { /* ignore */ }
    await page.waitForTimeout(2000);

    return {
      model,
      run,
      turns: 0,
      stats: {},
      perTurn: [],
      totals: {},
      allASR: '',
      allTranslation: '',
      error: e.message,
    };
  }
}

test('break9: all 12 models x2 benchmark', async ({ page }) => {
  test.setTimeout(2400000); // 40 min

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const allResults: RunResult[] = [];
  const totalRuns = MODELS.length * RUNS_PER_MODEL;
  let idx = 0;

  for (const model of MODELS) {
    for (let run = 1; run <= RUNS_PER_MODEL; run++) {
      idx++;
      const result = await runOnce(page, model, run, idx, totalRuns);
      allResults.push(result);
    }
  }

  // Save raw data
  fs.writeFileSync(
    path.join(REPORT_DIR, 'all-data.json'),
    JSON.stringify({ config: buildConfig('(template)'), results: allResults }, null, 2),
    'utf-8',
  );

  // Build report
  const report = buildReport(allResults);
  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), report, 'utf-8');

  console.log(`\nReport saved to ${REPORT_DIR}/report.md`);
  console.log(`Data saved to ${REPORT_DIR}/all-data.json`);

  expect(allResults.length).toBe(totalRuns);
});


function buildReport(results: RunResult[]): string {
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');
  const parseMs = (s: string) => {
    if (!s || s === '-') return 0;
    const m = s.match(/([\d.]+)(ms|s)/);
    if (!m) return 0;
    return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  };
  const parseCost = (s: string) => {
    if (!s || s === '-') return 0;
    return parseFloat(s.replace('$', ''));
  };

  let md = `# Voice Live Translator — Break9 All Models Benchmark

**Generated:** ${now}
**Audio:** break9非常抱歉您入住的 (59.35s, Chinese customer service)
**Runs per model:** 2

---

## Configuration

| Parameter | Value |
|-----------|-------|
| ASR Model | azure-speech |
| ASR Languages | zh-CN |
| Phrase List | 爱程, 优优酒店, ATrip |
| VAD Type | azure_semantic_vad |
| Threshold | 0.5 |
| Prefix Padding | 400 ms |
| Silence Duration | 350 ms |
| Speech Duration | 80 ms |
| VAD Languages | zh |
| Voice | en-US-AndrewMultilingualNeural |

---

## Executive Summary

| Model | Tier | R1 Turns | R2 Turns | R1 E2E | R2 E2E | R1 Cost | R2 Cost | R1 P90 | R2 P90 | Avg Cost | Avg E2E |
|-------|------|--------:|---------:|-------:|-------:|--------:|--------:|-------:|-------:|---------:|--------:|
`;

  // Group by model
  const byModel = new Map<string, RunResult[]>();
  for (const r of results) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }

  const tierMap: Record<string, string> = {
    'gpt-realtime': 'Pro', 'gpt-4o': 'Pro', 'gpt-4.1': 'Pro', 'gpt-5': 'Pro', 'gpt-5-chat': 'Pro',
    'gpt-realtime-mini': 'Basic', 'gpt-4o-mini': 'Basic', 'gpt-4.1-mini': 'Basic', 'gpt-5-mini': 'Basic',
    'gpt-5-nano': 'Lite', 'phi4-mm-realtime': 'Lite', 'phi4-mini': 'Lite',
  };

  const summaries: Array<{ model: string; tier: string; avgCost: number; avgE2e: number; r1: RunResult; r2: RunResult }> = [];

  for (const model of MODELS) {
    const runs = byModel.get(model) || [];
    const r1 = runs[0];
    const r2 = runs[1];
    const tier = tierMap[model] || '?';

    const r1e2e = r1 ? parseMs(r1.stats['Avg E2E Latency'] || '') : 0;
    const r2e2e = r2 ? parseMs(r2.stats['Avg E2E Latency'] || '') : 0;
    const r1cost = r1 ? parseCost(r1.stats['Cost'] || '') : 0;
    const r2cost = r2 ? parseCost(r2.stats['Cost'] || '') : 0;
    const r1p90 = r1?.stats['P90 E2E Latency'] || '-';
    const r2p90 = r2?.stats['P90 E2E Latency'] || '-';
    const avgCost = (r1cost + r2cost) / 2;
    const avgE2e = (r1e2e + r2e2e) / 2;

    const err1 = r1?.error ? ` **ERR**` : '';
    const err2 = r2?.error ? ` **ERR**` : '';

    md += `| ${model} | ${tier} | ${r1?.turns ?? '-'}${err1} | ${r2?.turns ?? '-'}${err2} | ${r1?.stats['Avg E2E Latency'] || '-'} | ${r2?.stats['Avg E2E Latency'] || '-'} | ${r1?.stats['Cost'] || '-'} | ${r2?.stats['Cost'] || '-'} | ${r1p90} | ${r2p90} | $${avgCost.toFixed(4)} | ${avgE2e.toFixed(0)}ms |\n`;

    if (r1 && r2) summaries.push({ model, tier, avgCost, avgE2e, r1, r2 });
  }

  // Ranking
  md += `\n---\n\n## Rankings\n\n`;

  md += `### By Average E2E Latency (lower = better)\n\n`;
  md += `| Rank | Model | Tier | Avg E2E | Avg Cost |\n|-----:|-------|------|--------:|---------:|\n`;
  const byLatency = [...summaries].sort((a, b) => a.avgE2e - b.avgE2e);
  byLatency.forEach((s, i) => {
    md += `| ${i + 1} | ${s.model} | ${s.tier} | ${s.avgE2e.toFixed(0)}ms | $${s.avgCost.toFixed(4)} |\n`;
  });

  md += `\n### By Average Cost (lower = better)\n\n`;
  md += `| Rank | Model | Tier | Avg Cost | Avg E2E |\n|-----:|-------|------|--------:|---------:|\n`;
  const byCost = [...summaries].sort((a, b) => a.avgCost - b.avgCost);
  byCost.forEach((s, i) => {
    md += `| ${i + 1} | ${s.model} | ${s.tier} | $${s.avgCost.toFixed(4)} | ${s.avgE2e.toFixed(0)}ms |\n`;
  });

  // Detailed results per model
  md += `\n---\n\n## Detailed Results per Model\n\n`;

  for (const model of MODELS) {
    const runs = byModel.get(model) || [];
    const tier = tierMap[model] || '?';

    md += `### ${model} (${tier})\n\n`;

    for (const r of runs) {
      if (r.error) {
        md += `**Run ${r.run}: ERROR** — ${r.error}\n\n`;
        continue;
      }

      md += `**Run ${r.run}** — ${r.turns} turns | E2E: ${r.stats['Avg E2E Latency']} | P50: ${r.stats['P50 E2E Latency']} | P90: ${r.stats['P90 E2E Latency']} | Cost: ${r.stats['Cost']} | Input: ${r.stats['Input Audio']} | Output: ${r.stats['Output Audio']}\n\n`;

      md += `| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |\n`;
      md += `|--:|--------:|----:|-------------|----------------------|-----:|\n`;
      for (const t of r.perTurn) {
        md += `| ${t.turn} | ${t.duration} | ${t.e2eLatency} | ${esc(t.inputASR)} | ${esc(t.outputTranslation)} | ${t.cost} |\n`;
      }

      md += `\n**ASR:** ${r.allASR || '_empty_'}\n\n`;
      md += `**Translation:** ${r.allTranslation || '_empty_'}\n\n`;
    }
  }

  // Full stats comparison table
  md += `---\n\n## Full Metrics Comparison\n\n`;
  md += `| Model | Run | Turns | Session | Cost | Cost/sec | Cost/Input | Avg E2E | P50 E2E | P90 E2E | Input Audio | Output Audio |\n`;
  md += `|-------|----:|------:|--------:|-----:|---------:|-----------:|--------:|--------:|--------:|------------:|-------------:|\n`;

  for (const r of results) {
    if (r.error) {
      md += `| ${r.model} | ${r.run} | ERROR | | | | | | | | | |\n`;
      continue;
    }
    md += `| ${r.model} | ${r.run} | ${r.turns} | ${r.stats['Session'] || '-'} | ${r.stats['Cost'] || '-'} | ${r.stats['Cost/sec'] || '-'} | ${r.stats['Cost/Input'] || '-'} | ${r.stats['Avg E2E Latency'] || '-'} | ${r.stats['P50 E2E Latency'] || '-'} | ${r.stats['P90 E2E Latency'] || '-'} | ${r.stats['Input Audio'] || '-'} | ${r.stats['Output Audio'] || '-'} |\n`;
  }

  md += `\n---\n\n## Configuration Used\n\n\`\`\`json\n${JSON.stringify(buildConfig('(per model)'), null, 2)}\n\`\`\`\n`;

  return md;
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
