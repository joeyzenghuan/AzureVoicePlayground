import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GptRealtimeClient,
  type ConnectionStatus,
  type RealtimeResponsePatch,
  type RealtimeSessionPatch,
} from '../lib/gptRealtime/realtimeClient';
import { GptRealtimeAudioHandler } from '../lib/gptRealtime/audioHandler';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

type TurnDetectionMode = 'server_vad' | 'semantic_vad' | 'off';
type NoiseReductionMode = 'off' | 'near_field' | 'far_field';
type ReasoningEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high';

interface GptRealtimeUiConfig {
  deploymentOrModel: string;
  voice: string;
  systemPrompt: string;
  showResponseLatency: boolean;
  outputModalities: Array<'audio' | 'text'>;
  transcriptionEnabled: boolean;
  transcriptionModel: string;
  transcriptionLanguage: string;
  transcriptionPrompt: string;
  turnDetectionMode: TurnDetectionMode;
  vadThreshold: number;
  vadPrefixPaddingMs: number;
  vadSilenceDurationMs: number;
  vadIdleTimeoutMs: string;
  vadCreateResponse: boolean;
  vadInterruptResponse: boolean;
  noiseReduction: NoiseReductionMode;
  maxResponseOutputTokensMode: 'inf' | 'custom';
  maxResponseOutputTokens: string;
  reasoningEffort: ReasoningEffort;
  rawSessionJson: string;
  rawResponseJson: string;
}

const STORAGE_KEY = 'gpt-realtime-config-v2';

const VOICE_OPTIONS = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'ash', label: 'Ash' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'cedar', label: 'Cedar' },
  { value: 'coral', label: 'Coral' },
  { value: 'echo', label: 'Echo' },
  { value: 'marin', label: 'Marin' },
  { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'verse', label: 'Verse' },
];

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful voice assistant. Keep your responses concise and natural for voice interaction.';

const DEFAULT_CONFIG: GptRealtimeUiConfig = {
  deploymentOrModel: 'gpt-realtime',
  voice: 'alloy',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  showResponseLatency: false,
  outputModalities: ['audio'],
  transcriptionEnabled: true,
  transcriptionModel: 'whisper-1',
  transcriptionLanguage: '',
  transcriptionPrompt: '',
  turnDetectionMode: 'server_vad',
  vadThreshold: 0.5,
  vadPrefixPaddingMs: 300,
  vadSilenceDurationMs: 500,
  vadIdleTimeoutMs: '',
  vadCreateResponse: true,
  vadInterruptResponse: true,
  noiseReduction: 'off',
  maxResponseOutputTokensMode: 'inf',
  maxResponseOutputTokens: '',
  reasoningEffort: 'off',
  rawSessionJson: '',
  rawResponseJson: '',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects<T extends Record<string, unknown>>(base: T, patch?: Record<string, unknown>): T {
  if (!patch) {
    return { ...base };
  }

  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = mergeObjects(current, value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

function parseJsonObject(value: string, fieldName: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `${fieldName} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${fieldName} must be a JSON object`);
  }

  return parsed;
}

function normalizeOutputModalities(
  value: Array<'audio' | 'text'> | undefined,
): Array<'audio' | 'text'> {
  if (!value || value.length === 0) {
    return DEFAULT_CONFIG.outputModalities;
  }

  if (value.includes('audio')) {
    return ['audio'];
  }

  return ['text'];
}

function loadInitialConfig(): GptRealtimeUiConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<GptRealtimeUiConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        outputModalities: normalizeOutputModalities(
          parsed.outputModalities?.filter(
            (value): value is 'audio' | 'text' => value === 'audio' || value === 'text',
          ),
        ),
      };
    } catch {
      // Fall back to legacy keys below.
    }
  }

  return {
    ...DEFAULT_CONFIG,
    deploymentOrModel:
      localStorage.getItem('gpt-realtime-deployment') || DEFAULT_CONFIG.deploymentOrModel,
    voice: localStorage.getItem('gpt-realtime-voice') || DEFAULT_CONFIG.voice,
    systemPrompt:
      localStorage.getItem('gpt-realtime-system-prompt') || DEFAULT_CONFIG.systemPrompt,
    showResponseLatency: localStorage.getItem('gpt-realtime-show-latency') === 'true',
  };
}

