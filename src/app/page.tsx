import { CreateRoomForm } from "@/components/landing/CreateRoomForm";
import { Logo } from "@/components/ui/Logo";
import { ArchiveIcon, LinkIcon, LockIcon, UsersIcon } from "@/components/ui/icons";

const STEPS = [
  { icon: LockIcon, title: "Create a room", text: "Enter your name and get a private room in one click." },
  { icon: LinkIcon, title: "Share the link", text: "Send the unique, hard-to-guess link to one friend." },
  { icon: UsersIcon, title: "Chat one-to-one", text: "Only two people can ever be inside. Nobody else can join." },
  { icon: ArchiveIcon, title: "Save & close", text: "Close the room when you're done and it's locked for good." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <span className="hidden text-sm text-neutral-500 sm:block">No sign-up. No tracking. Just chat.</span>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <span className="size-1.5 rounded-full bg-indigo-600" />
              Private two-person chat rooms
            </p>
            <h1 className="text-3xl leading-tight font-bold tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl">
              Private Conversations.
              <br />
              <span className="text-indigo-600">Simple Chat Rooms.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Create a private room, share the link with one friend, and talk one-to-one. Send messages, emoji,
              photos, videos and documents — then save and close the room when you&apos;re done.
            </p>
          </div>

          <div className="rounded-3xl bg-neutral-950 p-5 shadow-2xl shadow-indigo-900/20 sm:p-8">
            <div className="rounded-2xl bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-neutral-950">Start a private room</h2>
              <p className="mt-1 mb-5 text-sm text-neutral-500">Your friend will be asked for their name when they join.</p>
              <CreateRoomForm />
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-400">
              <LockIcon className="size-3.5" /> Maximum 2 members per room
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
        © {new Date().getFullYear()} PrivyChat · Private one-to-one conversations
      </footer>
    </div>
  );
}
