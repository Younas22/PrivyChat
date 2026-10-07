import Link from "next/link";
import { CreateRoomForm } from "@/components/landing/CreateRoomForm";
import { Logo } from "@/components/ui/Logo";
import { ArchiveIcon, KeyIcon, LinkIcon, MessageIcon, UsersIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/brand";

const STEPS = [
  { icon: MessageIcon, title: "Create a room", text: "Enter your name and get a chat room in one click." },
  { icon: LinkIcon, title: "Share the link", text: "Send the room link to your friend on any app." },
  { icon: UsersIcon, title: "Chat together", text: "Text, emoji, photos, videos and files — all in one place." },
  { icon: ArchiveIcon, title: "Save the chat", text: "Save the room when you're done and find it later in My Rooms." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link
            href="/code"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-neutral-950 px-3 text-sm font-semibold text-white hover:bg-neutral-800 sm:px-4"
          >
            <KeyIcon className="size-4" />
            Use code
          </Link>
          <Link
            href="/rooms"
            className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-50 sm:px-4"
          >
            My Rooms
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <span className="size-1.5 rounded-full bg-indigo-600" />
              Free · No sign-up needed
            </p>
            <h1 className="text-3xl leading-tight font-bold tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl">
              Start a Conversation.
              <br />
              <span className="text-indigo-600">Share One Link.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Create a chat room, send the link to a friend and start talking. Share messages, emoji, photos, videos
              and documents — then save the room to keep the conversation.
            </p>
          </div>

          <div className="rounded-3xl bg-neutral-950 p-5 shadow-2xl shadow-indigo-900/20 sm:p-8">
            <div className="rounded-2xl bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-neutral-950">Create a chat room</h2>
              <p className="mt-1 mb-5 text-sm text-neutral-500">Your friend will be asked for their name when they join.</p>
              <CreateRoomForm />
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-400">
              <UsersIcon className="size-3.5" /> Each room is for you and one friend
            </p>
          </div>
        </section>

        <section className="border-t border-neutral-100 bg-neutral-50">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:py-16">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs font-semibold text-neutral-400">STEP {i + 1}</span>
                </div>
                <h3 className="font-semibold text-neutral-950">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-neutral-950 py-6 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} {APP_NAME} · Simple chat rooms
      </footer>
    </div>
  );
}
