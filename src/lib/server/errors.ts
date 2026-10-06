import "server-only";
import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const Errors = {
  noIdentity: () => new AppError(401, "no_identity", "Please join this room first."),
  notFound: () => new AppError(404, "room_not_found", "This chat room does not exist."),
  closed: () => new AppError(410, "room_closed", "This chat room has been closed."),
  full: () => new AppError(403, "room_full", "This chat room is full."),
  removed: () => new AppError(403, "member_removed", "You have been removed from this chat room."),
  notMember: () => new AppError(403, "not_member", "You are not a member of this chat room."),
  ownerOnly: () => new AppError(403, "owner_only", "Only the room owner can do that."),
  rateLimited: () => new AppError(429, "rate_limited", "You're doing that too fast. Please wait a moment."),
  badRequest: (message: string) => new AppError(400, "bad_request", message),
};

/** Turns any thrown error into a human-friendly JSON response. */
export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json(
    { error: "Something went wrong on our side. Please try again.", code: "server_error" },
    { status: 500 },
  );
}
