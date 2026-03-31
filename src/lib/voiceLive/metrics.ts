import type { TokenUsage } from '@azure/ai-voicelive';

export type TurnMetrics = {
  responseId: string;
  startedAtMs: number;
  firstTextDeltaAtMs?: number;
  firstAudioDeltaAtMs?: number;
  playbackStartedAtMs?: number;
  finishedAtMs?: number;
  latencyMs?: number;
  firstTokenLatencyMs?: number;
  e2eLatencyMs?: number;
  audioBufferDelayMs?: number;
  usage?: TokenUsage;
  userTranscript?: string;
  assistantText?: string;
  speechStartedAtMs?: number;
  speechStoppedAtMs?: number;
  startLatencyMs?: number;
  endLatencyMs?: number;
};

export type Totals = {
  turns: number;
  sessionStartMs: number;
  inputAudioSeconds: number;
  cachedAudioSeconds: number;
  outputAudioSeconds: number;
  inputTextTokens: number;
  cachedTextTokens: number;
  outputTextTokens: number;
  inputAudioTokens: number;
  cachedAudioTokens: number;
  outputAudioTokens: number;
  startLatencies: number[];
  endLatencies: number[];
  e2eLatencies: number[];
};

export const EMPTY_TOTALS: Totals = {
  turns: 0,
  sessionStartMs: 0,
  inputAudioSeconds: 0,
  cachedAudioSeconds: 0,
  outputAudioSeconds: 0,
  inputTextTokens: 0,
  cachedTextTokens: 0,
  outputTextTokens: 0,
  inputAudioTokens: 0,
  cachedAudioTokens: 0,
  outputAudioTokens: 0,
  startLatencies: [],
  endLatencies: [],
  e2eLatencies: [],
};

