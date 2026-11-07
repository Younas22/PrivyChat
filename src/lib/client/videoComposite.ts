"use client";

/**
 * Records the camera with a guest's video as a picture-in-picture, plus both voices mixed.
 * The main camera fills a canvas; a guest who joins later is drawn in the top-right corner.
 * The canvas + mixed audio form one constant MediaStream, so MediaRecorder never sees a track
 * change while the guest comes and goes.
 */

const FPS = 30;

type GuestAudio = { stream?: MediaStream | null; element?: HTMLMediaElement | null } | null;

export interface Composite {
  stream: MediaStream;
  /** Mixes the guest's voice into the recording (and, for element playback, the speakers). */
  setGuestAudio: (source: GuestAudio) => void;
  stop: () => void;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createComposite(
  main: HTMLVideoElement,
  getGuest: () => HTMLVideoElement | null,
  mic: MediaStream,
): Composite | null {
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") return null;
  const w = main.videoWidth || 1280;
  const h = main.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctx || !AudioCtx) return null;

  const audio = new AudioCtx();
  void audio.resume();
  const dest = audio.createMediaStreamDestination();
  if (mic.getAudioTracks().length) audio.createMediaStreamSource(mic).connect(dest);

  const draw = () => {
    ctx.drawImage(main, 0, 0, w, h);
    const g = getGuest();
    if (g && g.readyState >= 2 && g.videoWidth) {
      const pw = Math.round(Math.min(w, h) * 0.36);
      const ph = Math.round((pw * g.videoHeight) / g.videoWidth);
      const margin = Math.round(Math.min(w, h) * 0.035);
      const x = w - pw - margin;
      const y = margin;
      const r = Math.round(pw * 0.08);
      ctx.save();
      roundedRect(ctx, x, y, pw, ph, r);
      ctx.clip();
      ctx.drawImage(g, x, y, pw, ph);
      ctx.restore();
      ctx.lineWidth = Math.max(2, Math.round(pw * 0.012));
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      roundedRect(ctx, x, y, pw, ph, r);
      ctx.stroke();
    }
  };
  draw();
  // setInterval (not requestAnimationFrame) keeps frames coming if the tab is briefly hidden.
  const timer = setInterval(draw, 1000 / FPS);

  const video = canvas.captureStream(FPS).getVideoTracks()[0];
  const stream = new MediaStream([video, ...dest.stream.getAudioTracks()]);

  let guestNode: AudioNode | null = null;
  const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

  return {
    stream,
    setGuestAudio(source) {
      guestNode?.disconnect();
      guestNode = null;
      if (!source) return;
      try {
        if (source.stream?.getAudioTracks().length) {
          // WebRTC: the guest is heard through their <video>; this copy only feeds the recording.
          const node = audio.createMediaStreamSource(source.stream);
          node.connect(dest);
          guestNode = node;
        } else if (source.element) {
          // Relay playback: the element's sound now flows through the graph, so route it to the
          // speakers as well as the recording.
          let node = elementSources.get(source.element);
          if (!node) {
            node = audio.createMediaElementSource(source.element);
            elementSources.set(source.element, node);
          }
          node.connect(dest);
          node.connect(audio.destination);
          guestNode = node;
        }
      } catch (err) {
        console.warn("[live video] couldn't mix guest audio", err);
      }
    },
    stop() {
      clearInterval(timer);
      video.stop();
      void audio.close().catch(() => {});
    },
  };
}
