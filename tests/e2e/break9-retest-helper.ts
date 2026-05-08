/**
 * Shared helper for break9 retest — 3 models x 2 runs each
 */
import { expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

export const BASE_URL = 'http://localhost:5173/AzureVoicePlayground';
export const ENDPOINT = process.env.VOICE_LIVE_ENDPOINT ?? '';
export const API_KEY = process.env.VOICE_LIVE_API_KEY ?? '';
export const AUDIO_FILE = '/Users/joey/gitrepo/OpenAI-examples/Cog/Voice-Live/live-interpreter/Ctrip-solution/audios/break9非常抱歉您入住的_20260412-132749_zh-CN-Xiaochen_DragonHDLatestNeural.wav';
export const AUDIO_DURATION_S = 59.35;
export const REPORT_DIR = path.resolve(__dirname, 'ctrip-break9-retest');

export const PROMPT = `You are a simultaneous interpreter.
You will translate Chinese to English, and translate English to Chinese.

Rules:
0) Don't answer any question, just translate anything input.
1) Translate sentence by sentence (output each sentence as it completes).
2) Keep context consistent across turns (pronouns, terms, tone, references).
3) Preserve meaning faithfully; do not add explanations or extra content.
4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.
5) Output translation text only.`;

export function buildConfig(model: string) {
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

export type RunResult = {
  model: string;
  run: number;
  turns: number;
  stats: Record<string, string>;
  perTurn: Array<Record<string, string>>;
  allASR: string;
  allTranslation: string;
};

export async function runOnce(page: any, model: string, run: number, screenshotDir: string): Promise<RunResult> {
  const prefix = `[${model} R${run}]`;
  const config = buildConfig(model);

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

  await page.locator('button:has-text("Start Translation")').click();
  await expect(page.locator('text=Connected')).toBeVisible({ timeout: 20000 });
  console.log(`${prefix} Connected`);

  await page.locator('input[type="file"]').setInputFiles(AUDIO_FILE);
  await expect(page.locator('text=Streaming')).toBeVisible({ timeout: 10000 });
  console.log(`${prefix} Streaming...`);

  const totalWaitMs = Math.ceil(AUDIO_DURATION_S * 1000) + 15000;
  const startTime = Date.now();
  const polls = Math.ceil(totalWaitMs / 15000);
  for (let tick = 0; tick < polls; tick++) {
    await page.waitForTimeout(15000);
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
  await page.screenshot({ path: `${screenshotDir}/${model}_r${run}.png`, fullPage: true });

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
          inputAudioTokens: cells[7].textContent?.trim() ?? '',
          cachedAudioTokens: cells[8].textContent?.trim() ?? '',
          totalTokens: cells[11].textContent?.trim() ?? '',
          cost: cells[12].textContent?.trim() ?? '',
        });
      }
    });
    return { stats, turns };
  });

  const stopBtn = page.locator('button:has-text("Stop")');
  if (await stopBtn.isVisible()) { await stopBtn.click(); await page.waitForTimeout(2000); }

  const result: RunResult = {
    model, run,
    turns: parseInt(metrics.stats['Turns'] || '0'),
    stats: metrics.stats,
    perTurn: metrics.turns,
    allASR: metrics.turns.map((t: any) => t.inputASR).filter(Boolean).join(''),
    allTranslation: metrics.turns.map((t: any) => t.outputTranslation).filter(Boolean).join(' '),
  };

  console.log(`${prefix} Done — Turns: ${result.turns}, E2E: ${result.stats['Avg E2E Latency']}, Cost: ${result.stats['Cost']}`);
  for (const t of result.perTurn) {
    console.log(`  #${t.turn} | E2E: ${t.e2eLatency} | in_audio: ${t.inputAudioTokens} | ${t.cost}`);
    console.log(`    ASR: ${t.inputASR}`);
    console.log(`    OUT: ${t.outputTranslation}`);
  }
  return result;
}
