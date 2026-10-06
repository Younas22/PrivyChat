/** Number of loudness bars stored per voice message (WhatsApp-style waveform). */
export const WAVE_BARS = 48;

export interface AudioMeta {
  durationMs: number;
  /** One base-32 digit (0-v) per bar, louder = higher. */
  waveform: string | null;
}

/**
 * Decodes an audio file in the browser to measure its exact length and loudness profile.
 * Returns null if the browser can't decode it (the player then falls back gracefully).
 */
export async function analyzeAudio(blob: Blob): Promise<AudioMeta | null> {
  const Ctx =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    const length = channels[0]?.length ?? 0;
    const bucket = Math.max(1, Math.floor(length / WAVE_BARS));

    // Loudness (RMS) of each slice, mixing all channels.
    const rms: number[] = [];
    for (let b = 0; b < WAVE_BARS; b++) {
      let sum = 0;
      const start = b * bucket;
      const end = Math.min(length, start + bucket);
      for (let i = start; i < end; i++) {
        let v = 0;
        for (const ch of channels) v += ch[i];
        v /= channels.length;
        sum += v * v;
      }
      rms.push(Math.sqrt(sum / Math.max(1, end - start)));
    }

    const max = Math.max(...rms);
    const waveform =
      max > 0
        ? rms
            .map((v) => Math.min(31, Math.round(Math.sqrt(v / max) * 31))) // sqrt: quiet parts stay visible
            .map((level) => level.toString(32))
            .join("")
        : null;
    return { durationMs: Math.round(audio.duration * 1000), waveform };
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => {});
  }
}
