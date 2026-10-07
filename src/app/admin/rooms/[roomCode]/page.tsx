import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeleteRoomButton } from "@/components/admin/AdminClient";
import { APP_NAME } from "@/lib/brand";
import { adminTranscript, requireAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: `Admin · ${APP_NAME}`, robots: { index: false, follow: false } };

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

export default async function AdminRoomPage({ params }: PageProps<"/admin/rooms/[roomCode]">) {
  await requireAdmin();
  const { roomCode } = await params;
  const data = await adminTranscript(roomCode);
  if (!data) notFound();
  const { room, messages } = data;

  return (
    <AdminShell title={room.name} back={{ href: "/admin", label: "All users" }}>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
        <span>{room.members.map((m) => `${m.displayName}${m.isOwner ? " (owner)" : ""}`).join(" & ") || "No members"}</span>
        <span>·</span>
        <span>{room.status === "open" ? "Open" : "Saved"}</span>
        <span>·</span>
        <span>{messages.length} messages (read-only)</span>
        <DeleteRoomButton roomCode={room.roomCode} name={room.name} backTo="/admin" />
      </div>
      <ol className="space-y-3">
        {messages.length === 0 && <li className="text-sm text-neutral-500">No messages.</li>}
        {messages.map((m) => (
          <li key={m.id} className="rounded-2xl bg-neutral-50 px-4 py-3 ring-1 ring-neutral-100">
            <p className="mb-1 text-xs text-neutral-500">
              <span className="font-semibold text-neutral-800">{m.senderName}</span> · {stamp(m.createdAt)}
              {m.reactions.length > 0 && <span> · {m.reactions.map((r) => r.emoji).join(" ")}</span>}
            </p>
            {m.isDeleted ? (
              <p className="text-sm text-neutral-400 italic">Deleted message</p>
            ) : (
              <>
                {m.replyTo && (
                  <p className="mb-1 border-l-2 border-indigo-300 pl-2 text-xs text-neutral-500">
                    ↪ {m.replyTo.senderName}: {m.replyTo.preview}
                  </p>
                )}
                {m.file && m.type === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin view of a protected upload
                  <img src={m.file.url} alt={m.file.name} className="mb-2 max-h-72 rounded-xl" loading="lazy" />
                )}
                {m.file && m.type === "video" && (
                  <video src={m.file.url} controls preload="metadata" className="mb-2 max-h-72 rounded-xl bg-black" />
                )}
                {m.file && m.type === "audio" && (
                  <audio src={m.file.url} controls preload="metadata" className="mb-2 w-full max-w-sm" />
                )}
                {m.file && m.type === "document" && (
                  <a
                    href={m.file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-2 inline-block text-sm font-medium text-indigo-600 underline"
                  >
                    📄 {m.file.name}
                  </a>
                )}
                {m.content && (
                  <p className="text-sm whitespace-pre-wrap text-neutral-900 [overflow-wrap:anywhere]">{m.content}</p>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </AdminShell>
  );
}
