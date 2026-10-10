"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BUBBLE_COLORS, type BubbleColorId } from "@/lib/client/bubbleColors";
import type { RoomInfo, RoomMemberInfo, Viewer } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { TimeZonePicker } from "./TimeZonePicker";
import { AccessCodeCard } from "@/components/code/AccessCodeCard";
import {
  ArchiveIcon,
  CheckIcon,
  CopyIcon,
  MessageIcon,
  PencilIcon,
  RefreshIcon,
  ShareIcon,
  TrashIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@/components/ui/icons";

export type ConnectionState = "connecting" | "live" | "polling";

const ONLINE_WINDOW_MS = 45_000;

function memberActivity(lastSeenAt: string | null, pending: boolean, now: number) {
  if (pending) return "Invited · hasn't opened yet";
  if (!lastSeenAt) return "Offline · hasn't been online yet";
  const elapsed = now - new Date(lastSeenAt).getTime();
  if (elapsed < ONLINE_WINDOW_MS) return "Online";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days}d ago`;
}

interface RoomPanelProps {
  room: RoomInfo;
  viewer: Viewer;
  connection: ConnectionState;
  canShare: boolean;
  /** "auto" or an IANA zone: the viewer's choice for showing times. */
  timeZonePreference: string;
  detectedTimeZone: string;
  onTimeZone: (zone: string) => void;
  accessCode: string;
  onCodeNotice: (text: string, kind: "success" | "error") => void;
  /** Color of the viewer's own message bubbles (their personal choice). */
  bubbleColorId: BubbleColorId;
  onBubbleColor: (id: BubbleColorId) => void;
  onCopyLink: () => void;
  onRefresh: () => void;
  onShare: () => void;
  onRename: () => void;
  onCloseRoom: () => void;
  onDeleteRoom: () => void;
  onRemoveMember: (member: RoomMemberInfo) => void;
  onEditDisplayName: (member: RoomMemberInfo) => void;
  /** Owner: add the second member yourself. */
  onAddMember: () => void;
  /** Owner: show the code of a member you added who hasn't used it yet. */
  onShowMemberCode: (member: RoomMemberInfo) => void;
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
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
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
            <li key={m.id} className="group/member flex min-h-11 items-center gap-3 rounded-xl px-1">
              <Avatar name={m.displayName} id={m.userId} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1">
                  <p className="truncate text-sm font-medium">
                    {m.displayName}
                    {m.userId === viewer.userId && <span className="font-normal text-neutral-400"> (you)</span>}
                  </p>
                  {m.userId === viewer.userId && !saved && (
                    <button
                      type="button"
                      onClick={() => props.onEditDisplayName(m)}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-neutral-400 opacity-100 transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 md:opacity-0 md:group-hover/member:opacity-100"
                      aria-label="Edit your name in this room"
                      title="Edit name in this room"
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className={`text-xs ${m.lastSeenAt && now - new Date(m.lastSeenAt).getTime() < ONLINE_WINDOW_MS ? "text-emerald-400" : "text-neutral-500"}`}>
                  {m.userId === viewer.userId ? "You · Online" : `${m.isOwner ? "Owner · " : ""}${memberActivity(m.lastSeenAt, m.pending, now)}`}
                </p>
                {viewer.isOwner && m.pending && !saved && (
                  <button
                    type="button"
                    onClick={() => props.onShowMemberCode(m)}
                    className="mt-0.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200"
                  >
                    Show code
                  </button>
                )}
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
              {viewer.isOwner
                ? "Waiting for your friend. Share the room link below, or add them yourself and send them a code."
                : "Waiting for your friend to join. Share the room link below."}
              {viewer.isOwner && (
                <button
                  type="button"
                  onClick={props.onAddMember}
                  className="mt-2.5 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  <UserPlusIcon className="size-4" /> Add member
                </button>
              )}
            </li>
          )}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Chat color</p>
        <div role="radiogroup" aria-label="Color of your messages" className="flex flex-wrap gap-2">
          {BUBBLE_COLORS.map((c) => {
            const selected = c.id === props.bubbleColorId;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={c.name}
                title={c.name}
                onClick={() => props.onBubbleColor(c.id)}
                style={{ backgroundColor: c.bg, color: c.fg }}
                className={`grid size-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-neutral-950 transition hover:scale-110 ${
                  selected ? "ring-white" : "ring-transparent"
                }`}
              >
                {selected && <CheckIcon className="size-4" />}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-neutral-500">Only changes how your messages look on your screen.</p>
      </div>

      <TimeZonePicker
        preference={props.timeZonePreference}
        detected={props.detectedTimeZone}
        onChange={props.onTimeZone}
      />

      <AccessCodeCard code={props.accessCode} tone="dark" onNotice={props.onCodeNotice} />

      {!saved && (
      <div className="space-y-1">
        {/* On phones these two live here instead of the crowded header. */}
        <div className="sm:hidden">
          <PanelButton icon={<RefreshIcon />} onClick={props.onRefresh}>
            Refresh chat
          </PanelButton>
        </div>
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
