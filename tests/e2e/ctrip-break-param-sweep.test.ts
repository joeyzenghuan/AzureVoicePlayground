/**
 * Ctrip Break Audio — Parameter Sweep Experiment
 *
 * Goal: Find the optimal VAD parameters so that:
 *   1) Each turn contains a complete sentence/clause (cut at commas/periods)
 *   2) No single sentence is fragmented into meaningless pieces
 *   3) Sentences are not bundled too many together (user waits too long)
 *
 * Audio: break非常抱歉您入住的_20260412-011846_zh-CN-Xiaochen_DragonHDLatestNeural.wav
 *        67.45s, Chinese customer service with <break time='300ms'/> and <break time='500ms'/> pauses
 *
 * Run:
 *   npx playwright test --config tests/e2e/playwright.config.ts ctrip-break-param-sweep.test.ts
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

const REPORT_DIR = path.resolve(__dirname, 'ctrip-break-sweep');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

const REFERENCE_TEXT = `非常抱歉您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情，遇到这样的情况确实让人不舒服，也很影响出行的心情。但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响；第三我们会主动向酒店方面提出补偿要求，比如申请房费减免，或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。`;

// The audio has 10 natural sentence boundaries (marked by <break> tags in TTS input).
// Ideal turn count is roughly 8-12.
const REFERENCE_SENTENCES = [
  '非常抱歉您入住的酒店没有达到您的预期。',
  '我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情，',
  '遇到这样的情况确实让人不舒服，也很影响出行的心情。',
  '但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。',
  '目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：',
  '首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；',
  '第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响；',
  '第三我们会主动向酒店方面提出补偿要求，比如申请房费减免，或者升级您的房型，让您能获得一定的补偿和更好的服务。',
  '请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。',
  '我们会一直为您跟进，直到问题圆满解决。',
];

const PROMPT = [
  'You are a simultaneous interpreter.',
  'Target language: en.',
  '',
  'Rules:',
  '1) Translate sentence by sentence (output each sentence as it completes).',
  '2) Keep context consistent across turns (pronouns, terms, tone, references).',
  '3) Preserve meaning faithfully; do not add explanations or extra content.',
  '4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.',
  '5) Output translation text only.',
].join('\n');

// ── Experiment configurations ──
// We vary: turnDetectionType, silenceDurationInMs, speechDurationInMs, prefixPaddingInMs, threshold
type ExperimentConfig = {
  name: string;
  description: string;
  turnDetectionType: string;
  silenceDurationInMs: number;
  speechDurationInMs: number;
  prefixPaddingInMs: number;
  threshold: number;
};

const EXPERIMENTS: ExperimentConfig[] = [
  {
    name: 'A_semantic_silence400',
    description: 'semantic_vad | silence=400ms | speech=80ms | prefix=300ms | threshold=0.5',
    turnDetectionType: 'azure_semantic_vad',
    silenceDurationInMs: 400,
    speechDurationInMs: 80,
    prefixPaddingInMs: 300,
    threshold: 0.5,
  },
  {
    name: 'B_semantic_silence600',
    description: 'semantic_vad | silence=600ms | speech=80ms | prefix=300ms | threshold=0.5',
    turnDetectionType: 'azure_semantic_vad',
    silenceDurationInMs: 600,
    speechDurationInMs: 80,
    prefixPaddingInMs: 300,
    threshold: 0.5,
  },
  {
    name: 'C_semantic_silence800_speech200',
    description: 'semantic_vad | silence=800ms | speech=200ms | prefix=300ms | threshold=0.5',
    turnDetectionType: 'azure_semantic_vad',
    silenceDurationInMs: 800,
    speechDurationInMs: 200,
    prefixPaddingInMs: 300,
    threshold: 0.5,
  },
  {
    name: 'D_semantic_silence500_speech150',
    description: 'semantic_vad | silence=500ms | speech=150ms | prefix=300ms | threshold=0.5',
    turnDetectionType: 'azure_semantic_vad',
    silenceDurationInMs: 500,
    speechDurationInMs: 150,
    prefixPaddingInMs: 300,
    threshold: 0.5,
  },
  {
    name: 'E_server_vad_silence500',
    description: 'server_vad | silence=500ms | prefix=500ms | threshold=0.5',
    turnDetectionType: 'server_vad',
    silenceDurationInMs: 500,
    speechDurationInMs: 80,
    prefixPaddingInMs: 500,
    threshold: 0.5,
  },
  {
    name: 'F_server_vad_silence800',
    description: 'server_vad | silence=800ms | prefix=500ms | threshold=0.5',
    turnDetectionType: 'server_vad',
    silenceDurationInMs: 800,
    speechDurationInMs: 80,
    prefixPaddingInMs: 500,
    threshold: 0.5,
  },
];

type ExperimentResult = {
  config: ExperimentConfig;
  turns: number;
  avgE2eLatencyMs: number;
  p50E2eLatencyMs: number;
  p90E2eLatencyMs: number;
  totalCost: string;
  costPerInputSec: string;
  inputAudioSec: string;
  outputAudioSec: string;
  sessionSec: string;
  perTurnData: Array<{
    turn: string;
    duration: string;
    e2eLatency: string;
    inputASR: string;
    outputTranslation: string;
    cost: string;
  }>;
  conversationLogs: Array<{ timestamp: string; text: string }>;
  allStats: Record<string, string>;
};

function buildFullConfig(exp: ExperimentConfig) {
  return {
    model: 'gpt-4.1-mini',
    targetLanguage: 'en',
    prompt: PROMPT,
    asrModel: 'azure-speech',
    asrLanguages: 'zh,en',
    turnDetectionType: exp.turnDetectionType,
    threshold: exp.threshold,
    prefixPaddingInMs: exp.prefixPaddingInMs,
    silenceDurationInMs: exp.silenceDurationInMs,
    speechDurationInMs: exp.speechDurationInMs,
    removeFillerWords: false,
    voiceProvider: 'azure-standard',
    voiceName: 'en-US-AndrewMultilingualNeural',
    inputAudioFormat: 'pcm16',
    inputAudioSamplingRate: 16000,
    outputAudioFormat: 'pcm16',
    interruptResponse: false,
  };
}

async function runExperiment(
  page: any,
  exp: ExperimentConfig,
  index: number,
): Promise<ExperimentResult> {
  const config = buildFullConfig(exp);
  const prefix = `[Exp ${index + 1}/${EXPERIMENTS.length} ${exp.name}]`;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${prefix} Starting: ${exp.description}`);
  console.log(`${'='.repeat(70)}`);

  // Set config via localStorage
  await page.goto(BASE_URL);
  await page.evaluate(
    ({ endpoint, apiKey, config: c }) => {
      localStorage.setItem('azure-voice-live-settings', JSON.stringify({ endpoint, apiKey }));
      const s = JSON.parse(localStorage.getItem('azure-tts-settings') || '{}');
      s.voiceLiveEndpoint = endpoint;
      s.voiceLiveApiKey = apiKey;
      localStorage.setItem('azure-tts-settings', JSON.stringify(s));
      localStorage.setItem('voicelive.translator.config', JSON.stringify(c));
    },
    { endpoint: ENDPOINT, apiKey: API_KEY, config },
  );

  // Navigate & enable debug
  await page.goto(`${BASE_URL}/#voice-live-translator`);
  await page.waitForTimeout(2000);

  const debugBtn = page.locator('button:has-text("Debug OFF")');
  if (await debugBtn.isVisible()) {
    await debugBtn.click();
    await expect(page.locator('button:has-text("Debug ON")')).toBeVisible();
  }

  // Connect
  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 20000 });
  console.log(`${prefix} Connected`);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/${exp.name}_01_connected.png` });

  // Upload audio file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(AUDIO_FILE);
  await expect(page.locator('text=Streaming')).toBeVisible({ timeout: 10000 });
  console.log(`${prefix} Streaming started`);

  // Wait for streaming + processing
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

  // Extra buffer for final response
  await page.waitForTimeout(5000);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/${exp.name}_02_done.png`, fullPage: true });

  // Expand per-turn table
  const turnTableBtn = page.locator('button', { hasText: 'Per-Turn Statistics' });
  if (await turnTableBtn.isVisible()) {
    await turnTableBtn.click();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 3000 }).catch(() => turnTableBtn.click());
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/${exp.name}_03_table.png`, fullPage: true });

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
          cost: cells[12].textContent?.trim() ?? '',
        });
      }
    });

    return { stats, turns };
  });

  // Conversation view
  await page.locator('button:has-text("None")').click();
  await page.locator('.flex.flex-wrap button', { hasText: 'Conversation' }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/${exp.name}_04_conversation.png`, fullPage: true });

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

  // Stop
  const stopBtn = page.locator('button:has-text("Stop")');
  if (await stopBtn.isVisible()) {
    await stopBtn.click();
    await page.waitForTimeout(3000);
  }

  // Parse latency values from stats
  const parseMs = (s: string) => {
    if (!s || s === '-') return 0;
    const m = s.match(/([\d.]+)(ms|s)/);
    if (!m) return 0;
    return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  };

  const result: ExperimentResult = {
    config: exp,
    turns: parseInt(metrics.stats['Turns'] || '0'),
    avgE2eLatencyMs: parseMs(metrics.stats['Avg E2E Latency'] || ''),
    p50E2eLatencyMs: parseMs(metrics.stats['P50 E2E Latency'] || ''),
    p90E2eLatencyMs: parseMs(metrics.stats['P90 E2E Latency'] || ''),
    totalCost: metrics.stats['Cost'] || '-',
    costPerInputSec: metrics.stats['Cost/Input'] || '-',
    inputAudioSec: metrics.stats['Input Audio'] || '-',
    outputAudioSec: metrics.stats['Output Audio'] || '-',
    sessionSec: metrics.stats['Session'] || '-',
    perTurnData: metrics.turns.map((t) => ({
      turn: t.turn,
      duration: t.duration,
      e2eLatency: t.e2eLatency,
      inputASR: t.inputASR,
      outputTranslation: t.outputTranslation,
      cost: t.cost,
    })),
    conversationLogs,
    allStats: metrics.stats,
  };

  // Print summary
  console.log(`${prefix} Done — Turns: ${result.turns}, Avg E2E: ${result.avgE2eLatencyMs}ms, Cost: ${result.totalCost}`);

  return result;
}

// ── Quality scoring helpers ──

/** Count how many ASR turns look like incomplete fragments (< 4 chars, single word, etc.) */
function countFragments(perTurn: ExperimentResult['perTurnData']): number {
  let fragments = 0;
  for (const t of perTurn) {
    const text = t.inputASR.replace(/[。，、；：！？\.\,\;\!\?]/g, '').trim();
    // A fragment: very short text that is clearly not a complete clause
    if (text.length > 0 && text.length <= 4) {
      fragments++;
    }
  }
  return fragments;
}

