// Shared utility: decode an audio file to 24kHz mono PCM16,
// then stream it to a callback at real-time speed (simulating a live mic).

export interface StreamAudioFileOptions {
  file: File;
  sampleRate?: number; // default 24000
  chunkDurationMs?: number; // default 200ms
  onChunk: (pcm16: ArrayBuffer) => void;
  onProgress?: (percent: number, status: string) => void;
  signal?: AbortSignal;
}

export async function streamAudioFileRealtime(opts: StreamAudioFileOptions): Promise<void> {
  const {
    file,
    sampleRate = 24000,
    chunkDurationMs = 200,
    onChunk,
    onProgress,
    signal,
  } = opts;

  onProgress?.(0, `Decoding ${file.name}...`);

  // Decode audio file
  const arrayBuf = await file.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate });
  const decoded = await audioCtx.decodeAudioData(arrayBuf);

  // Get mono channel, resample if needed
  let samples: Float32Array;
  if (decoded.sampleRate !== sampleRate) {
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil(decoded.getChannelData(0).length * sampleRate / decoded.sampleRate),
      sampleRate,
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();
    samples = rendered.getChannelData(0);
  } else {
    samples = decoded.getChannelData(0);
  }

  await audioCtx.close();

  // Convert float32 → int16 PCM
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // Stream chunks at real-time speed
  const chunkSamples = Math.floor(sampleRate * chunkDurationMs / 1000);
  const totalChunks = Math.ceil(int16.length / chunkSamples);
  const totalDuration = (int16.length / sampleRate).toFixed(1);

  onProgress?.(0, `Streaming ${file.name} (${totalDuration}s)...`);

  const startedAt = performance.now();

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) break;

    const start = i * chunkSamples;
    const end = Math.min(start + chunkSamples, int16.length);
    const chunk = int16.slice(start, end);

    // Send as raw PCM16 bytes
    onChunk(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));

    const percent = Math.round(((i + 1) / totalChunks) * 100);
    const elapsedSec = ((i + 1) * chunkDurationMs / 1000).toFixed(1);
    onProgress?.(percent, `Streaming ${file.name} (${elapsedSec}s / ${totalDuration}s)`);

    // Wait to maintain real-time pace
    if (i < totalChunks - 1) {
      const nextSendAt = startedAt + (i + 1) * chunkDurationMs;
      const delayMs = nextSendAt - performance.now();
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  if (!signal?.aborted) {
    onProgress?.(100, `Done streaming ${file.name}`);
  }
}
