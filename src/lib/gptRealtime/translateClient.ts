// WebSocket client for GPT Realtime Translate (full-duplex translation)
// Azure OpenAI endpoint: /openai/v1/realtime/translations?model=...&api-key=...

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TranslateClientConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  targetLanguage: string;         // e.g. "en", "zh", "ja"
  enableSourceTranscript: boolean; // Whether to also transcribe the source audio
  textOnlyMode: boolean;           // Text output only, no audio output
  onOutputAudioData: (audioData: ArrayBuffer) => void;
  onOutputTranscriptDelta: (delta: string) => void;
  onInputTranscriptDelta: (delta: string) => void;
  onSpeechStarted: () => void;
  onTurnComplete: () => void;
  onError: (error: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

export class TranslateRealtimeClient {
  private ws: WebSocket | null = null;
  private config: TranslateClientConfig;

  constructor(config: TranslateClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.config.onStatusChange('connecting');

    try {
      const base = this.config.endpoint.replace(/\/$/, '');
      const host = base.replace(/^https?:\/\//, '');
      const wsUrl = `wss://${host}/openai/v1/realtime/translations?model=${encodeURIComponent(this.config.deployment)}&api-key=${encodeURIComponent(this.config.apiKey)}`;

      console.log('[Translate Realtime] Connecting...');
      this.ws = new WebSocket(wsUrl, ['realtime']);

      this.ws.onopen = () => {
        console.log('[Translate Realtime] WebSocket connected');
        this.sendSessionUpdate();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerEvent(data);
        } catch (err) {
          console.error('[Translate Realtime] Failed to parse message:', err);
        }
      };

      this.ws.onerror = () => {
        this.config.onError('WebSocket connection error');
        this.config.onStatusChange('error');
      };

      this.ws.onclose = (event) => {
        console.log('[Translate Realtime] WebSocket closed:', event.code, event.reason);
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

    const audio: Record<string, unknown> = {
      output: {
        language: this.config.targetLanguage.toLowerCase(),
      },
    };

    if (this.config.enableSourceTranscript) {
      audio.input = {
        transcription: {
          model: this.config.deployment,
        },
      };
    }

    const sessionConfig: Record<string, unknown> = {
      type: 'session.update',
      session: {
        audio,
      },
    };

    // Add modalities for text-only mode
    if (this.config.textOnlyMode) {
      (sessionConfig.session as Record<string, unknown>).modalities = ['text'];
    }

    this.ws.send(JSON.stringify(sessionConfig));
    console.log('[Translate Realtime] Session update sent', { textOnlyMode: this.config.textOnlyMode });
  }

  private handleServerEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case 'session.created':
        console.log('[Translate Realtime] Session created (translation)');
        this.config.onStatusChange('connected');
        break;

      case 'session.updated':
        console.log('[Translate Realtime] Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('[Translate Realtime] Speech started');
        this.config.onSpeechStarted();
        break;

      // Source transcription (input language)
      case 'session.input_transcript.delta': {
        const delta = (event as any).delta as string;
        if (delta) {
          this.config.onInputTranscriptDelta(delta);
        }
        break;
      }

      // Translated text output
      case 'session.output_transcript.delta': {
        const delta = (event as any).delta as string;
        if (delta) {
          this.config.onOutputTranscriptDelta(delta);
        }
        break;
      }

      // Translated audio output
      case 'session.output_audio.delta': {
        const delta = (event as any).delta as string;
        if (delta) {
          const binaryString = atob(delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          this.config.onOutputAudioData(bytes.buffer);
        }
        break;
      }

      case 'response.done':
      case 'session.closed':
        this.config.onTurnComplete();
        break;

      case 'error': {
        const errorMsg = (event as any).error?.message || JSON.stringify((event as any).error);
        console.error('[Translate Realtime] Server error:', errorMsg);
        this.config.onError(errorMsg);
        break;
      }

      default:
        console.debug('[Translate Realtime] Unhandled event:', type);
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

    // Translation API uses different message type
    this.ws.send(JSON.stringify({
      type: 'session.input_audio_buffer.append',
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