/** Count how many turns have empty ASR (VAD triggered but no text) */
function countEmptyTurns(perTurn: ExperimentResult['perTurnData']): number {
  return perTurn.filter((t) => !t.inputASR || t.inputASR === '-').length;
}

/** Estimate how many reference sentences were covered (rough match) */
function estimateSentenceCoverage(perTurn: ExperimentResult['perTurnData']): number {
  const allASR = perTurn.map((t) => t.inputASR).join('');
  let covered = 0;
  for (const sent of REFERENCE_SENTENCES) {
    // Check if at least 60% of the sentence's key chars appear in ASR
    const keyChars = sent.replace(/[。，、；：！？\s]/g, '');
    let matched = 0;
    for (const ch of keyChars) {
      if (allASR.includes(ch)) matched++;
    }
    if (matched / keyChars.length >= 0.5) covered++;
  }
  return covered;
}

/** Calculate a composite quality score (higher = better) */
function calculateQualityScore(result: ExperimentResult): {
  score: number;
  turnCountScore: number;
  fragmentScore: number;
  latencyScore: number;
  detail: string;
} {
  const idealTurns = REFERENCE_SENTENCES.length; // 10
  const turnDiff = Math.abs(result.turns - idealTurns);
  // Turn count: perfect=10, penalty for being too far off
  // 0 diff = 30pts, each diff = -2pts, min 0
  const turnCountScore = Math.max(0, 30 - turnDiff * 2);

  // Fragments: fewer = better. Max 30pts, -2 per fragment
  const fragments = countFragments(result.perTurnData);
  const fragmentScore = Math.max(0, 30 - fragments * 2);

  // Latency: lower avg E2E = better. Max 20pts
  // < 800ms = 20pts, 800-1500ms linear, > 2000ms = 0
  const latencyScore =
    result.avgE2eLatencyMs <= 800
      ? 20
      : result.avgE2eLatencyMs >= 2000
      ? 0
      : Math.round(20 * (1 - (result.avgE2eLatencyMs - 800) / 1200));

  // Coverage: 10 sentences, 2pts each = 20pts
  const coverage = estimateSentenceCoverage(result.perTurnData);
  const coverageScore = coverage * 2;

  const score = turnCountScore + fragmentScore + latencyScore + coverageScore;

  const detail = [
    `Turn count: ${result.turns} (ideal ~${idealTurns}) → ${turnCountScore}/30`,
    `Fragments: ${fragments} short fragments → ${fragmentScore}/30`,
    `Avg E2E: ${result.avgE2eLatencyMs.toFixed(0)}ms → ${latencyScore}/20`,
    `Sentence coverage: ${coverage}/${REFERENCE_SENTENCES.length} → ${coverageScore}/20`,
    `Total: ${score}/100`,
  ].join('\n');

  return { score, turnCountScore, fragmentScore, latencyScore, detail };
}

