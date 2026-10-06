"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { RoomInfo, RoomMemberInfo, Viewer } from "@/lib/types";
import { ArchiveIcon, CopyIcon, MessageIcon, PencilIcon, ShareIcon, TrashIcon, UserMinusIcon } from "@/components/ui/icons";

export type ConnectionState = "connecting" | "live" | "polling";

interface RoomPanelProps {
  room: RoomInfo;
  viewer: Viewer;
  connection: ConnectionState;
  canShare: boolean;
  onCopyLink: () => void;
  onShare: () => void;
  onRename: () => void;
  onCloseRoom: () => void;
  onDeleteRoom: () => void;
  onRemoveMember: (member: RoomMemberInfo) => void;
}

function PanelButton({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${
        danger ? "text-red-400 hover:bg-red-500/10" : "text-neutral-200 hover:bg-white/10"
      }`}
    >
      <span className="shrink-0 [&>svg]:size-[18px]">{icon}</span>
      {children}
    </button>
  );
}

export function ConnectionBadge({ connection }: { connection: ConnectionState }) {
  const map = {
    live: { dot: "bg-emerald-400", text: "Live" },
    polling: { dot: "bg-amber-400", text: "Reconnecting…" },
    connecting: { dot: "bg-neutral-400 animate-pulse", text: "Connecting…" },
  }[connection];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`size-2 rounded-full ${map.dot}`} />
      {map.text}
    </span>
  );
}

export function RoomPanel(props: RoomPanelProps) {
  const { room, viewer, connection, canShare } = props;
  const other = room.members.find((m) => m.userId !== viewer.userId);
  const saved = room.status === "closed";

  return (
    <div className="flex flex-col gap-6 text-white">
      <div>
        <p className="text-xs font-semibold tracking-wider text-indigo-300 uppercase">Room</p>
        <h2 className="mt-1 text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{room.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-neutral-400">
          {saved ? (
            <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-neutral-200">
              Saved · read-only
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
              Open
            </span>
          )}
          <span className="text-xs">{room.members.length} / 2 members</span>
          {!saved && <ConnectionBadge connection={connection} />}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Members</p>
        <ul className="space-y-1">
          {room.members.map((m) => (
            <li key={m.id} className="flex min-h-11 items-center gap-3 rounded-xl px-1">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-semibold uppercase">
                {m.displayName.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.displayName}
                  {m.userId === viewer.userId && <span className="font-normal text-neutral-400"> (you)</span>}
                </p>
                <p className="text-xs text-neutral-500">{m.isOwner ? "Owner" : "Member"}</p>
              </div>
              {viewer.isOwner && !m.isOwner && !saved && (
                <button
                  type="button"
                  onClick={() => props.onRemoveMember(m)}
                  className="grid size-10 place-items-center rounded-full text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`Remove ${m.displayName}`}
                  title="Remove member"
                >
                  <UserMinusIcon className="size-[18px]" />
                </button>
              )}
            </li>
          ))}
          {!other && !saved && (
            <li className="rounded-xl border border-dashed border-white/15 px-3 py-3 text-xs leading-relaxed text-neutral-400">
              Waiting for your friend to join. Share the room link below.
            </li>
          )}
        </ul>
      </div>

      {!saved && (
      <div className="space-y-1">
        <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Invite</p>
        <PanelButton icon={<CopyIcon />} onClick={props.onCopyLink}>
          Copy Link
        </PanelButton>
        {canShare && (
          <PanelButton icon={<ShareIcon />} onClick={props.onShare}>
            Share Room
          </PanelButton>
        )}
      </div>
      )}

      {viewer.isOwner && (
        <div className="space-y-1">
          <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Manage room</p>
          <Link
            href="/rooms"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-neutral-200 transition hover:bg-white/10"
          >
            <MessageIcon className="size-[18px] shrink-0" />
            My Rooms
          </Link>
          {!saved && (
            <>
              <PanelButton icon={<PencilIcon />} onClick={props.onRename}>
                Rename
              </PanelButton>
              <PanelButton icon={<ArchiveIcon />} onClick={props.onCloseRoom}>
                Save &amp; Close Room
              </PanelButton>
            </>
          )}
          {other && !saved && (
            <PanelButton icon={<UserMinusIcon />} onClick={() => props.onRemoveMember(other)} danger>
              Remove Member
            </PanelButton>
          )}
          <PanelButton icon={<TrashIcon />} onClick={props.onDeleteRoom} danger>
            Delete Room
          </PanelButton>
        </div>
      )}
    </div>
  );
}