export function addUsage(t: Totals, usage: TokenUsage): Totals {
  const newInputAudioTokens = t.inputAudioTokens + usage.inputTokenDetails.audioTokens;
  const newOutputAudioTokens = t.outputAudioTokens + usage.outputTokenDetails.audioTokens;
  return {
    ...t,
    inputTextTokens: t.inputTextTokens + usage.inputTokenDetails.textTokens,
    inputAudioTokens: newInputAudioTokens,
    inputAudioSeconds: newInputAudioTokens / 10,
    cachedTextTokens: t.cachedTextTokens + usage.inputTokenDetails.cachedTokensDetails.textTokens,
    cachedAudioTokens: t.cachedAudioTokens + usage.inputTokenDetails.cachedTokensDetails.audioTokens,
    outputTextTokens: t.outputTextTokens + usage.outputTokenDetails.textTokens,
    outputAudioTokens: newOutputAudioTokens,
    outputAudioSeconds: newOutputAudioTokens / 20,
  };
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export type VoiceLiveTier = 'pro' | 'standard' | 'lite';
export type VoiceType = 'text' | 'azure-standard' | 'native-audio';

interface PricingRates {
  inputText: number;
  cachedText: number;
  outputText: number;
  inputAudio: number;
  cachedAudio: number;
  outputAudio: number;
}

const PRICING_TABLE: Record<VoiceLiveTier, Record<VoiceType, PricingRates>> = {
  pro: {
    text: {
      inputText: 5.50,
      cachedText: 2.75,
      outputText: 22,
      inputAudio: 17,
      cachedAudio: 2.75,
      outputAudio: 38,
    },
    'azure-standard': {
      inputText: 5.50,
      cachedText: 2.75,
      outputText: 22,
      inputAudio: 17,
      cachedAudio: 2.75,
      outputAudio: 38,
    },
    'native-audio': {
      inputText: 5.50,
      cachedText: 2.75,
      outputText: 22,
      inputAudio: 44,
      cachedAudio: 2.75,
      outputAudio: 88,
    },
  },
  standard: {
    text: {
      inputText: 0.66,
      cachedText: 0.33,
      outputText: 2.64,
      inputAudio: 15,
      cachedAudio: 0.33,
      outputAudio: 33,
    },
    'azure-standard': {
      inputText: 0.66,
      cachedText: 0.33,
      outputText: 2.64,
      inputAudio: 15,
      cachedAudio: 0.33,
      outputAudio: 33,
    },
    'native-audio': {
      inputText: 0.66,
      cachedText: 0.33,
      outputText: 2.64,
      inputAudio: 11,
      cachedAudio: 0.33,
      outputAudio: 22,
    },
  },
  lite: {
    text: {
      inputText: 0.11,
      cachedText: 0.04,
      outputText: 0.44,
      inputAudio: 15,
      cachedAudio: 0.04,
      outputAudio: 33,
    },
    'azure-standard': {
      inputText: 0.11,
      cachedText: 0.04,
      outputText: 0.44,
      inputAudio: 15,
      cachedAudio: 0.04,
      outputAudio: 33,
    },
    'native-audio': {
      inputText: 0.11,
      cachedText: 0.04,
      outputText: 0.44,
      inputAudio: 4,
      cachedAudio: 0.04,
      outputAudio: 8,
    },
  },
};

export interface CostBreakdown {
  total: number;
  inputText: { tokens: number; rate: number; cost: number };
  cachedText: { tokens: number; rate: number; cost: number };
  outputText: { tokens: number; rate: number; cost: number };
  inputAudio: { tokens: number; rate: number; cost: number };
  cachedAudio: { tokens: number; rate: number; cost: number };
  outputAudio: { tokens: number; rate: number; cost: number };
}

export function calculateTurnCostBreakdown(
  usage: TokenUsage,
  modelTier: VoiceLiveTier = 'standard',
  voiceProvider: string = 'azure-standard'
): CostBreakdown {
  const voiceType: VoiceType = voiceProvider === 'openai' ? 'native-audio' : 'azure-standard';
  const rates = PRICING_TABLE[modelTier][voiceType];

  const items = {
    inputText: { tokens: usage.inputTokenDetails.textTokens, rate: rates.inputText, cost: 0 },
    cachedText: { tokens: usage.inputTokenDetails.cachedTokensDetails.textTokens, rate: rates.cachedText, cost: 0 },
    outputText: { tokens: usage.outputTokenDetails.textTokens, rate: rates.outputText, cost: 0 },
    inputAudio: { tokens: usage.inputTokenDetails.audioTokens, rate: rates.inputAudio, cost: 0 },
    cachedAudio: { tokens: usage.inputTokenDetails.cachedTokensDetails.audioTokens, rate: rates.cachedAudio, cost: 0 },
    outputAudio: { tokens: usage.outputTokenDetails.audioTokens, rate: rates.outputAudio, cost: 0 },
  };

  for (const v of Object.values(items)) {
    v.cost = (v.tokens / 1_000_000) * v.rate;
  }

  return {
    ...items,
    total: Object.values(items).reduce((s, v) => s + v.cost, 0),
  };
}

export function calculateTurnCost(
  usage: TokenUsage,
  modelTier: VoiceLiveTier = 'standard',
  voiceProvider: string = 'azure-standard'
): number {
  return calculateTurnCostBreakdown(usage, modelTier, voiceProvider).total;
}

export function calculateCost(
  totals: Totals,
  modelTier: VoiceLiveTier = 'standard',
  voiceProvider: string = 'azure-standard'
): number {
  const voiceType: VoiceType = voiceProvider === 'openai' ? 'native-audio' : 'azure-standard';
  const rates = PRICING_TABLE[modelTier][voiceType];

  const inputTextCost = (totals.inputTextTokens / 1_000_000) * rates.inputText;
  const cachedTextCost = (totals.cachedTextTokens / 1_000_000) * rates.cachedText;
  const outputTextCost = (totals.outputTextTokens / 1_000_000) * rates.outputText;
  const inputAudioCost = (totals.inputAudioTokens / 1_000_000) * rates.inputAudio;
  const cachedAudioCost = (totals.cachedAudioTokens / 1_000_000) * rates.cachedAudio;
  const outputAudioCost = (totals.outputAudioTokens / 1_000_000) * rates.outputAudio;

  return inputTextCost + cachedTextCost + outputTextCost + inputAudioCost + cachedAudioCost + outputAudioCost;
}