// ── Main test ──

test('Parameter sweep: 6 configurations', async ({ page }) => {
  test.setTimeout(900000); // 15 min for all experiments

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const results: ExperimentResult[] = [];

  for (let i = 0; i < EXPERIMENTS.length; i++) {
    const result = await runExperiment(page, EXPERIMENTS[i], i);
    results.push(result);
  }

  // ── Generate comprehensive report ──
  const report = buildSweepReport(results);
  fs.writeFileSync(path.join(REPORT_DIR, 'sweep-report.md'), report, 'utf-8');
  fs.writeFileSync(
    path.join(REPORT_DIR, 'sweep-data.json'),
    JSON.stringify({ experiments: EXPERIMENTS, results, referenceText: REFERENCE_TEXT, referenceSentences: REFERENCE_SENTENCES }, null, 2),
    'utf-8',
  );

  console.log(`\nReport saved to ${REPORT_DIR}/sweep-report.md`);
  expect(results.length).toBe(EXPERIMENTS.length);
});


function buildSweepReport(results: ExperimentResult[]): string {
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z/, ' UTC');

  // Calculate scores
  const scored = results.map((r) => ({ ...r, quality: calculateQualityScore(r) }));
  scored.sort((a, b) => b.quality.score - a.quality.score);
  const bestName = scored[0].config.name;

  let md = `# Voice Live Translator — Parameter Sweep Report

**Generated:** ${now}
**Audio:** break非常抱歉您入住的 (67.45s, Chinese customer service with break tags)
**Goal:** Find optimal VAD parameters for sentence-level turn segmentation

---

## Reference Text (TTS Input, 10 natural sentences)

${REFERENCE_SENTENCES.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---

## Executive Summary

| Rank | Experiment | Turns | Fragments | Avg E2E | Cost | Score |
|-----:|------------|------:|----------:|--------:|-----:|------:|
`;

  for (let i = 0; i < scored.length; i++) {
    const s = scored[i];
    const fragments = countFragments(s.perTurnData);
    const medal = i === 0 ? ' **BEST**' : '';
    md += `| ${i + 1} | ${s.config.name}${medal} | ${s.turns} | ${fragments} | ${s.avgE2eLatencyMs.toFixed(0)}ms | ${s.totalCost} | **${s.quality.score}/100** |\n`;
  }

  md += `\n**Winner: ${bestName}** — ${scored[0].config.description}\n`;

  // ── Scoring detail ──
  md += `\n---\n\n## Quality Scoring Breakdown\n\n`;
  md += `Scoring: Turn Count (30) + Fragment Penalty (30) + Latency (20) + Coverage (20) = 100\n\n`;

  for (const s of scored) {
    md += `### ${s.config.name}\n\`\`\`\n${s.quality.detail}\n\`\`\`\n\n`;
  }

  // ── Detailed comparison table ──
  md += `---\n\n## Full Statistics Comparison\n\n`;
  md += `| Metric | ${results.map((r) => r.config.name).join(' | ')} |\n`;
  md += `|--------|${results.map(() => '------:').join('|')}|\n`;

  const metricRows: [string, (r: ExperimentResult) => string][] = [
    ['VAD Type', (r) => r.config.turnDetectionType],
    ['Silence Duration', (r) => `${r.config.silenceDurationInMs}ms`],
    ['Speech Duration', (r) => `${r.config.speechDurationInMs}ms`],
    ['Prefix Padding', (r) => `${r.config.prefixPaddingInMs}ms`],
    ['Threshold', (r) => `${r.config.threshold}`],
    ['Turns', (r) => `${r.turns}`],
    ['Fragments', (r) => `${countFragments(r.perTurnData)}`],
    ['Empty Turns', (r) => `${countEmptyTurns(r.perTurnData)}`],
    ['Avg E2E Latency', (r) => `${r.avgE2eLatencyMs.toFixed(0)}ms`],
    ['P50 E2E Latency', (r) => `${r.p50E2eLatencyMs.toFixed(0)}ms`],
    ['P90 E2E Latency', (r) => `${r.p90E2eLatencyMs.toFixed(0)}ms`],
    ['Total Cost', (r) => r.totalCost],
    ['Cost/Input sec', (r) => r.costPerInputSec],
    ['Input Audio', (r) => r.inputAudioSec],
    ['Output Audio', (r) => r.outputAudioSec],
    ['Session Time', (r) => r.sessionSec],
    ['Coverage', (r) => `${estimateSentenceCoverage(r.perTurnData)}/${REFERENCE_SENTENCES.length}`],
  ];

  for (const [label, fn] of metricRows) {
    md += `| ${label} | ${results.map((r) => fn(r)).join(' | ')} |\n`;
  }

  // ── Per-experiment detail ──
  for (const r of results) {
    md += `\n---\n\n## Experiment: ${r.config.name}\n\n`;
    md += `**${r.config.description}**\n\n`;

    // Per-turn table
    md += `### Per-Turn Breakdown (${r.perTurnData.length} turns)\n\n`;
    md += `| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |\n`;
    md += `|--:|--------:|----:|-------------|----------------------|-----:|\n`;

    for (const t of r.perTurnData) {
      md += `| ${t.turn} | ${t.duration} | ${t.e2eLatency} | ${esc(t.inputASR)} | ${esc(t.outputTranslation)} | ${t.cost} |\n`;
    }

    // Concatenated ASR
    const allASR = r.perTurnData.map((t) => t.inputASR).filter(Boolean).join('');
    const allTranslation = r.perTurnData.map((t) => t.outputTranslation).filter(Boolean).join(' ');

    md += `\n### Concatenated ASR\n\n${allASR || '_empty_'}\n\n`;
    md += `### Concatenated Translation\n\n${allTranslation || '_empty_'}\n\n`;
  }

  // ── Recommendation ──
  md += `---\n\n## Recommendation\n\n`;
  md += `Based on the scoring (turn count accuracy, fragment avoidance, latency, and coverage), `;
  md += `**${bestName}** (${scored[0].config.description}) produced the best results with a score of **${scored[0].quality.score}/100**.\n\n`;
  md += `### Suggested Configuration\n\n`;
  md += '```json\n';
  md += JSON.stringify(buildFullConfig(scored[0].config), null, 2);
  md += '\n```\n';

  return md;
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
