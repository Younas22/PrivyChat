"use client";

/**
 * Plays a live recording that arrives as numbered pieces through our own server (the fallback
 * when WebRTC can't connect). Piece 0 carries the container header, so it's always appended
 * first; after that the player jumps close to the newest piece to keep the delay low.
 */

type MediaSourceCtor = typeof MediaSource;

function mediaSourceCtor(): MediaSourceCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { MediaSource?: MediaSourceCtor; ManagedMediaSource?: MediaSourceCtor };
  return w.MediaSource ?? w.ManagedMediaSource ?? null; // ManagedMediaSource: iOS 17.1+
}

export function canPlayRelay(mime: string) {
  const C = mediaSourceCtor();
  try {
    return !!C && C.isTypeSupported(mime);
  } catch {
    return false;
  }
}

/** Media types the recorder may use for relay pieces, best MediaSource support first. */
export const RELAY_MIME_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
];

const MAX_LAG_SECONDS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RelayPlayer {
  readonly url: string;
  private ms: MediaSource;
  private sb: SourceBuffer | null = null;
  private video: HTMLVideoElement | null = null;
  private next = 0;
  private known = -1;
  private busy = false;
  private closed = false;
  private jumped = false;
  private started = false;

  constructor(
    private readonly mime: string,
    private readonly fetchChunk: (seq: number) => Promise<ArrayBuffer | null>,
    private readonly onStarted: () => void,
    private readonly onError: () => void,
  ) {
    const C = mediaSourceCtor();
    if (!C) throw new Error("MediaSource unavailable");
    this.ms = new C();
    this.url = URL.createObjectURL(this.ms);
    this.ms.addEventListener(
      "sourceopen",
      () => {
        try {
          this.sb = this.ms.addSourceBuffer(this.mime);
          this.sb.mode = "sequence"; // skipped pieces must not leave a gap in the timeline
          void this.pump();
        } catch {
          this.fail();
        }
      },
      { once: true },
    );
  }

  /** Connects the player to a <video> element (MediaSource opens once it's attached). */
  attach(video: HTMLVideoElement) {
    if (this.video === video) return;
    this.video = video;
    video.srcObject = null;
    video.disableRemotePlayback = true; // required by ManagedMediaSource
    video.src = this.url;
  }

  /** A new piece is available on the server. */
  notify(seq: number) {
    if (seq > this.known) this.known = seq;
    void this.pump();
  }

  close() {
    this.closed = true;
    try {
      if (this.ms.readyState === "open" && this.sb && !this.sb.updating) this.ms.endOfStream();
    } catch {
      /* already closed */
    }
    URL.revokeObjectURL(this.url);
  }

  private fail() {
    if (this.closed) return;
    this.closed = true;
    this.onError();
  }

  private async pump() {
    if (this.busy || this.closed || !this.sb) return;
    this.busy = true;
    try {
      while (!this.closed && this.next <= this.known) {
        // After the header piece, skip straight to (almost) the newest piece.
        if (this.next === 1 && !this.jumped) {
          this.jumped = true;
          if (this.known - 1 > 1) this.next = this.known - 1;
        }
        const seq = this.next;
        let buf = await this.fetchChunk(seq);
        if (!buf) {
          await sleep(800); // storage may not have it yet
          buf = await this.fetchChunk(seq);
        }
        if (this.closed) return;
        this.next++;
        if (!buf) {
          if (seq === 0) return this.fail(); // can't play anything without the header
          continue;
        }
        await this.append(buf);
        this.keepLive();
        if (!this.started) {
          this.started = true;
          this.onStarted();
        }
      }
    } catch {
      this.fail();
    } finally {
      this.busy = false;
    }
  }

  private append(buf: ArrayBuffer) {
    return new Promise<void>((resolve, reject) => {
      const sb = this.sb;
      if (!sb) return reject(new Error("no source buffer"));
      const cleanup = () => {
        sb.removeEventListener("updateend", done);
        sb.removeEventListener("error", failed);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("append failed"));
      };
      sb.addEventListener("updateend", done);
      sb.addEventListener("error", failed);
      sb.appendBuffer(buf);
    });
  }

  /** Stays near the live edge and keeps playing. */
  private keepLive() {
    const v = this.video;
    if (!v || !v.buffered.length) return;
    const end = v.buffered.end(v.buffered.length - 1);
    if (end - v.currentTime > MAX_LAG_SECONDS) v.currentTime = Math.max(0, end - 1);
    if (v.paused) v.play().catch(() => {});
  }
}
