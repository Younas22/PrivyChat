import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { MessageIcon } from "./icons";

export function Logo({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
        <MessageIcon className="size-4" />
      </span>
      <span className={dark ? "text-white" : "text-neutral-950"}>{APP_NAME}</span>
    </Link>
  );
}
