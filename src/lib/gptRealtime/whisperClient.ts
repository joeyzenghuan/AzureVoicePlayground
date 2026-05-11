// WebSocket client for GPT Realtime Whisper (transcription-only)
// Azure OpenAI endpoint: /openai/v1/realtime?deployment=...&intent=transcription&api-key=...

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WhisperClientConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  language?: string; // ISO 639-1 language code
  prompt?: string;   // Transcription prompt/context
  onTranscriptDelta: (delta: string) => void;
  onTranscriptDone: (finalText?: string) => void;
  onSpeechStarted: () => void;
  onError: (error: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

export class WhisperRealtimeClient {
  private ws: WebSocket | null = null;
  private config: WhisperClientConfig;

  constructor(config: WhisperClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.config.onStatusChange('connecting');

    try {
      const base = this.config.endpoint.replace(/\/$/, '');
      const host = base.replace(/^https?:\/\//, '');
      const wsUrl = `wss://${host}/openai/v1/realtime?deployment=${encodeURIComponent(this.config.deployment)}&intent=transcription&api-key=${encodeURIComponent(this.config.apiKey)}`;

      console.log('[Whisper Realtime] Connecting...');
      this.ws = new WebSocket(wsUrl, ['realtime']);

      this.ws.onopen = () => {
        console.log('[Whisper Realtime] WebSocket connected');
        this.sendSessionUpdate();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerEvent(data);
        } catch (err) {
          console.error('[Whisper Realtime] Failed to parse message:', err);
        }
      };

      this.ws.onerror = () => {
        this.config.onError('WebSocket connection error');
        this.config.onStatusChange('error');
      };

      this.ws.onclose = (event) => {
        console.log('[Whisper Realtime] WebSocket closed:', event.code, event.reason);
        this.config.onStatusChange('disconnected');
      };
    } catch (error) {
      this.config.onError(`Failed to connect: ${error}`);
      this.config.onStatusChange('error');
      throw error;
    }
  }

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const transcription: Record<string, string> = {
      model: this.config.deployment,
    };
    if (this.config.language) {
      transcription.language = this.config.language.toLowerCase();
    }
    if (this.config.prompt) {
      transcription.prompt = this.config.prompt;
    }

    const sessionConfig = {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: 24000,
            },
            transcription,
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        },
      },
    };

    this.ws.send(JSON.stringify(sessionConfig));
    console.log('[Whisper Realtime] Session update sent');
  }

  private handleServerEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case 'session.created':
        console.log('[Whisper Realtime] Session created');
        this.config.onStatusChange('connected');
        break;

      case 'session.updated':
        console.log('[Whisper Realtime] Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('[Whisper Realtime] Speech started');
        this.config.onSpeechStarted();
        break;

      case 'session.input_transcript.delta':
      case 'conversation.item.input_audio_transcription.delta': {
        const delta = (event as any).delta as string;
        if (delta) {
          this.config.onTranscriptDelta(delta);
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = (event as any).transcript as string;
        this.config.onTranscriptDone(transcript || undefined);
        break;
      }

      case 'response.done':
      case 'session.closed':
        this.config.onTranscriptDone();
        break;

      case 'error': {
        const errorMsg = (event as any).error?.message || JSON.stringify((event as any).error);
        console.error('[Whisper Realtime] Server error:', errorMsg);
        this.config.onError(errorMsg);
        break;
      }

      default:
        console.debug('[Whisper Realtime] Unhandled event:', type);
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
    const base64 = btoa(binary);

    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64,
    }));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