function buildSessionPatch(config: GptRealtimeUiConfig): {
  session: RealtimeSessionPatch;
  response?: RealtimeResponsePatch;
} {
  if (!config.deploymentOrModel.trim()) {
    throw new Error('Deployment / model is required');
  }

  if (config.outputModalities.includes('audio') && !config.voice.trim()) {
    throw new Error('Voice is required');
  }

  if (config.outputModalities.length === 0) {
    throw new Error('Select at least one output modality');
  }

  const rawSessionPatch = parseJsonObject(config.rawSessionJson, 'Raw session JSON');
  const rawResponsePatch = parseJsonObject(config.rawResponseJson, 'Raw response JSON');

  let maxResponseOutputTokens: number | 'inf' | undefined;
  if (config.maxResponseOutputTokensMode === 'custom') {
    const parsed = Number(config.maxResponseOutputTokens);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error('Max response output tokens must be a positive number');
    }
    maxResponseOutputTokens = Math.round(parsed);
  } else {
    maxResponseOutputTokens = 'inf';
  }

  const transcriptionModel = config.transcriptionModel.trim();

  const audioInput: Record<string, unknown> = {
    format: {
      type: 'audio/pcm',
      rate: 24000,
    },
    transcription: config.transcriptionEnabled && transcriptionModel
      ? {
          model: transcriptionModel,
          ...(config.transcriptionLanguage.trim() && {
            language: config.transcriptionLanguage.trim(),
          }),
          ...(config.transcriptionPrompt.trim() && {
            prompt: config.transcriptionPrompt.trim(),
          }),
        }
      : null,
    turn_detection:
      config.turnDetectionMode === 'off'
        ? null
        : {
            type: config.turnDetectionMode,
            ...(config.turnDetectionMode === 'server_vad'
              ? {
                  threshold: config.vadThreshold,
                  prefix_padding_ms: config.vadPrefixPaddingMs,
                  silence_duration_ms: config.vadSilenceDurationMs,
                }
              : {}),
            create_response: config.vadCreateResponse,
            interrupt_response: config.vadInterruptResponse,
            ...(config.vadIdleTimeoutMs.trim() && {
              idle_timeout_ms: Math.max(0, Math.round(Number(config.vadIdleTimeoutMs))),
            }),
          },
    noise_reduction:
      config.noiseReduction === 'off'
        ? null
        : {
            type: config.noiseReduction,
          },
  };

  const audio: Record<string, unknown> = {
    input: audioInput,
  };

  if (config.outputModalities.includes('audio')) {
    audio.output = {
      format: {
        type: 'audio/pcm',
        rate: 24000,
      },
      voice: config.voice.trim(),
    };
  }

  const session: RealtimeSessionPatch = {
    output_modalities: config.outputModalities,
    instructions: config.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
    max_output_tokens: maxResponseOutputTokens,
    audio,
    reasoning:
      config.reasoningEffort === 'off'
        ? undefined
        : {
            effort: config.reasoningEffort,
          },
  };

  return {
    session: mergeObjects(session, rawSessionPatch),
    response: rawResponsePatch,
  };
}

interface GptRealtimePlaygroundProps {
  endpoint: string;
  apiKey: string;
}

