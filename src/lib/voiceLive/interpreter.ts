import { AzureKeyCredential } from '@azure/core-auth';
import {
  VoiceLiveClient,
  type VoiceLiveSession,
  type VoiceLiveSubscription,
  type ServerEventResponseTextDelta,
  type ServerEventResponseTextDone,
  type ServerEventResponseDone,
  type ServerEventResponseCreated,
  type ServerEventResponseAudioDelta,
  type ServerEventConversationItemInputAudioTranscriptionDelta,
  type ServerEventConversationItemInputAudioTranscriptionCompleted,
  type ServerEventError,
  type VoiceLiveSessionHandlers,
} from '@azure/ai-voicelive';
import type { VoiceLiveConfig } from './defaults';
import { inferPcmSampleRateFromOutputFormat, toRequestSession, MODEL_OPTIONS } from './defaults';
import { Pcm16Player } from './audio/pcmPlayer';
import type { TurnMetrics, Totals, VoiceLiveTier } from './metrics';
import { addUsage, EMPTY_TOTALS, calculateTurnCostBreakdown } from './metrics';

export type SessionLogLevel = 'info' | 'user' | 'input' | 'output' | 'error';

export type DebugCategory =
  | 'conversation'
  | 'server_event'
  | 'client_event'
  | 'token_usage'
  | 'cost'
  | 'latency'
  | 'vad'
  | 'asr'
  | 'session'
  | 'error';

export const DEBUG_CATEGORIES: { key: DebugCategory; label: string; color: string }[] = [
  { key: 'conversation', label: 'Conversation', color: 'bg-blue-500' },
  { key: 'server_event', label: 'Server Events', color: 'bg-purple-500' },
  { key: 'client_event', label: 'Client Events', color: 'bg-orange-500' },
  { key: 'token_usage', label: 'Token Usage', color: 'bg-teal-500' },
  { key: 'cost', label: 'Cost', color: 'bg-yellow-500' },
  { key: 'latency', label: 'Latency', color: 'bg-pink-500' },
  { key: 'vad', label: 'VAD', color: 'bg-indigo-500' },
  { key: 'asr', label: 'ASR', color: 'bg-sky-500' },
  { key: 'session', label: 'Session', color: 'bg-gray-500' },
  { key: 'error', label: 'Error', color: 'bg-red-500' },
];

export type HighlightColor = 'amber' | 'green';

export type SessionLogItem = {
  id: string;
  ts: number;
  level: SessionLogLevel;
  text: string;
  category: DebugCategory;
  detail?: string;
  highlight?: boolean;
  highlightColor?: HighlightColor;
  e2eMs?: number;
};

export type InterpreterState = {
  isConnected: boolean;
  isMicOn: boolean;
  logs: SessionLogItem[];
  turns: TurnMetrics[];
  totals: Totals;
};

export type InterpreterEvents = {
  onState: (next: InterpreterState) => void;
};

type TurnState = {
  metrics: TurnMetrics;
  textBuffer: string;
  ttsLogged?: boolean;
};

export class VoiceLiveInterpreter {
  private client?: VoiceLiveClient;
  private session?: VoiceLiveSession;
  private subscription?: VoiceLiveSubscription;

  private state: InterpreterState = {
    isConnected: false,
    isMicOn: false,
    logs: [],
    turns: [],
    totals: EMPTY_TOTALS,
  };

  private readonly turnMap = new Map<string, TurnState>();
  private readonly pcmPlayer = new Pcm16Player();
  private outputSampleRateHz = 24000;
  private currentSpeechStartMs = 0;
  private currentSpeechStopMs = 0;
  private pricingTier: VoiceLiveTier = 'standard';
  private voiceProvider: 'openai' | 'azure-standard' = 'azure-standard';
  private audioChunkTracker = new Map<string, { count: number; totalBytes: number }>();

  private readonly events: InterpreterEvents;

  constructor(events: InterpreterEvents) {
    this.events = events;
  }

  get snapshot(): InterpreterState {
    return this.state;
  }

  resetStats() {
    this.setState({ logs: [], turns: [], totals: EMPTY_TOTALS });
  }

  private setState(patch: Partial<InterpreterState>) {
    this.state = { ...this.state, ...patch };
    this.events.onState(this.state);
  }

  private currentPlaybackResponseId: string | null = null;

