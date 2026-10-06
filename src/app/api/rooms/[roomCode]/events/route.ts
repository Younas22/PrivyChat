import { errorResponse } from "@/lib/server/errors";
import { subscribe } from "@/lib/server/realtime";
import { requireMember } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

/** Server-Sent Events stream with live room updates for an active member. */
export async function GET(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  let access: Awaited<ReturnType<typeof requireMember>>;
  try {
    const { roomCode } = await params;
    access = await requireMember(roomCode);
  } catch (err) {
    return errorResponse(err);
  }
  const { room, user } = access;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {}
      };

      const unsubscribe = subscribe(room.id, (event) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
        const kicked = event.type === "member:removed" && event.userId === user.id;
        if (kicked || event.type === "room:closed" || event.type === "room:deleted") close();
      });
      const heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      write("retry: 3000\n: connected\n\n");
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