export function GptRealtimePlayground({ endpoint, apiKey }: GptRealtimePlaygroundProps) {
  const [config, setConfig] = useState<GptRealtimeUiConfig>(() => loadInitialConfig());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const clientRef = useRef<GptRealtimeClient | null>(null);
  const audioHandlerRef = useRef<GptRealtimeAudioHandler | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const circleRef = useRef<HTMLDivElement | null>(null);
  const showResponseLatencyRef = useRef(config.showResponseLatency);
  const latencyRef = useRef<number | null>(null);

  const transcriptRef = useRef<{
    inputTranscript: string;
    outputTranscript: string;
    inputMessageId: string | null;
    outputMessageId: string | null;
  }>({
    inputTranscript: '',
    outputTranscript: '',
    inputMessageId: null,
    outputMessageId: null,
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    showResponseLatencyRef.current = config.showResponseLatency;
  }, [config]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      audioHandlerRef.current?.destroy();
    };
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? { ...message, content } : message)));
  }, []);

  function resetTranscriptState() {
    transcriptRef.current = {
      inputTranscript: '',
      outputTranscript: '',
      inputMessageId: null,
      outputMessageId: null,
    };
  }

  async function handleConnect() {
    if (!apiKey.trim()) {
      setError('Please configure API Key in the left sidebar');
      return;
    }
    if (!endpoint.trim()) {
      setError('Please configure Endpoint in the left sidebar');
      return;
    }

    let session: RealtimeSessionPatch;
    let response: RealtimeResponsePatch | undefined;

    try {
      ({ session, response } = buildSessionPatch(config));
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : String(buildError));
      return;
    }

    clientRef.current?.disconnect();
    audioHandlerRef.current?.destroy();
    resetTranscriptState();

    const audioHandler = new GptRealtimeAudioHandler();
    audioHandlerRef.current = audioHandler;
    if (circleRef.current) {
      audioHandler.setCircleElement(circleRef.current);
    }

    const client = new GptRealtimeClient({
      apiKey: apiKey.trim(),
      endpoint: endpoint.trim(),
      deploymentOrModel: config.deploymentOrModel.trim(),
      isAzure: true,
      session,
      response,
      onAudioData: (audioData) => {
        audioHandler.playAudio(audioData);
      },
      onOutputTranscript: (text, isDelta) => {
        const transcript = transcriptRef.current;

        if (transcript.inputTranscript) {
          transcript.inputTranscript = '';
          transcript.inputMessageId = null;
        }

        transcript.outputTranscript = isDelta ? `${transcript.outputTranscript}${text}` : text;

        if (transcript.outputMessageId) {
          updateMessage(transcript.outputMessageId, transcript.outputTranscript);
        } else {
          const newId = crypto.randomUUID();
          transcript.outputMessageId = newId;
          addMessage({
            id: newId,
            type: 'assistant',
            content: transcript.outputTranscript,
            timestamp: new Date(),
          });
        }
      },
      onInputTranscript: (text, isDelta) => {
        const transcript = transcriptRef.current;
        transcript.inputTranscript = isDelta ? `${transcript.inputTranscript}${text}` : text;

        if (transcript.inputMessageId) {
          updateMessage(transcript.inputMessageId, transcript.inputTranscript);
        } else {
          const newId = crypto.randomUUID();
          transcript.inputMessageId = newId;
          addMessage({
            id: newId,
            type: 'user',
            content: transcript.inputTranscript,
            timestamp: new Date(),
          });
        }
      },
      onTurnComplete: () => {
        if (showResponseLatencyRef.current && latencyRef.current != null) {
          addMessage({
            id: crypto.randomUUID(),
            type: 'system',
            content: `Response latency: ${Math.round(latencyRef.current)}ms`,
            timestamp: new Date(),
          });
        }
        resetTranscriptState();
      },
      onInterrupted: () => {
        audioHandler.clearPlayback();
        transcriptRef.current.outputTranscript = '';
        transcriptRef.current.outputMessageId = null;
        addMessage({
          id: crypto.randomUUID(),
          type: 'system',
          content: '[Interrupted]',
          timestamp: new Date(),
        });
      },
      onUserSpeechStarted: () => {
        if (!config.vadInterruptResponse) {
          return;
        }

        const audio = audioHandlerRef.current;
        const realtimeClient = clientRef.current;
        if (!audio || !realtimeClient || !audio.isCurrentlyPlaying()) {
          return;
        }

        const playedMs = audio.interruptPlayback();
        realtimeClient.interruptResponse(playedMs);
      },
      onError: (clientError) => setError(clientError),
      onStatusChange: (nextStatus) => {
        setStatus(nextStatus);
        if (nextStatus === 'disconnected') {
          resetTranscriptState();
          setLatency(null);
          latencyRef.current = null;
        }
      },
      onLatencyMeasured: (nextLatency) => {
        setLatency(nextLatency);
        latencyRef.current = nextLatency;
      },
    });

    clientRef.current = client;

    try {
      setError(null);
      await client.connect();
      await startRecording();
    } catch (connectError) {
      setError(`Connection failed: ${connectError}`);
    }
  }

  async function handleDisconnect() {
    audioHandlerRef.current?.stopRecording();
    audioHandlerRef.current?.clearPlayback();
    clientRef.current?.disconnect();
    setIsRecording(false);
  }

  async function startRecording() {
    if (!audioHandlerRef.current || !clientRef.current) return;

    try {
      await audioHandlerRef.current.startRecording((audioData) => {
        clientRef.current?.sendAudio(audioData);
      });
      setIsRecording(true);
      setError(null);
    } catch (recordError) {
      setError(`Microphone access failed: ${recordError}`);
    }
  }

  function toggleRecording() {
    if (isRecording) {
      audioHandlerRef.current?.stopRecording();
      setIsRecording(false);
      return;
    }

    void startRecording();
  }

  function handleSendText() {
    if (!textInput.trim() || !clientRef.current || status !== 'connected') return;

    addMessage({
      id: crypto.randomUUID(),
      type: 'user',
      content: textInput,
      timestamp: new Date(),
    });
    clientRef.current.sendText(textInput.trim());
    setTextInput('');
  }

  function handleClearMessages() {
    resetTranscriptState();
    setMessages([]);
  }

  function toggleOutputModality(modality: 'audio' | 'text') {
    setConfig((current) => ({
      ...current,
      outputModalities: [modality],
    }));
  }

  function getMessageStyle(type: Message['type']) {
    switch (type) {
      case 'user':
        return 'bg-blue-100 text-blue-900 ml-auto';
      case 'assistant':
        return 'bg-gray-100 text-gray-900 mr-auto';
      case 'system':
        return 'bg-yellow-100 text-yellow-800 mx-auto text-xs';
      default:
        return 'bg-gray-100 text-gray-900';
    }
  }

  const selectedVoiceOption = VOICE_OPTIONS.find((voice) => voice.value === config.voice)?.value ?? '__custom__';
  const controlsDisabled = status === 'connected' || status === 'connecting';

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 shadow-md">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">GPT Realtime</h1>
              <p className="text-green-100 mt-1">
                Azure OpenAI Realtime playground with GA session settings and voice interruption.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  status === 'connected' ? 'bg-green-500/20 text-green-100' : 'bg-white/20 text-white/80'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-400' : 'bg-white/60'}`}
                />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {latency != null && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-white/20 text-white/80">
                  ⚡ {Math.round(latency)}ms
                </span>
              )}
              {isRecording && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-100">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  Recording
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className="flex-shrink-0 flex flex-col items-center py-8 bg-white border-b border-gray-100"
          style={{ height: '280px' }}
        >
          <div
            ref={circleRef}
            className="rounded-full transition-all duration-150 ease-out flex items-center justify-center"
            style={{
              width: '120px',
              height: '120px',
              backgroundColor: '#e5e7eb',
            }}
          >
            <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          {status !== 'connected' && (
            <p className="text-sm text-gray-400 mt-2">Click Connect to begin conversation</p>
          )}
          {config.vadInterruptResponse && (
            <p className="text-xs text-gray-500 mt-3">
              Speaking while the assistant is talking will cut off playback immediately.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-sm">Connect and speak to start chatting with GPT Realtime</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`max-w-[80%] px-4 py-2 rounded-lg ${getMessageStyle(msg.type)}`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-xs opacity-60 mt-1">{msg.timestamp.toLocaleTimeString()}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="bg-gray-50 border-t border-gray-200 p-4">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder="Type a message (or just speak)..."
              disabled={status !== 'connected'}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSendText}
              disabled={status !== 'connected' || !textInput.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
            <button
              onClick={handleClearMessages}
              disabled={messages.length === 0}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      <div className="w-full md:w-96 flex-shrink-0 bg-gray-50 border-l border-gray-200 p-6 flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Configuration</h2>
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="text-sm text-green-700 hover:text-green-800 font-medium"
          >
            {showAdvanced ? 'Hide Raw JSON' : 'Show Raw JSON'}
          </button>
        </div>

        <div className="space-y-4 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deployment / Model</label>
            <input
              type="text"
              value={config.deploymentOrModel}
              onChange={(e) => setConfig((current) => ({ ...current, deploymentOrModel: e.target.value }))}
              disabled={controlsDisabled}
              placeholder="gpt-realtime or your Azure deployment name"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Azure GA Realtime now uses `/openai/v1/realtime`. Keep using your deployment name here.
            </p>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Voice Preset</label>
            <select
              value={selectedVoiceOption}
              onChange={(e) =>
                setConfig((current) => ({
                  ...current,
                  voice: e.target.value === '__custom__' ? current.voice : e.target.value,
                }))
              }
              disabled={controlsDisabled}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
            >
              {VOICE_OPTIONS.map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label}
                </option>
              ))}
              <option value="__custom__">Custom Voice ID</option>
            </select>
            <input
              type="text"
              value={config.voice}
              onChange={(e) => setConfig((current) => ({ ...current, voice: e.target.value }))}
              disabled={controlsDisabled}
              placeholder="alloy"
              className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Output Modalities</label>
            <div className="flex gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="gpt-realtime-output-modality"
                  checked={config.outputModalities.includes('audio')}
                  onChange={() => toggleOutputModality('audio')}
                  disabled={controlsDisabled}
                  className="border-gray-300 text-green-600 focus:ring-green-500"
                />
                Audio
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="gpt-realtime-output-modality"
                  checked={config.outputModalities.includes('text')}
                  onChange={() => toggleOutputModality('text')}
                  disabled={controlsDisabled}
                  className="border-gray-300 text-green-600 focus:ring-green-500"
                />
                Text
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Azure GA Realtime currently accepts one assistant output modality at a time here.
              Choosing `audio` still lets this playground render the assistant transcript from audio
              transcript events when the service sends them.
            </p>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => setConfig((current) => ({ ...current, systemPrompt: e.target.value }))}
              disabled={controlsDisabled}
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 resize-none font-mono"
            />
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.transcriptionEnabled}
                onChange={(e) =>
                  setConfig((current) => ({ ...current, transcriptionEnabled: e.target.checked }))
                }
                disabled={controlsDisabled}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm font-medium text-gray-700">Enable Input Transcription</span>
            </label>
            {config.transcriptionEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transcription Model / Deployment
                  </label>
                  <input
                    type="text"
                    value={config.transcriptionModel}
                    onChange={(e) =>
                      setConfig((current) => ({ ...current, transcriptionModel: e.target.value }))
                    }
                    disabled={controlsDisabled}
                    placeholder="Your Azure transcription deployment name"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to skip built-in input transcription. Azure Realtime expects a
                    deployment name here, not the bare model ID.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language Hint</label>
                  <input
                    type="text"
                    value={config.transcriptionLanguage}
                    onChange={(e) =>
                      setConfig((current) => ({ ...current, transcriptionLanguage: e.target.value }))
                    }
                    disabled={controlsDisabled}
                    placeholder="en, zh-CN, ja..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transcription Prompt</label>
                  <textarea
                    value={config.transcriptionPrompt}
                    onChange={(e) =>
                      setConfig((current) => ({ ...current, transcriptionPrompt: e.target.value }))
                    }
                    disabled={controlsDisabled}
                    rows={3}
                    placeholder="Optional transcript bias prompt"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 resize-none font-mono"
                  />
                </div>
              </>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Turn Detection</label>
              <select
                value={config.turnDetectionMode}
                onChange={(e) =>
                  setConfig((current) => ({
                    ...current,
                    turnDetectionMode: e.target.value as TurnDetectionMode,
                  }))
                }
                disabled={controlsDisabled}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
              >
                <option value="server_vad">server_vad</option>
                <option value="semantic_vad">semantic_vad</option>
                <option value="off">off (manual / raw control)</option>
              </select>
            </div>

            {config.turnDetectionMode !== 'off' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Threshold</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.vadThreshold}
                      onChange={(e) =>
                        setConfig((current) => ({
                          ...current,
                          vadThreshold: parseFloat(e.target.value),
                        }))
                      }
                      disabled={controlsDisabled || config.turnDetectionMode !== 'server_vad'}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Idle Timeout (ms)</label>
                    <input
                      type="number"
                      min="0"
                      value={config.vadIdleTimeoutMs}
                      onChange={(e) =>
                        setConfig((current) => ({ ...current, vadIdleTimeoutMs: e.target.value }))
                      }
                      disabled={controlsDisabled}
                      placeholder="Optional"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prefix Padding (ms)</label>
                    <input
                      type="number"
                      min="0"
                      value={config.vadPrefixPaddingMs}
                      onChange={(e) =>
                        setConfig((current) => ({
                          ...current,
                          vadPrefixPaddingMs: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      disabled={controlsDisabled || config.turnDetectionMode !== 'server_vad'}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Silence Duration (ms)</label>
                    <input
                      type="number"
                      min="0"
                      value={config.vadSilenceDurationMs}
                      onChange={(e) =>
                        setConfig((current) => ({
                          ...current,
                          vadSilenceDurationMs: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                      disabled={controlsDisabled || config.turnDetectionMode !== 'server_vad'}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.vadCreateResponse}
                    onChange={(e) =>
                      setConfig((current) => ({ ...current, vadCreateResponse: e.target.checked }))
                    }
                    disabled={controlsDisabled}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">Auto-create response after speech end</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.vadInterruptResponse}
                    onChange={(e) =>
                      setConfig((current) => ({ ...current, vadInterruptResponse: e.target.checked }))
                    }
                    disabled={controlsDisabled}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">Allow barge-in interruption</span>
                </label>
              </>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Noise Reduction</label>
              <select
                value={config.noiseReduction}
                onChange={(e) =>
                  setConfig((current) => ({
                    ...current,
                    noiseReduction: e.target.value as NoiseReductionMode,
                  }))
                }
                disabled={controlsDisabled}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
              >
                <option value="off">Off</option>
                <option value="near_field">near_field</option>
                <option value="far_field">far_field</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reasoning Effort</label>
              <select
                value={config.reasoningEffort}
                onChange={(e) =>
                  setConfig((current) => ({
                    ...current,
                    reasoningEffort: e.target.value as ReasoningEffort,
                  }))
                }
                disabled={controlsDisabled}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
              >
                <option value="off">Off</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                `gpt-realtime-2` introduces reasoning in speech workflows. Start with `low` if you need it.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Response Output Tokens</label>
              <div className="flex gap-2">
                <select
                  value={config.maxResponseOutputTokensMode}
                  onChange={(e) =>
                    setConfig((current) => ({
                      ...current,
                      maxResponseOutputTokensMode: e.target.value as 'inf' | 'custom',
                    }))
                  }
                  disabled={controlsDisabled}
                  className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                >
                  <option value="inf">inf</option>
                  <option value="custom">custom</option>
                </select>
                <input
                  type="number"
                  min="1"
                  value={config.maxResponseOutputTokens}
                  onChange={(e) =>
                    setConfig((current) => ({ ...current, maxResponseOutputTokens: e.target.value }))
                  }
                  disabled={controlsDisabled || config.maxResponseOutputTokensMode !== 'custom'}
                  placeholder="4096"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
                />
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.showResponseLatency}
                onChange={(e) =>
                  setConfig((current) => ({ ...current, showResponseLatency: e.target.checked }))
                }
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm font-medium text-gray-700">Show Response Latency</span>
            </label>
          </div>

          {showAdvanced && (
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Raw Session JSON</label>
                <textarea
                  value={config.rawSessionJson}
                  onChange={(e) =>
                    setConfig((current) => ({ ...current, rawSessionJson: e.target.value }))
                  }
                  disabled={controlsDisabled}
                  rows={8}
                  placeholder={`{\n  "tool_choice": "auto",\n  "tools": [],\n  "prompt": { "id": "..." }\n}`}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 resize-y font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Raw Response JSON</label>
                <textarea
                  value={config.rawResponseJson}
                  onChange={(e) =>
                    setConfig((current) => ({ ...current, rawResponseJson: e.target.value }))
                  }
                  disabled={controlsDisabled}
                  rows={6}
                  placeholder={`{\n  "conversation": "default"\n}`}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 resize-y font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use raw JSON for long-tail GA parameters such as `tools`, `tool_choice`, `prompt`,
                  `tracing`, or other newly shipped fields. Response JSON applies when the client sends
                  `response.create` itself, such as typed turns.
                </p>
              </div>
            </div>
          )}

          <div className="pt-2">
            {status !== 'connected' ? (
              <button
                onClick={handleConnect}
                disabled={!apiKey.trim() || !endpoint.trim() || status === 'connecting'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {status === 'connecting' ? 'Connecting...' : 'Connect'}
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                Disconnect
              </button>
            )}
          </div>

          {status === 'connected' && (
            <div className="pt-2">
              <button
                onClick={toggleRecording}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md transition-colors ${
                  isRecording
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                {isRecording ? 'Mute Microphone' : 'Unmute Microphone'}
              </button>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">About</h3>
            <p className="text-xs text-gray-600">
              Common `gpt-realtime-2` settings now have first-class controls here, and the raw JSON
              editors let you pass the remaining official session/response fields without waiting for
              another UI release.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
