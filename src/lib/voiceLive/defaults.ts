import type { RequestSession, TurnDetectionUnion } from '@azure/ai-voicelive';

export type VoiceLiveModelTier = 'pro' | 'basic' | 'lite';

export const MODEL_OPTIONS: Array<{ tier: VoiceLiveModelTier; id: string }> = [
  { tier: 'pro', id: 'gpt-realtime' },
  { tier: 'pro', id: 'gpt-4o' },
  { tier: 'pro', id: 'gpt-4.1' },
  { tier: 'pro', id: 'gpt-5' },
  { tier: 'pro', id: 'gpt-5-chat' },
  { tier: 'basic', id: 'gpt-realtime-mini' },
  { tier: 'basic', id: 'gpt-4o-mini' },
  { tier: 'basic', id: 'gpt-4.1-mini' },
  { tier: 'basic', id: 'gpt-5-mini' },
  { tier: 'lite', id: 'gpt-5-nano' },
  { tier: 'lite', id: 'phi4-mm-realtime' },
  { tier: 'lite', id: 'phi4-mini' },
];

export const TARGET_LANGUAGE_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'sv', label: 'Svenska' },
  { code: 'no', label: 'Norsk' },
  { code: 'da', label: 'Dansk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'pl', label: 'Polski' },
  { code: 'cs', label: 'Čeština' },
  { code: 'hu', label: 'Magyar' },
  { code: 'ro', label: 'Română' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'he', label: 'עברית' },
];

export type VoiceLiveConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  targetLanguage: string;
  prompt: string;

  // Model parameters
  temperature?: number;
  maxResponseOutputTokens?: number;

  // ASR & Recognition
  asrModel: 'azure-speech' | 'whisper-1' | 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe';
  asrLanguages: string;
  phraseList?: string;

  // Turn Detection (VAD)
  turnDetectionType: 'server_vad' | 'azure_semantic_vad';
  threshold: number;
  prefixPaddingInMs: number;
  silenceDurationInMs: number;
  speechDurationInMs: number;
  removeFillerWords: boolean;
  interruptResponse: boolean;
  autoTruncate?: boolean;
  vadLanguages?: string;
  eouModel: 'semantic_detection_v1';
  eouThresholdLevel: 'low' | 'medium' | 'high' | 'default';
  eouTimeoutInMs: number;

  // Voice
  voiceProvider: 'openai' | 'azure-standard' | 'azure-personal' | 'azure-custom';
  voiceName: string;
  voiceStyle?: string;
  voiceRate?: string;
  voicePitch?: string;
  voiceVolume?: string;
  voiceLocale?: string;
  voicePreferLocales?: string;
  voiceTemperature?: number;
  voiceEndpointId?: string;
  voiceModel?: string;

  // Audio Format
  inputAudioFormat: string;
  inputAudioSamplingRate: number;
  outputAudioFormat: string;
  noiseReduction?: boolean;
  echoCancellation?: boolean;
};

export const DEFAULT_CONFIG: VoiceLiveConfig = {
  endpoint: '',
  apiKey: '',
  model: 'gpt-4.1-mini',
  targetLanguage: 'en',
  prompt: '',

  asrModel: 'azure-speech',
  asrLanguages: '',

  turnDetectionType: 'azure_semantic_vad',
  threshold: 0.5,
  prefixPaddingInMs: 300,
  silenceDurationInMs: 200,
  speechDurationInMs: 80,
  removeFillerWords: false,
  interruptResponse: false,
  eouModel: 'semantic_detection_v1',
  eouThresholdLevel: 'default',
  eouTimeoutInMs: 1000,

  voiceProvider: 'azure-standard',
  voiceName: 'en-US-AvaMultilingualNeural',

  inputAudioFormat: 'pcm16',
  inputAudioSamplingRate: 16000,
  outputAudioFormat: 'pcm16',
};

export function buildInterpreterPrompt(targetLanguage: string): string {
  return [
    'You are a simultaneous interpreter.',
    `Target language: ${targetLanguage}.`,
    '',
    'Rules:',
    '1) Translate sentence by sentence (output each sentence as it completes).',
    '2) Keep context consistent across turns (pronouns, terms, tone, references).',
    '3) Preserve meaning faithfully; do not add explanations or extra content.',
    '4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.',
    '5) Output translation text only.',
  ].join('\n');
}

/** Helper: only include a key if the value is defined */
function optField<T>(val: T | undefined | null): T | undefined {
  return val != null && val !== '' ? val : undefined;
}

