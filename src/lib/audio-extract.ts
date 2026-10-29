/**
 * Extracts the uploaded video's audio in the browser and slices it into
 * mono 16 kHz WAV chunks that can be transcribed one by one.
 */

export type AudioChunk = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  blob: Blob;
};

const TARGET_RATE = 16_000;

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function extractAudioChunks(
  file: File,
  chunkSeconds = 90,
  onProgress?: (ratio: number) => void,
): Promise<AudioChunk[]> {
  const AudioCtor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!AudioCtor) throw new Error("This browser can't read the audio track.");

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(0.15);

  const decodeContext = new AudioCtor(1, TARGET_RATE, TARGET_RATE);
  const decoded = await decodeContext.decodeAudioData(arrayBuffer);

  // Downmix to mono at the decode context's rate.
  const length = decoded.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mono[i] = (mono[i] ?? 0) + (data[i] ?? 0);
  }
  if (decoded.numberOfChannels > 1) {
    for (let i = 0; i < length; i += 1) mono[i] = (mono[i] ?? 0) / decoded.numberOfChannels;
  }
  onProgress?.(0.5);

  const rate = decoded.sampleRate;
  const samplesPerChunk = Math.floor(chunkSeconds * rate);
  const chunks: AudioChunk[] = [];
  for (let offset = 0, index = 0; offset < length; offset += samplesPerChunk, index += 1) {
    const slice = mono.subarray(offset, Math.min(length, offset + samplesPerChunk));
    chunks.push({
      index,
      startSeconds: offset / rate,
      endSeconds: Math.min(length, offset + samplesPerChunk) / rate,
      blob: encodeWav(slice, rate),
    });
    onProgress?.(0.5 + 0.5 * Math.min(1, (offset + samplesPerChunk) / length));
  }

  return chunks;
}
