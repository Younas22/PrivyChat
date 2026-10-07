import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/errors";
import { listContacts } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

/** People the current user has chatted with (to add them to another room). */
export async function GET() {
  try {
    return NextResponse.json({ contacts: await listContacts() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