export function toRequestSession(config: VoiceLiveConfig): RequestSession {
  const effectiveTurnDetectionType =
    config.asrModel === 'azure-speech' ? 'azure_semantic_vad' : config.turnDetectionType;

  const baseTurnDetection = {
    threshold: config.threshold,
    prefixPaddingInMs: config.prefixPaddingInMs,
    silenceDurationInMs: config.silenceDurationInMs,
    createResponse: true,
    interruptResponse: config.interruptResponse,
    ...(config.autoTruncate != null && { autoTruncate: config.autoTruncate }),
  };

  const turnDetection: TurnDetectionUnion =
    effectiveTurnDetectionType === 'server_vad'
      ? { type: 'server_vad', ...baseTurnDetection }
      : {
          type: 'azure_semantic_vad',
          ...baseTurnDetection,
          speechDurationInMs: config.speechDurationInMs,
          removeFillerWords: config.removeFillerWords,
          ...(config.vadLanguages && {
            languages: config.vadLanguages.split(',').map((s) => s.trim()).filter(Boolean),
          }),
        };

  const asrLanguages = config.asrLanguages
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');

  const phraseListArr = config.phraseList
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const azureSsmlProps = {
    ...(optField(config.voiceStyle) && { style: config.voiceStyle }),
    ...(optField(config.voiceRate) && { rate: config.voiceRate }),
    ...(optField(config.voicePitch) && { pitch: config.voicePitch }),
    ...(optField(config.voiceVolume) && { volume: config.voiceVolume }),
    ...(optField(config.voiceLocale) && { locale: config.voiceLocale }),
    ...(optField(config.voicePreferLocales) && {
      preferLocales: config.voicePreferLocales!.split(',').map((s) => s.trim()).filter(Boolean),
    }),
    ...(config.voiceTemperature != null && { temperature: config.voiceTemperature }),
  };

  let voice: any;
  switch (config.voiceProvider) {
    case 'openai':
      voice = { type: 'openai', name: config.voiceName };
      break;
    case 'azure-personal':
      voice = {
        type: 'azure-personal',
        name: config.voiceName,
        model: config.voiceModel || 'DragonLatestNeural',
        ...(config.voiceTemperature != null && { temperature: config.voiceTemperature }),
      };
      break;
    case 'azure-custom':
      voice = {
        type: 'azure-custom',
        name: config.voiceName,
        ...(optField(config.voiceEndpointId) && { endpointId: config.voiceEndpointId }),
        ...(config.voiceTemperature != null && { temperature: config.voiceTemperature }),
        ...azureSsmlProps,
      };
      break;
    default: // azure-standard
      voice = { type: 'azure-standard', name: config.voiceName, ...azureSsmlProps };
      break;
  }

  return {
    model: config.model,
    modalities: ['audio', 'text'],
    instructions: config.prompt,
    inputAudioFormat: config.inputAudioFormat as any,
    inputAudioSamplingRate: config.inputAudioSamplingRate,
    outputAudioFormat: config.outputAudioFormat as any,
    turnDetection,
    ...(config.temperature != null && { temperature: config.temperature }),
    ...(config.maxResponseOutputTokens != null && { maxResponseOutputTokens: config.maxResponseOutputTokens }),
    ...(config.noiseReduction != null && {
      inputAudioNoiseReduction: { type: 'server_noise_reduction' } as any,
    }),
    ...(config.echoCancellation != null && config.echoCancellation && {
      inputAudioEchoCancellation: { type: 'server_echo_cancellation' } as any,
    }),
    inputAudioTranscription:
      config.asrModel === 'azure-speech'
        ? {
            model: 'azure-speech',
            language: asrLanguages || undefined,
            ...(phraseListArr?.length && { phraseList: phraseListArr }),
          }
        : {
            model: config.asrModel,
            ...(phraseListArr?.length && { phraseList: phraseListArr }),
          },
    voice,
  };
}

export function inferPcmSampleRateFromOutputFormat(outputAudioFormat: string | undefined): number {
  if (!outputAudioFormat) return 24000;
  const fmt = outputAudioFormat.toLowerCase();
  if (fmt === 'pcm16') return 24000;
  if (fmt === 'pcm16-16000hz') return 16000;
  if (fmt === 'pcm16-8000hz') return 8000;
  return 24000;
}

export function mapEndpointUrl(url: string): string {
  try {
    const pattern = /^(https:\/\/[^/]+)\.services\.ai\.azure\.com\/api\/projects\//;
    const match = url.match(pattern);
    if (match) {
      const resourceName = match[1].replace('https://', '');
      return `https://${resourceName}.cognitiveservices.azure.com/`;
    }
    return url;
  } catch {
    return url;
  }
}
