// Audio handling for GPT Realtime API
// Uses Web Audio API for browser-based audio processing

// Input sample rate (microphone) - OpenAI Realtime expects 24kHz PCM16
export const INPUT_SAMPLE_RATE = 24000;
// Output sample rate (playback) - OpenAI Realtime outputs 24kHz audio
export const OUTPUT_SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4096;

export class GptRealtimeAudioHandler {
  private recordingContext: AudioContext;
  private playbackContext: AudioContext;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private playbackAnalyser: AnalyserNode | null = null;
  private onAudioData: ((data: ArrayBuffer) => void) | null = null;
  private isRecording = false;

  // Audio playback with continuous scheduling
  private playbackQueue: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;
  private isPlaybackStarted = false;
  private playbackStartTime = 0;

  // Animation
  private circleElement: HTMLElement | null = null;
  private animationFrameId: number | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private currentAnimationType: 'record' | 'play' | null = null;

  constructor() {
    this.recordingContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    this.playbackContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
  }

  setCircleElement(element: HTMLElement | null) {
    this.circleElement = element;
  }

  async startRecording(onAudioData: (data: ArrayBuffer) => void): Promise<void> {
    this.onAudioData = onAudioData;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      if (this.recordingContext.state === 'suspended') {
        await this.recordingContext.resume();
      }

      this.sourceNode = this.recordingContext.createMediaStreamSource(this.mediaStream);

      this.analyserNode = this.recordingContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.7;
      this.analyserNode.minDecibels = -90;
      this.analyserNode.maxDecibels = -10;
      this.dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

      this.processorNode = this.recordingContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

      this.processorNode.onaudioprocess = (event) => {
        if (!this.isRecording || !this.onAudioData) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }

        this.onAudioData(pcmData.buffer);
      };

      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.processorNode);
      this.processorNode.connect(this.recordingContext.destination);

      this.isRecording = true;

      if (this.circleElement) {
        this.startAnimation('record');
      }

      console.log('[GPT Realtime Audio] Recording started');
    } catch (error) {
      console.error('[GPT Realtime Audio] Error starting recording:', error);
      throw error;
    }
  }

  stopRecording(): void {
    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.stopAnimation();
    console.log('[GPT Realtime Audio] Recording stopped');
  }

  playAudio(pcm16Data: ArrayBuffer): void {
    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume();
    }

    const int16Array = new Int16Array(pcm16Data);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    const audioBuffer = this.playbackContext.createBuffer(1, float32Array.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = this.playbackContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create playback analyser if needed
    if (!this.playbackAnalyser) {
      this.playbackAnalyser = this.playbackContext.createAnalyser();
      this.playbackAnalyser.fftSize = 2048;
      this.playbackAnalyser.smoothingTimeConstant = 0.7;
      this.playbackAnalyser.connect(this.playbackContext.destination);
    }

    source.connect(this.playbackAnalyser);
    this.playbackQueue.push(source);

    const currentTime = this.playbackContext.currentTime;
    if (!this.isPlaybackStarted || this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime + 0.05;
      this.isPlaybackStarted = true;
      this.playbackStartTime = this.nextPlayTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;

    source.onended = () => {
      const idx = this.playbackQueue.indexOf(source);
      if (idx !== -1) this.playbackQueue.splice(idx, 1);
      if (this.playbackQueue.length === 0) {
        this.isPlaybackStarted = false;
        if (this.currentAnimationType === 'play') {
          this.stopAnimation();
        }
      }
    };

    if (this.circleElement && this.currentAnimationType !== 'play') {
      this.startAnimation('play');
    }
  }

  clearPlayback(): void {
    this.playbackQueue.forEach(source => {
      try { source.stop(); } catch {}
    });
    this.playbackQueue = [];
    this.isPlaybackStarted = false;
    this.nextPlayTime = 0;
    this.playbackStartTime = 0;
    if (this.currentAnimationType === 'play') {
      this.stopAnimation();
    }
  }

  isCurrentlyPlaying(): boolean {
    return this.playbackQueue.length > 0;
  }

  getPlayedAudioMs(): number {
    if (!this.isPlaybackStarted || this.playbackStartTime <= 0) {
      return 0;
    }

    return Math.max(0, (this.playbackContext.currentTime - this.playbackStartTime) * 1000);
  }

  interruptPlayback(): number {
    const playedMs = this.getPlayedAudioMs();
    this.clearPlayback();
    return playedMs;
  }

  private startAnimation(type: 'record' | 'play'): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.currentAnimationType = type;
    this.animate();
  }

  private stopAnimation(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.currentAnimationType = null;
    if (this.circleElement) {
      this.circleElement.style.transform = 'scale(1)';
      this.circleElement.style.boxShadow = '';
    }
  }

  private animate = (): void => {
    if (!this.circleElement) return;

    const analyser = this.currentAnimationType === 'record' ? this.analyserNode : this.playbackAnalyser;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    const normalized = average / 255;

    const scale = 1 + normalized * 0.3;
    const glowIntensity = Math.floor(normalized * 30);
    const color = this.currentAnimationType === 'record' ? '59, 130, 246' : '16, 185, 129';

    this.circleElement.style.transform = `scale(${scale})`;
    this.circleElement.style.boxShadow = `0 0 ${glowIntensity}px rgba(${color}, 0.5)`;

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  destroy(): void {
    this.stopRecording();
    this.clearPlayback();
    this.stopAnimation();

    if (this.recordingContext.state !== 'closed') {
      this.recordingContext.close();
    }
    if (this.playbackContext.state !== 'closed') {
      this.playbackContext.close();
    }
  }
}