  private log(level: SessionLogLevel, text: string, category: DebugCategory = 'session', detail?: string, highlight?: boolean, highlightColor?: HighlightColor): SessionLogItem {
    const item: SessionLogItem = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ts: Date.now(),
      level,
      text,
      category,
      detail,
      highlight,
      highlightColor: highlight ? (highlightColor ?? 'amber') : undefined,
    };
    const next = [...this.state.logs, item].slice(-2000);
    this.setState({ logs: next });
    return item;
  }

  private formatTime(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  async connect(config: VoiceLiveConfig) {
    if (this.state.isConnected) return;

    if (!config.endpoint.trim()) throw new Error('Missing endpoint');
    if (!config.apiKey.trim()) throw new Error('Missing API key');

    // Store pricing info for per-turn cost calculation
    const modelOption = MODEL_OPTIONS.find((m) => m.id === config.model);
    this.pricingTier = modelOption?.tier === 'basic' ? 'standard' : (modelOption?.tier as VoiceLiveTier) ?? 'standard';
    this.voiceProvider = config.voiceProvider;

    this.log('info', 'Connecting...', 'session');

    this.client = new VoiceLiveClient(config.endpoint.trim(), new AzureKeyCredential(config.apiKey.trim()), {
      apiVersion: '2025-10-01',
      defaultSessionOptions: { enableDebugLogging: false },
    });

    const sessionConfig = toRequestSession(config);
    this.outputSampleRateHz = inferPcmSampleRateFromOutputFormat(sessionConfig.outputAudioFormat);

    this.log('info', '[client] session.start', 'client_event',
      `model: ${config.model}\nasrModel: ${config.asrModel}\nvoice: ${config.voiceProvider}/${config.voiceName}\nturnDetection: ${config.turnDetectionType}`);

    this.session = await this.client.startSession(sessionConfig, { connectionTimeoutInMs: 30000 });

    await this.pcmPlayer.resume();

    const handlers: VoiceLiveSessionHandlers = {
      onConnected: async (_args, ctx) => {
        console.log('[VoiceLive Event] onConnected', { args: _args, context: ctx });
        this.log('info', `Connected (sessionId=${ctx.sessionId ?? 'n/a'})`, 'session');
        this.log('info', '[server] session.connected', 'server_event',
          `sessionId: ${ctx.sessionId ?? 'n/a'}`);
      },
      onDisconnected: async (args) => {
        console.log('[VoiceLive Event] onDisconnected', args);
        this.log('info', `Disconnected (code=${args.code} reason=${args.reason})`, 'session');
        this.log('info', '[server] session.disconnected', 'server_event',
          `code: ${args.code}\nreason: ${args.reason}`);
      },
      onServerError: async (event: ServerEventError) => {
        console.log('[VoiceLive Event] onServerError', event);
        this.log('error', `Server error: ${event.error.message}`, 'error');
        this.log('info', '[server] error', 'server_event',
          `type: ${event.error.type}\nmessage: ${event.error.message}\ncode: ${event.error.code ?? 'n/a'}`);
      },
      onConversationItemInputAudioTranscriptionDelta: async (
        event: ServerEventConversationItemInputAudioTranscriptionDelta
      ) => {
        console.log('[VoiceLive Event] onConversationItemInputAudioTranscriptionDelta', event);
        if (event.delta) {
          this.log('info', `[ASR delta] ${event.delta}`, 'asr');
          this.log('info', '[server] conversation.item.input_audio_transcription.delta', 'server_event',
            `delta: "${event.delta}"\nitemId: ${(event as any).itemId ?? 'n/a'}\ncontentIndex: ${(event as any).contentIndex ?? 'n/a'}`);
        }
      },
      onConversationItemInputAudioTranscriptionCompleted: async (
        event: ServerEventConversationItemInputAudioTranscriptionCompleted
      ) => {
        console.log('[VoiceLive Event] onConversationItemInputAudioTranscriptionCompleted', event);
        this.log('input', `🎤 ${event.transcript}`, 'conversation');
        this.log('info', `[ASR done] ${event.transcript}`, 'asr');
        this.log('info', '[server] conversation.item.input_audio_transcription.completed', 'server_event',
          `transcript: "${event.transcript}"\nitemId: ${(event as any).itemId ?? 'n/a'}`);
      },
      onInputAudioBufferSpeechStarted: async () => {
        console.log('[VoiceLive Event] onInputAudioBufferSpeechStarted');
        this.currentSpeechStartMs = Date.now();
        this.log('info', 'Speech detected', 'vad');
        this.log('info', '[server] input_audio_buffer.speech_started', 'server_event');
      },
      onInputAudioBufferSpeechStopped: async () => {
        console.log('[VoiceLive Event] onInputAudioBufferSpeechStopped');
        this.currentSpeechStopMs = Date.now();
        const duration = this.currentSpeechStartMs > 0
          ? this.currentSpeechStopMs - this.currentSpeechStartMs
          : 0;
        this.log('info', `Speech stopped (duration: ${duration}ms)`, 'vad');
        this.log('info', `[server] input_audio_buffer.speech_stopped - User finished speaking (${duration}ms)`, 'server_event',
          `speechDuration: ${duration}ms`, true, 'green');
      },
      onResponseCreated: async (event: ServerEventResponseCreated) => {
        console.log('[VoiceLive Event] onResponseCreated', event);
        const responseId = event.response.id ?? `resp_${Date.now()}`;
        const metrics: TurnMetrics = {
          responseId,
          startedAtMs: Date.now(),
          speechStartedAtMs: this.currentSpeechStartMs,
          speechStoppedAtMs: this.currentSpeechStopMs,
        };
        this.turnMap.set(responseId, { metrics, textBuffer: '' });
        this.audioChunkTracker.set(responseId, { count: 0, totalBytes: 0 });

        // Prepare per-turn playback tracking
        this.currentPlaybackResponseId = responseId;
        this.pcmPlayer.markNewUtterance();
        this.pcmPlayer.setPlaybackStartCallback((actualStartTime) => {
          const turn = this.turnMap.get(responseId);
          if (turn) {
            const now = performance.now();
            const bufferDelay = Math.round(Math.max(0, actualStartTime - now));
            turn.metrics.audioBufferDelayMs = bufferDelay;
            turn.metrics.playbackStartedAtMs = Date.now() + bufferDelay;

            if (turn.metrics.speechStoppedAtMs) {
              turn.metrics.e2eLatencyMs = turn.metrics.playbackStartedAtMs - turn.metrics.speechStoppedAtMs;
            }

            this.turnMap.set(responseId, turn);

            this.log('info',
              `Audio playback starts in ${bufferDelay}ms (user hears audio then)`,
              'server_event', undefined, true);
          }
        });

        this.log('info', '[server] response.created', 'server_event',
          `responseId: ${responseId}\nstatus: ${(event.response as any).status ?? 'n/a'}`);
      },
      onResponseTextDelta: async (event: ServerEventResponseTextDelta) => {
        console.log('[VoiceLive Event] onResponseTextDelta', event);
        const turn = this.turnMap.get(event.responseId);
        if (!turn) return;

        if (!turn.metrics.firstTextDeltaAtMs) {
          turn.metrics.firstTextDeltaAtMs = Date.now();
          turn.metrics.firstTokenLatencyMs = turn.metrics.firstTextDeltaAtMs - turn.metrics.startedAtMs;
        }

        turn.textBuffer += event.delta;
        this.turnMap.set(event.responseId, turn);
        this.events.onState(this.state);

        this.log('info', '[server] response.text.delta', 'server_event',
          `responseId: ${event.responseId}\ndelta: "${event.delta}"`);
      },
      onResponseTextDone: async (event: ServerEventResponseTextDone) => {
        console.log('[VoiceLive Event] onResponseTextDone', event);
        const responseId = event.responseId;
        const turn = this.turnMap.get(responseId);

        const text = (event.text ?? '').trim();
        if (!text) return;

        if (turn) {
          turn.textBuffer = text;
          turn.ttsLogged = true;
          this.turnMap.set(responseId, turn);
        }

        this.log('output', `🔊 ${text}`, 'conversation');
        this.log('info', '[server] response.text.done', 'server_event',
          `responseId: ${responseId}\ntext: "${text}"`);
      },
      onResponseAudioDelta: async (event: ServerEventResponseAudioDelta) => {
        console.log('[VoiceLive Event] onResponseAudioDelta', {
          ...event,
          delta: event.delta instanceof Uint8Array ? `Uint8Array(${event.delta.length})` : event.delta,
        });
        const chunk = event.delta;
        if (chunk instanceof Uint8Array) {
          const turn = this.turnMap.get(event.responseId);
          if (turn && !turn.metrics.firstAudioDeltaAtMs) {
            const now = Date.now();
            turn.metrics.firstAudioDeltaAtMs = now;

            if (turn.metrics.speechStartedAtMs) {
              turn.metrics.startLatencyMs = now - turn.metrics.speechStartedAtMs;
            }

            if (turn.metrics.speechStoppedAtMs) {
              turn.metrics.endLatencyMs = now - turn.metrics.speechStoppedAtMs;
            }

            this.turnMap.set(event.responseId, turn);

            this.log('info', '[server] response.audio.delta (first chunk) - AI starts streaming audio', 'server_event',
              `responseId: ${event.responseId}\nchunkSize: ${chunk.length} bytes\nNote: User hears audio ~50ms later (player buffer delay)`);
          }

          // Track audio chunks for summary
          const tracker = this.audioChunkTracker.get(event.responseId);
          if (tracker) {
            tracker.count++;
            tracker.totalBytes += chunk.length;
          }

          this.pcmPlayer.enqueuePcm16(chunk, this.outputSampleRateHz);
        }
      },
      onResponseDone: async (event: ServerEventResponseDone) => {
        console.log('[VoiceLive Event] onResponseDone', event);
        const responseId = event.response.id ?? 'unknown';
        const turn = this.turnMap.get(responseId);
        const finishedAtMs = Date.now();

        // Log audio chunk summary
        const audioTracker = this.audioChunkTracker.get(responseId);
        if (audioTracker && audioTracker.count > 0) {
          this.log('info', `[server] response.audio.delta summary: ${audioTracker.count} chunks, ${(audioTracker.totalBytes / 1024).toFixed(1)} KB`, 'server_event');
        }
        this.audioChunkTracker.delete(responseId);

        this.log('info', '[server] response.done', 'server_event',
          `responseId: ${responseId}\nstatus: ${(event.response as any).status ?? 'n/a'}\noutputItems: ${event.response.output?.length ?? 0}`);

        if (turn) {
          turn.metrics.finishedAtMs = finishedAtMs;
          turn.metrics.latencyMs = finishedAtMs - turn.metrics.startedAtMs;
          turn.metrics.assistantText = turn.textBuffer.trim();
          turn.metrics.usage = event.response.usage;

          const turnNumber = this.state.turns.length + 1;
          const nextTurns = [...this.state.turns, turn.metrics];
          let nextTotals = { ...this.state.totals };
          nextTotals.turns = nextTotals.turns + 1;

          if (turn.metrics.startLatencyMs) {
            nextTotals.startLatencies = [...nextTotals.startLatencies, turn.metrics.startLatencyMs];
          }
          if (turn.metrics.endLatencyMs) {
            nextTotals.endLatencies = [...nextTotals.endLatencies, turn.metrics.endLatencyMs];
          }
          if (turn.metrics.e2eLatencyMs) {
            nextTotals.e2eLatencies = [...nextTotals.e2eLatencies, turn.metrics.e2eLatencyMs];
          }

          if (event.response.usage) {
            nextTotals = addUsage(nextTotals, event.response.usage);
            nextTotals.cachedAudioSeconds = nextTotals.cachedAudioTokens / 10;
          }

          this.setState({ turns: nextTurns, totals: nextTotals });

          // Latency detail log with full timeline and calculation
          const m = turn.metrics;
          const fmt = (ms: number | undefined) => ms != null ? `${ms}ms` : '-';
          const fmtTime = (ms: number | undefined) => ms != null ? this.formatTime(ms) : '-';

          const e2eLabel = m.e2eLatencyMs != null
            ? `E2E Latency: ${m.e2eLatencyMs}ms  (speech stopped -> user hears audio)`
            : `E2E Latency: -  (playback timing not captured)`;

          const latencyLines = [
            `Turn #${turnNumber} (${responseId})`,
            ``,
            `Timeline:`,
            `  Speech started at:     ${fmtTime(m.speechStartedAtMs)}`,
            `  Speech stopped at:     ${fmtTime(m.speechStoppedAtMs)}`,
            `  Response created at:   ${fmtTime(m.startedAtMs)}`,
            m.firstTextDeltaAtMs ? `  First text delta at:   ${fmtTime(m.firstTextDeltaAtMs)}` : null,
            m.firstAudioDeltaAtMs ? `  First audio delta at:  ${fmtTime(m.firstAudioDeltaAtMs)}  << AI starts streaming audio` : null,
            m.playbackStartedAtMs ? `  Audio playback at:     ${fmtTime(m.playbackStartedAtMs)}  << User hears audio (+${m.audioBufferDelayMs ?? 50}ms buffer)` : null,
            `  Response done at:      ${fmtTime(m.finishedAtMs)}`,
            ``,
            `Latency breakdown:`,
            m.speechStartedAtMs && m.speechStoppedAtMs
              ? `  Speech duration:                  ${m.speechStoppedAtMs - m.speechStartedAtMs}ms  (speech stopped - speech started)`
              : null,
            m.firstTextDeltaAtMs
              ? `  Response -> First text:           ${m.firstTextDeltaAtMs - m.startedAtMs}ms  (first text delta - response created)`
              : null,
            m.firstAudioDeltaAtMs
              ? `  Response -> First audio chunk:    ${m.firstAudioDeltaAtMs - m.startedAtMs}ms  (first audio delta - response created)`
              : null,
            m.audioBufferDelayMs != null
              ? `  Audio buffer delay:               ${m.audioBufferDelayMs}ms  (player initial buffer before playback)`
              : null,
            m.speechStoppedAtMs && m.firstAudioDeltaAtMs
              ? `  Speech end -> First audio chunk:  ${m.endLatencyMs}ms  (first audio delta - speech stopped)`
              : null,
            ``,
            `  >>> ${e2eLabel}`,
            `      = audio playback time - speech stopped time`,
            m.playbackStartedAtMs && m.speechStoppedAtMs
              ? `      = ${fmtTime(m.playbackStartedAtMs)} - ${fmtTime(m.speechStoppedAtMs)} = ${m.e2eLatencyMs}ms`
              : null,
            ``,
            `  Total response time:              ${fmt(m.latencyMs)}  (response done - response created)`,
            m.speechStartedAtMs && m.firstAudioDeltaAtMs
              ? `  Speech start -> First audio:      ${fmt(m.startLatencyMs)}  (first audio delta - speech started)`
              : null,
          ].filter(Boolean).join('\n');

          const latencyLogItem = this.log('info', `Latency - Turn #${turnNumber}: E2E (speech stopped -> user hears audio)`, 'latency', latencyLines);
          latencyLogItem.e2eMs = m.e2eLatencyMs;

          if (!turn.ttsLogged) {
            let ttsText = '(no text)';
            if (event.response.output && event.response.output.length > 0) {
              const outputItem: any = event.response.output[0];
              if (outputItem?.content && Array.isArray(outputItem.content)) {
                const textContent = outputItem.content.find((c: any) => c.type === 'audio' && c.transcript);
                if (textContent?.transcript) {
                  ttsText = textContent.transcript;
                }
              }
            }
            this.log('output', `🔊 ${ttsText}`, 'conversation');
          }

          if (event.response.usage) {
            const u = event.response.usage;
            const tokenLines = [
              `Turn #${turnNumber} (${responseId})`,
              `  Input text tokens:   ${u.inputTokenDetails.textTokens}`,
              `  Input audio tokens:  ${u.inputTokenDetails.audioTokens} (${(u.inputTokenDetails.audioTokens / 10).toFixed(1)}s)`,
              `  Cached text tokens:  ${u.inputTokenDetails.cachedTokensDetails.textTokens}`,
              `  Cached audio tokens: ${u.inputTokenDetails.cachedTokensDetails.audioTokens} (${(u.inputTokenDetails.cachedTokensDetails.audioTokens / 10).toFixed(1)}s)`,
              `  Output text tokens:  ${u.outputTokenDetails.textTokens}`,
              `  Output audio tokens: ${u.outputTokenDetails.audioTokens} (${(u.outputTokenDetails.audioTokens / 20).toFixed(1)}s)`,
              `  Total: input=${u.inputTokens} output=${u.outputTokens} total=${u.totalTokens}`,
            ].join('\n');
            this.log('info',
              `Tokens - Turn #${turnNumber}: in=${u.inputTokens} out=${u.outputTokens} total=${u.totalTokens}`,
              'token_usage', tokenLines);

            // Cost detail log with full calculation breakdown
            const cb = calculateTurnCostBreakdown(u, this.pricingTier, this.voiceProvider);
            const voiceType = this.voiceProvider === 'openai' ? 'native-audio' : 'azure-standard';
            const fmtCost = (v: number) => v > 0 ? `$${v.toFixed(8)}` : '$0';
            const costLines = [
              `Turn #${turnNumber} (${responseId})`,
              `Pricing: tier=${this.pricingTier}, voice=${voiceType}`,
              ``,
              `Category         Tokens    Rate ($/1M)    Cost`,
              `-------          ------    -----------    --------`,
              `Input text:      ${String(cb.inputText.tokens).padEnd(9)} $${String(cb.inputText.rate.toFixed(2)).padEnd(13)} ${fmtCost(cb.inputText.cost)}`,
              `Input audio:     ${String(cb.inputAudio.tokens).padEnd(9)} $${String(cb.inputAudio.rate.toFixed(2)).padEnd(13)} ${fmtCost(cb.inputAudio.cost)}`,
              `Cached text:     ${String(cb.cachedText.tokens).padEnd(9)} $${String(cb.cachedText.rate.toFixed(2)).padEnd(13)} ${fmtCost(cb.cachedText.cost)}`,
              `Cached audio:    ${String(cb.cachedAudio.tokens).padEnd(9)} $${String(cb.cachedAudio.rate.toFixed(2)).padEnd(13)} ${fmtCost(cb.cachedAudio.cost)}`,
              `Output text:     ${String(cb.outputText.tokens).padEnd(9)} $${String(cb.outputText.rate.toFixed(2)).padEnd(13)} ${fmtCost(cb.outputText.cost)}`,
              `Output audio:    ${String(cb.outputAudio.tokens).padEnd(9)} $${String(cb.outputAudio.rate.toFixed(2)).padEnd(13)} ${fmtCost(cb.outputAudio.cost)}`,
              `-------          ------                   --------`,
              `Total:                                    $${cb.total.toFixed(8)}`,
              ``,
              `Formula: cost = (tokens / 1,000,000) * rate`,
            ].join('\n');
            this.log('info',
              `Cost - Turn #${turnNumber}: $${cb.total.toFixed(6)} (tier=${this.pricingTier}, voice=${voiceType})`,
              'cost', costLines);
          }
        } else {
          this.log('info', `Response done (${responseId})`, 'session');
        }

        this.turnMap.delete(responseId);
      },
      onError: async (args) => {
        console.log('[VoiceLive Event] onError', args);
        this.log('error', `${args.context}: ${args.error.message}`, 'error');
      },
    };

    this.subscription = this.session.subscribe(handlers);

    this.log('info', '[client] session.update', 'client_event',
      JSON.stringify(sessionConfig, null, 2));

    await this.session.updateSession(sessionConfig);

    this.setState({
      isConnected: true,
      totals: { ...this.state.totals, sessionStartMs: Date.now() },
    });
    this.log('info', `Session configured (model=${config.model})`, 'session');
  }

  async disconnect() {
    this.setState({ isMicOn: false });

    try {
      this.pcmPlayer.stop();
      await this.subscription?.close();
      this.subscription = undefined;

      await this.session?.dispose();
      this.session = undefined;

      this.client = undefined;
    } finally {
      this.turnMap.clear();
      this.audioChunkTracker.clear();
      this.setState({ isConnected: false });
      this.log('info', 'Disconnected', 'session');
    }
  }

  async applyConfig(config: VoiceLiveConfig) {
    if (!this.session) throw new Error('Not connected');
    const sessionConfig = toRequestSession(config);
    this.outputSampleRateHz = inferPcmSampleRateFromOutputFormat(sessionConfig.outputAudioFormat);

    // Update pricing info
    const modelOption = MODEL_OPTIONS.find((m) => m.id === config.model);
    this.pricingTier = modelOption?.tier === 'basic' ? 'standard' : (modelOption?.tier as VoiceLiveTier) ?? 'standard';
    this.voiceProvider = config.voiceProvider;

    this.log('info', '[client] session.update', 'client_event',
      JSON.stringify(sessionConfig, null, 2));

    await this.session.updateSession(sessionConfig);
    this.log('info', 'Session updated', 'session');
  }

  async sendText(text: string) {
    if (!this.session) throw new Error('Not connected');
    const trimmed = text.trim();
    if (!trimmed) return;

    this.log('user', trimmed, 'conversation');

    this.log('info', '[client] conversation.item.create', 'client_event',
      `role: user\ncontent: input_text\ntext: "${trimmed}"`);

    await this.session.addConversationItem({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: trimmed }],
    } as any);

    this.log('info', '[client] response.create', 'client_event',
      `modalities: text, audio`);

    await this.session.sendEvent({
      type: 'response.create',
      response: { modalities: ['text', 'audio'] },
    });
  }

  async sendMicPcmChunk(pcm16leBytes: Uint8Array) {
    if (!this.session) return;
    await this.session.sendAudio(pcm16leBytes);
  }
}
