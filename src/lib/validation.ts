import { z } from "zod";

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export const displayNameSchema = z
  .string()
  .transform(collapse)
  .pipe(z.string().min(1, "Please enter your name.").max(40, "Name must be 40 characters or less."));

export const roomNameSchema = z
  .string()
  .transform(collapse)
  .pipe(z.string().min(1, "Room name can't be empty.").max(80, "Room name must be 80 characters or less."));

export const optionalRoomNameSchema = z
  .string()
  .optional()
  .transform((v) => (v ? collapse(v) : ""))
  .pipe(z.string().max(80, "Room name must be 80 characters or less."));

export const messageContentSchema = z
  .string()
  .transform((s) => s.replace(/\r\n/g, "\n").trim())
  .pipe(z.string().min(1, "Message can't be empty.").max(4000, "Message is too long (max 4000 characters)."));

export const editMessageSchema = z.object({ content: messageContentSchema });
export const memberDisplayNameSchema = z.object({ displayName: displayNameSchema });

export const idSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+$/i);

export const sendMessageSchema = z.object({
  content: messageContentSchema,
  replyToMessageId: idSchema.nullish(),
});

export const renameSchema = z.object({ name: roomNameSchema });

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid input.";
}
