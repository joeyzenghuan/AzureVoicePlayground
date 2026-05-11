// GPT Realtime API Client using WebSocket
// Supports both OpenAI and Azure OpenAI endpoints

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type RealtimeVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';

export interface GptRealtimeClientConfig {
  apiKey: string;
  endpoint: string; // e.g. "https://xxx.openai.azure.com" or "api.openai.com"
  deploymentOrModel: string; // e.g. "gpt-4o-realtime-preview"
  isAzure: boolean;
  voice: RealtimeVoice;
  systemPrompt: string;
  onAudioData: (audioData: ArrayBuffer) => void;
  onOutputTranscript: (text: string, isDelta: boolean) => void;
  onInputTranscript: (text: string) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onError: (error: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onLatencyMeasured?: (latencyMs: number) => void;
}

export class GptRealtimeClient {
  private ws: WebSocket | null = null;
  private config: GptRealtimeClientConfig;

  // Latency tracking
  private userSpeechEndTime: number | null = null;
  private firstAudioReceived: boolean = false;

  constructor(config: GptRealtimeClientConfig) {
    this.config = config;
  }

  markSpeechEnd(): void {
    this.userSpeechEndTime = performance.now();
    this.firstAudioReceived = false;
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    console.log(`🎤 [GPT Realtime] Speech end detected by VAD at ${timestamp}`);
  }

  async connect(): Promise<void> {
    this.config.onStatusChange('connecting');

    try {
      let wsUrl: string;

      if (this.config.isAzure) {
        // Azure OpenAI Realtime endpoint
        const base = this.config.endpoint.replace(/\/$/, '');
        const host = base.replace(/^https?:\/\//, '');
        wsUrl = `wss://${host}/openai/realtime?api-version=2025-04-01-preview&deployment=${encodeURIComponent(this.config.deploymentOrModel)}&api-key=${encodeURIComponent(this.config.apiKey)}`;
      } else {
        // OpenAI endpoint
        wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.deploymentOrModel)}`;
      }

      console.log('[GPT Realtime] Connecting to:', wsUrl);

      // OpenAI requires auth in the protocol header; Azure uses query param or header
      const protocols = this.config.isAzure
        ? undefined
        : ['realtime', `openai-insecure-api-key.${this.config.apiKey}`, 'openai-beta.realtime-v1'];

      this.ws = new WebSocket(wsUrl, protocols);

      this.ws.onopen = () => {
        console.log('[GPT Realtime] WebSocket connected');

        // For Azure, send api-key via the session update (no subprotocol auth)
        this.sendSessionUpdate();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
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
        this.config.onStatusChange('disconnected');
      };

    } catch (error) {
      console.error('[GPT Realtime] Connection failed:', error);
      this.config.onError(`Failed to connect: ${error}`);
      this.config.onStatusChange('error');
      throw error;
    }
  }

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const sessionConfig: Record<string, unknown> = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.config.systemPrompt,
        voice: this.config.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };

    // Azure auth: inject api-key header via first message isn't possible in WS,
    // but Azure OpenAI Realtime supports the api-key as a query param or in
    // the subprotocol. For browser, we add it as a query param:
    if (this.config.isAzure) {
      // Reconnect with api-key in the URL if not already there
      // Actually Azure supports api-key as a query param on the WS URL
      // We'll handle this in the connect() method
    }

    this.ws.send(JSON.stringify(sessionConfig));
    console.log('[GPT Realtime] Session update sent');
  }

  private handleServerEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    switch (type) {
      case 'session.created':
        console.log('[GPT Realtime] Session created');
        this.config.onStatusChange('connected');
        break;

      case 'session.updated':
        console.log('[GPT Realtime] Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('[GPT Realtime] User speech started (server VAD)');
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('[GPT Realtime] User speech stopped (server VAD)');
        this.userSpeechEndTime = performance.now();
        this.firstAudioReceived = false;
        break;

      case 'input_audio_buffer.committed':
        console.log('[GPT Realtime] Input audio committed');
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = (event as any).transcript as string;
        if (transcript) {
          this.config.onInputTranscript(transcript);
        }
        break;
      }

      case 'response.audio.delta': {
        const delta = (event as any).delta as string;
        if (delta) {
          // Measure latency on first audio chunk
          if (!this.firstAudioReceived && this.userSpeechEndTime) {
            const latency = performance.now() - this.userSpeechEndTime;
            this.firstAudioReceived = true;
            console.log(`⚡ [GPT Realtime] First audio latency: ${latency.toFixed(0)}ms`);
            this.config.onLatencyMeasured?.(latency);
          }

          // Decode base64 to ArrayBuffer
          const binaryString = atob(delta);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          this.config.onAudioData(bytes.buffer);
        }
        break;
      }

      case 'response.audio_transcript.delta': {
        const delta = (event as any).delta as string;
        if (delta) {
          this.config.onOutputTranscript(delta, true);
        }
        break;
      }

      case 'response.audio_transcript.done': {
        const transcript = (event as any).transcript as string;
        if (transcript) {
          this.config.onOutputTranscript(transcript, false);
        }
        break;
      }

      case 'response.done':
        console.log('[GPT Realtime] Response complete');
        this.config.onTurnComplete();
        break;

      case 'response.cancelled':
        console.log('[GPT Realtime] Response cancelled (interrupted)');
        this.config.onInterrupted();
        this.userSpeechEndTime = null;
        this.firstAudioReceived = false;
        break;

      case 'error': {
        const errorMsg = (event as any).error?.message || 'Unknown error';
        console.error('[GPT Realtime] Server error:', errorMsg);
        this.config.onError(errorMsg);
        break;
      }

      default:
        // Log unhandled events at debug level
        console.debug('[GPT Realtime] Unhandled event:', type);
        break;
    }
  }

  sendAudio(pcm16Data: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Convert ArrayBuffer to base64
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

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Create a conversation item with user text
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }));

    // Trigger a response
    this.ws.send(JSON.stringify({
      type: 'response.create',
    }));
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
      return `wss://${host}/openai/realtime?api-version=2025-04-01-preview&deployment=${encodeURIComponent(this.config.deploymentOrModel)}`;
    }
    return `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.deploymentOrModel)}`;
  }
}
