// GPT Realtime API Client using WebSocket
// Supports Azure OpenAI GA Realtime and OpenAI Realtime endpoints.

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RealtimeSessionPatch = Record<string, unknown>;
export type RealtimeResponsePatch = Record<string, unknown>;

export interface GptRealtimeClientConfig {
  apiKey: string;
  endpoint: string;
  deploymentOrModel: string;
  isAzure: boolean;
  session: RealtimeSessionPatch;
  response?: RealtimeResponsePatch;
  onAudioData: (audioData: ArrayBuffer) => void;
  onOutputTranscript: (text: string, isDelta: boolean) => void;
  onInputTranscript: (text: string, isDelta: boolean) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onUserSpeechStarted?: () => void;
  onError: (error: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onLatencyMeasured?: (latencyMs: number) => void;
}

type RealtimeServerEvent = Record<string, unknown>;

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

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export class GptRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly config: GptRealtimeClientConfig;

  private userSpeechEndTime: number | null = null;
  private firstAudioReceived = false;

  private currentResponseId: string | null = null;
  private currentAssistantItemId: string | null = null;
  private currentAssistantContentIndex = 0;
  private hasAudioTranscriptForCurrentResponse = false;

  constructor(config: GptRealtimeClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.config.onStatusChange('connecting');

    try {
      const wsUrl = this.getWebSocketUrl();
      console.log('[GPT Realtime] Connecting to:', wsUrl);

      const protocols = this.config.isAzure
        ? undefined
        : ['realtime', `openai-insecure-api-key.${this.config.apiKey}`, 'openai-beta.realtime-v1'];

      this.ws = new WebSocket(wsUrl, protocols);

      this.ws.onopen = () => {
        console.log('[GPT Realtime] WebSocket connected');
        this.sendSessionUpdate();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeServerEvent;
          this.handleServerEvent(data);
        } catch (err) {
          console.error('[GPT Realtime] Failed to parse message:', err);
        }
      };

      this.ws.onerror = (event) => {
        console.error('[GPT Realtime] WebSocket error:', event);
        this.config.onError('WebSocket connection error');
        this.config.onStatusChange('error');
      };

      this.ws.onclose = (event) => {
        console.log('[GPT Realtime] WebSocket closed:', event.code, event.reason);
        this.currentResponseId = null;
        this.currentAssistantItemId = null;
        this.currentAssistantContentIndex = 0;
        this.hasAudioTranscriptForCurrentResponse = false;
        this.config.onStatusChange('disconnected');
      };
    } catch (error) {
      console.error('[GPT Realtime] Connection failed:', error);
      this.config.onError(`Failed to connect: ${error}`);
      this.config.onStatusChange('error');
      throw error;
    }
  }

  markSpeechEnd(): void {
    this.userSpeechEndTime = performance.now();
    this.firstAudioReceived = false;
  }

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const session = mergeObjects<Record<string, unknown>>(
      {
        type: 'realtime',
      },
      this.config.session,
    );

    this.ws.send(
      JSON.stringify({
        type: 'session.update',
        session,
      }),
    );
    console.log('[GPT Realtime] Session update sent:', session);
  }

  private sendResponseCreate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const response = this.config.response ? mergeObjects({}, this.config.response) : {};
    if (Object.keys(response).length > 0) {
      this.ws.send(JSON.stringify({ type: 'response.create', response }));
      return;
    }

    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  private captureAssistantLocation(event: RealtimeServerEvent): void {
    const itemId = event.item_id;
    if (typeof itemId === 'string' && itemId) {
      this.currentAssistantItemId = itemId;
    }

    const contentIndex = event.content_index;
    if (typeof contentIndex === 'number') {
      this.currentAssistantContentIndex = contentIndex;
    }
  }

  private handleServerEvent(event: RealtimeServerEvent): void {
    const type = event.type as string;

    switch (type) {
      case 'session.created':
        console.log('[GPT Realtime] Session created');
        this.config.onStatusChange('connected');
        break;

      case 'session.updated':
        console.log('[GPT Realtime] Session updated');
        break;

      case 'conversation.item.created': {
        const item = event.item;
        if (isPlainObject(item) && item.role === 'assistant' && typeof item.id === 'string') {
          this.currentAssistantItemId = item.id;
        }
        break;
      }

      case 'response.created': {
        const response = event.response;
        if (isPlainObject(response) && typeof response.id === 'string') {
          this.currentResponseId = response.id;
        } else {
          this.currentResponseId = null;
        }
        this.hasAudioTranscriptForCurrentResponse = false;
        break;
      }

      case 'input_audio_buffer.speech_started':
        console.log('[GPT Realtime] User speech started');
        this.config.onUserSpeechStarted?.();
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('[GPT Realtime] User speech stopped');
        this.userSpeechEndTime = performance.now();
        this.firstAudioReceived = false;
        break;

      case 'conversation.item.input_audio_transcription.delta': {
        const delta = event.delta;
        if (typeof delta === 'string' && delta) {
          this.config.onInputTranscript(delta, true);
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = event.transcript;
        if (typeof transcript === 'string' && transcript) {
          this.config.onInputTranscript(transcript, false);
        }
        break;
      }

      case 'response.output_audio.delta':
      case 'response.audio.delta': {
        this.captureAssistantLocation(event);
        const delta = event.delta;
        if (typeof delta === 'string' && delta) {
          if (!this.firstAudioReceived && this.userSpeechEndTime != null) {
            const latency = performance.now() - this.userSpeechEndTime;
            this.firstAudioReceived = true;
            this.config.onLatencyMeasured?.(latency);
          }

          this.config.onAudioData(decodeBase64ToArrayBuffer(delta));
        }
        break;
      }

      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        this.captureAssistantLocation(event);
        const delta = event.delta;
        if (typeof delta === 'string' && delta) {
          this.hasAudioTranscriptForCurrentResponse = true;
          this.config.onOutputTranscript(delta, true);
        }
        break;
      }

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        this.captureAssistantLocation(event);
        const transcript = event.transcript;
        if (typeof transcript === 'string' && transcript) {
          this.hasAudioTranscriptForCurrentResponse = true;
          this.config.onOutputTranscript(transcript, false);
        }
        break;
      }

      case 'response.output_text.delta':
      case 'response.text.delta': {
        const delta = event.delta;
        if (!this.hasAudioTranscriptForCurrentResponse && typeof delta === 'string' && delta) {
          this.config.onOutputTranscript(delta, true);
        }
        break;
      }

      case 'response.output_text.done':
      case 'response.text.done': {
        const text = event.text;
        if (!this.hasAudioTranscriptForCurrentResponse && typeof text === 'string' && text) {
          this.config.onOutputTranscript(text, false);
        }
        break;
      }

      case 'conversation.item.truncated':
        console.log('[GPT Realtime] Assistant item truncated');
        this.currentResponseId = null;
        this.currentAssistantItemId = null;
        this.currentAssistantContentIndex = 0;
        this.hasAudioTranscriptForCurrentResponse = false;
        this.config.onInterrupted();
        break;

      case 'response.done':
        console.log('[GPT Realtime] Response complete');
        this.currentResponseId = null;
        this.hasAudioTranscriptForCurrentResponse = false;
        this.config.onTurnComplete();
        break;

      case 'response.cancelled':
        console.log('[GPT Realtime] Response cancelled');
        this.currentResponseId = null;
        this.hasAudioTranscriptForCurrentResponse = false;
        this.config.onInterrupted();
        this.userSpeechEndTime = null;
        this.firstAudioReceived = false;
        break;

      case 'error': {
        const err = event.error;
        const errorMsg =
          isPlainObject(err) && typeof err.message === 'string' ? err.message : 'Unknown error';
        console.error('[GPT Realtime] Server error:', errorMsg);
        this.config.onError(errorMsg);
        break;
      }

      default:
        console.debug('[GPT Realtime] Unhandled event:', type);
        break;
    }
  }

  sendAudio(pcm16Data: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const uint8Array = new Uint8Array(pcm16Data);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }

    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: btoa(binary),
      }),
    );
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      }),
    );

    this.sendResponseCreate();
  }

  interruptResponse(audioEndMs: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.currentResponseId) {
      this.ws.send(
        JSON.stringify({
          type: 'response.cancel',
          response_id: this.currentResponseId,
        }),
      );
    } else {
      this.ws.send(JSON.stringify({ type: 'response.cancel' }));
    }

    if (this.currentAssistantItemId) {
      this.ws.send(
        JSON.stringify({
          type: 'conversation.item.truncate',
          item_id: this.currentAssistantItemId,
          content_index: this.currentAssistantContentIndex,
          audio_end_ms: Math.max(0, Math.round(audioEndMs)),
        }),
      );
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getWebSocketUrl(): string {
    if (this.config.isAzure) {
      const base = this.config.endpoint.replace(/\/$/, '');
      const host = base.replace(/^https?:\/\//, '');
      return `wss://${host}/openai/v1/realtime?model=${encodeURIComponent(this.config.deploymentOrModel)}&api-key=${encodeURIComponent(this.config.apiKey)}`;
    }

    return `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.deploymentOrModel)}`;
  }
}
