import { pcm16BytesToFloat32LE } from './pcm16';

export type VolumeCallback = (volume: number) => void;
export type PlaybackCompleteCallback = () => void;
export type PlaybackStartCallback = (actualStartTime: number) => void;

/** Gap (in seconds) inserted between consecutive utterances for natural pacing */
const UTTERANCE_GAP_SEC = 0.35;
/** Initial buffer (in seconds) before the very first chunk of an utterance plays */
const INITIAL_BUFFER_SEC = 0.05;

export class Pcm16Player {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private dataArray: Uint8Array<ArrayBuffer>;
  private nextStartTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private animationFrameId: number | null = null;
  private onVolume: VolumeCallback | null = null;
  private onPlaybackComplete: PlaybackCompleteCallback | null = null;
  private onPlaybackStart: PlaybackStartCallback | null = null;
  private hasStartedPlayback = false;
  private firstChunkQueueTime: number = 0;
  private isNewUtterance = false;

  constructor() {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.85;
    this.analyser.connect(this.audioContext.destination);
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
  }

  setVolumeCallback(callback: VolumeCallback | null) {
    this.onVolume = callback;
  }

  setPlaybackCompleteCallback(callback: PlaybackCompleteCallback | null) {
    this.onPlaybackComplete = callback;
  }

  setPlaybackStartCallback(callback: PlaybackStartCallback | null) {
    this.onPlaybackStart = callback;
  }

  async resume(): Promise<void> {
    if (this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.85;
      this.analyser.connect(this.audioContext.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    }
    if (this.audioContext.state !== 'running') {
      await this.audioContext.resume();
    }
  }

  private startVolumeMonitoring() {
    if (this.animationFrameId !== null) return;

    const monitor = () => {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const volume = sum / this.dataArray.length;

      if (this.onVolume) {
        this.onVolume(volume);
      }

      if (this.sources.length > 0) {
        this.animationFrameId = requestAnimationFrame(monitor);
      } else {
        this.animationFrameId = null;
        if (this.onVolume) {
          this.onVolume(0); // Reset to zero when done
        }
        // Notify that playback is complete
        if (this.onPlaybackComplete) {
          this.onPlaybackComplete();
        }
      }
    };

    this.animationFrameId = requestAnimationFrame(monitor);
  }

  enqueuePcm16(bytes: Uint8Array, sampleRate = 16000) {
    const floatData = pcm16BytesToFloat32LE(bytes);
    const buffer = this.audioContext.createBuffer(1, floatData.length, sampleRate);
    buffer.getChannelData(0).set(floatData);

    const src = this.audioContext.createBufferSource();
    src.buffer = buffer;
    // Connect through analyser instead of directly to destination
    src.connect(this.analyser);

    const now = this.audioContext.currentTime;

    if (this.isNewUtterance) {
      // First chunk of a new utterance
      this.isNewUtterance = false;

      if (this.nextStartTime > now) {
        // Previous utterance is still playing — append after it with a natural gap
        this.nextStartTime += UTTERANCE_GAP_SEC;
      } else {
        // Nothing is playing — start after a small initial buffer
        this.nextStartTime = now + INITIAL_BUFFER_SEC;
      }
    } else if (this.nextStartTime < now) {
      // Mid-utterance but queue has drained (slow chunk arrival) — resume from now
      this.nextStartTime = now;
    }

    const startAt = this.nextStartTime;
    this.nextStartTime += buffer.duration;

    // Notify when first audio actually starts playing
    if (!this.hasStartedPlayback) {
      this.hasStartedPlayback = true;
      this.firstChunkQueueTime = performance.now();
      const delayUntilPlayback = (startAt - now) * 1000; // Convert to ms
      console.log(`[PCM Player] First chunk queued - will start in ${delayUntilPlayback.toFixed(0)}ms (buffer duration: ${(buffer.duration * 1000).toFixed(0)}ms)`);

      // Call the callback immediately with the calculated actual start time
      if (this.onPlaybackStart) {
        const actualStartTime = this.firstChunkQueueTime + delayUntilPlayback;
        this.onPlaybackStart(actualStartTime);
      }
    }

    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src);
    };
    this.sources.push(src);
    src.start(startAt);

    // Start monitoring volume when playback begins
    this.startVolumeMonitoring();
  }

  /**
   * Signal that the next enqueued chunk belongs to a new utterance.
   * If the previous utterance is still playing, a natural gap will be inserted.
   * Also resets the playback-start callback so it fires again for this utterance.
   */
  markNewUtterance() {
    this.hasStartedPlayback = false;
    this.isNewUtterance = true;
  }

  stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // ignore
      }
    }
    this.sources = [];
    this.nextStartTime = 0;
    this.hasStartedPlayback = false;
    this.isNewUtterance = false;
    if (this.onVolume) {
      this.onVolume(0); // Reset to zero
    }
  }
}
