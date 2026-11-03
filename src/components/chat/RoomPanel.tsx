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
  ChevronRightIcon,
  CopyIcon,
  EraserIcon,
  MessageIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  RefreshIcon,
  ShareIcon,
  SlidersIcon,
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

function isOnline(member: RoomMemberInfo, viewer: Viewer, now: number) {
  if (member.userId === viewer.userId) return true;
  return !!member.lastSeenAt && now - new Date(member.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

/** A clock that ticks every 10s, for "last seen" labels. */
function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the clock after hydration
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export interface RoomPanelProps {
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
  /** Owner: delete every message in the room. */
  onClearChat: () => void;
  onRemoveMember: (member: RoomMemberInfo) => void;
  onEditDisplayName: (member: RoomMemberInfo) => void;
  /** Owner: add the second member yourself. */
  onAddMember: () => void;
  /** Owner: show the code of a member you added who hasn't used it yet. */
  onShowMemberCode: (member: RoomMemberInfo) => void;
}

type Tone = "indigo" | "sky" | "emerald" | "amber" | "danger";

const TONES: Record<Tone, string> = {
  indigo: "bg-tr-primary/20 text-violet-300",
  sky: "bg-sky-500/15 text-sky-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  danger: "bg-red-500/15 text-red-400",
};

function Section({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <section>
      <p className={`mb-2 px-1 text-[11px] font-semibold tracking-wider uppercase ${danger ? "text-red-400/80" : "text-neutral-500"}`}>
        {title}
      </p>
      <div className={`rounded-2xl p-1.5 ring-1 ${danger ? "bg-red-500/[0.05] ring-red-500/20" : "bg-tr-card ring-tr-line"}`}>
        {children}
      </div>
    </section>
  );
}

/** One clear action: colored icon, a title, and a short line saying what it does. */
function ActionRow({
  icon,
  title,
  hint,
  tone,
  onClick,
  href,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  tone: Tone;
  onClick?: () => void;
  href?: string;
}) {
  const danger = tone === "danger";
  const content = (
    <>
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-[18px] ${TONES[tone]}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${danger ? "text-red-300" : "text-neutral-100"}`}>{title}</span>
        <span className="block text-xs leading-snug text-tr-muted">{hint}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-neutral-400" />
    </>
  );
  const cls = `group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
    danger ? "hover:bg-red-500/10" : "hover:bg-white/[0.05]"
  }`;
  return href ? (
    <Link href={href} className={cls}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {content}
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
  const now = useNow();
  const other = room.members.find((m) => m.userId !== viewer.userId);
  const saved = room.status === "closed";

  return (
    <div className="flex flex-col gap-5 text-white">
      {/* Room header */}
      <div className="relative rounded-2xl border border-tr-primary/45 bg-tr-primary/10 p-4">
        <div className="relative flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tr-primary text-white">
            <MessageIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wider text-violet-300/80 uppercase">Chat room</p>
            <h2 className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{room.name}</h2>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-neutral-300">
          {saved ? (
            <span className="inline-flex items-center rounded-full bg-tr-line px-2.5 py-0.5 text-xs font-medium text-neutral-200">
              Saved · read-only
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              Open
            </span>
          )}
          <span className="rounded-full bg-tr-line px-2.5 py-0.5 text-xs">{room.members.length} / 2 members</span>
          {!saved && <ConnectionBadge connection={connection} />}
        </div>
      </div>

      <Section title="Members">
        <ul className="space-y-0.5">
          {room.members.map((m) => {
            const online = isOnline(m, viewer, now);
            const isMe = m.userId === viewer.userId;
            return (
              <li key={m.id} className="group/member flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5">
                <span className="relative">
                  <Avatar name={m.displayName} id={m.userId} size="md" />
                  <span
                    className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-tr-card ${online ? "bg-emerald-400" : "bg-neutral-600"}`}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-sm font-medium">
                      {m.displayName}
                      {isMe && <span className="font-normal text-neutral-400"> (you)</span>}
                    </p>
                    {m.isOwner && (
                      <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-300">
                        Owner
                      </span>
                    )}
                    {isMe && !saved && (
                      <button
                        type="button"
                        onClick={() => props.onEditDisplayName(m)}
                        className="grid size-7 shrink-0 place-items-center rounded-md text-neutral-400 opacity-100 transition hover:bg-tr-line hover:text-white focus-visible:opacity-100 md:opacity-0 md:group-hover/member:opacity-100"
                        aria-label="Edit your name in this room"
                        title="Edit name in this room"
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <p className={`text-xs ${online ? "text-emerald-400" : "text-neutral-500"}`}>
                    {isMe ? "Online" : memberActivity(m.lastSeenAt, m.pending, now)}
                  </p>
                  {viewer.isOwner && m.pending && !saved && (
                    <button
                      type="button"
                      onClick={() => props.onShowMemberCode(m)}
                      className="mt-0.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
                    >
                      Show code
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {!other && !saved && (
            <li className="m-1 rounded-xl border border-dashed border-tr-line px-3 py-3 text-xs leading-relaxed text-tr-muted">
              {viewer.isOwner
                ? "Waiting for your friend. Share the room link, or add them yourself and send them a code."
                : "Waiting for your friend to join. Share the room link."}
              {viewer.isOwner && (
                <button
                  type="button"
                  onClick={props.onAddMember}
                  className="mt-2.5 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-tr-primary text-sm font-semibold text-white transition hover:bg-tr-primary-2"
                >
                  <UserPlusIcon className="size-4" /> Add member
                </button>
              )}
            </li>
          )}
        </ul>
      </Section>

      {!saved && (
        <Section title="Invite">
          {/* On phones refresh lives here instead of the crowded header. */}
          <div className="sm:hidden">
            <ActionRow icon={<RefreshIcon />} tone="emerald" title="Refresh chat" hint="Load the latest messages" onClick={props.onRefresh} />
          </div>
          <ActionRow icon={<CopyIcon />} tone="sky" title="Copy room link" hint="Send it to your friend so they can join" onClick={props.onCopyLink} />
          {canShare && (
            <ActionRow icon={<ShareIcon />} tone="sky" title="Share room" hint="Share the link through another app" onClick={props.onShare} />
          )}
        </Section>
      )}

      {viewer.isOwner && (
        <Section title="Manage room">
          <ActionRow icon={<MessageIcon />} tone="indigo" title="My Rooms" hint="See all the rooms you created or joined" href="/rooms" />
          {!saved && (
            <>
              <ActionRow icon={<PencilIcon />} tone="indigo" title="Rename room" hint="Change the name shown at the top" onClick={props.onRename} />
              <ActionRow
                icon={<ArchiveIcon />}
                tone="amber"
                title="Save & close room"
                hint="Stop the chat; only you can still read it"
                onClick={props.onCloseRoom}
              />
            </>
          )}
        </Section>
      )}

      <Section title="Personalize">
        <div className="space-y-5 p-2">
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
                    className={`grid size-8 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-tr-card transition hover:scale-110 ${
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
        </div>
      </Section>

      {viewer.isOwner && (
        <Section title="Danger zone" danger>
          {other && !saved && (
            <ActionRow
              icon={<UserMinusIcon />}
              tone="danger"
              title={`Remove ${other.displayName}`}
              hint="They can't read or send messages here anymore"
              onClick={() => props.onRemoveMember(other)}
            />
          )}
          <ActionRow
            icon={<EraserIcon />}
            tone="danger"
            title="Delete all chat"
            hint="Erase every message and file; the room stays"
            onClick={props.onClearChat}
          />
          <ActionRow
            icon={<TrashIcon />}
            tone="danger"
            title="Delete room"
            hint="Remove the room and everything in it forever"
            onClick={props.onDeleteRoom}
          />
        </Section>
      )}
    </div>
  );
}

// ---------- Collapsed desktop sidebar: an icon rail ----------

function RailButton({
  label,
  icon,
  onClick,
  href,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const cls = `group/rail relative grid size-10 shrink-0 place-items-center rounded-xl transition [&>svg]:size-5 ${
    danger ? "text-red-400 hover:bg-red-500/15" : "text-tr-muted hover:bg-white/[0.06] hover:text-white"
  }`;
  const tip = (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-lg bg-tr-raised px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg ring-1 ring-white/10 transition group-hover/rail:opacity-100 group-focus-visible/rail:opacity-100"
    >
      {label}
    </span>
  );
  return href ? (
    <Link href={href} className={cls} aria-label={label}>
      {icon}
      {tip}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {icon}
      {tip}
    </button>
  );
}

const RailDivider = () => <span className="my-1.5 h-px w-8 shrink-0 bg-tr-line" />;

/** What the desktop sidebar shows when it is collapsed: every action stays one click away. */
export function RoomRail(props: RoomPanelProps & { onExpand: () => void }) {
  const { room, viewer, canShare } = props;
  const now = useNow();
  const other = room.members.find((m) => m.userId !== viewer.userId);
  const saved = room.status === "closed";

  return (
    <div className="flex h-full flex-col items-center gap-1 py-3">
      <Link
        href="/"
        className="mb-1 grid size-10 shrink-0 place-items-center rounded-xl bg-tr-primary text-white"
        aria-label="Home"
        title="Home"
      >
        <MessageIcon className="size-5" />
      </Link>
      <RailButton label="Show sidebar" icon={<PanelLeftOpenIcon />} onClick={props.onExpand} />
      <RailDivider />

      {room.members.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={props.onExpand}
          className="group/rail relative grid size-10 shrink-0 place-items-center rounded-xl transition hover:bg-tr-line"
          aria-label={m.displayName}
        >
          <span className="relative">
            <Avatar name={m.displayName} id={m.userId} size="sm" />
            <span
              className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-tr-side ${
                isOnline(m, viewer, now) ? "bg-emerald-400" : "bg-neutral-600"
              }`}
            />
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-lg bg-tr-raised px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg ring-1 ring-white/10 transition group-hover/rail:opacity-100 group-focus-visible/rail:opacity-100"
          >
            {m.displayName}
            {m.userId === viewer.userId ? " (you)" : ` · ${memberActivity(m.lastSeenAt, m.pending, now)}`}
          </span>
        </button>
      ))}
      {viewer.isOwner && !other && !saved && (
        <RailButton label="Add member" icon={<UserPlusIcon />} onClick={props.onAddMember} />
      )}
      <RailDivider />

      {!saved && <RailButton label="Copy room link" icon={<CopyIcon />} onClick={props.onCopyLink} />}
      {!saved && canShare && <RailButton label="Share room" icon={<ShareIcon />} onClick={props.onShare} />}
      {viewer.isOwner && <RailButton label="My Rooms" icon={<MessageIcon />} href="/rooms" />}
      {viewer.isOwner && !saved && (
        <>
          <RailButton label="Rename room" icon={<PencilIcon />} onClick={props.onRename} />
          <RailButton label="Save & close room" icon={<ArchiveIcon />} onClick={props.onCloseRoom} />
        </>
      )}

      <span className="flex-1" />
      <RailButton label="Color, time zone & access code" icon={<SlidersIcon />} onClick={props.onExpand} />
      {viewer.isOwner && (
        <>
          <RailDivider />
          {other && !saved && (
            <RailButton label={`Remove ${other.displayName}`} icon={<UserMinusIcon />} onClick={() => props.onRemoveMember(other)} danger />
          )}
          <RailButton label="Delete all chat" icon={<EraserIcon />} onClick={props.onClearChat} danger />
          <RailButton label="Delete room" icon={<TrashIcon />} onClick={props.onDeleteRoom} danger />
        </>
      )}
    </div>
  );
}
