"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminConfig,
  adminDeleteRoom,
  adminDeleteUser,
  checkAdminCredentials,
  endAdminSession,
  setRoomsLocked,
  startAdminSession,
} from "@/lib/server/admin";
import { AppError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";

export type AdminFormState = { error?: string } | undefined;

export async function adminLoginAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  try {
    rateLimit(`admin-login:${ip}`, 5, 15 * 60_000);
  } catch (err) {
    if (err instanceof AppError) return { error: "Too many attempts. Try again in 15 minutes." };
    throw err;
  }
  if (!adminConfig().enabled) {
    return { error: "Admin login isn't set up yet. Set ADMIN_PASSWORD (8+ characters) on the server." };
  }
  const ok = checkAdminCredentials(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!ok) return { error: "Wrong email or password." };
  await startAdminSession();
  redirect("/admin");
}

export async function adminLogoutAction() {
  await endAdminSession();
  redirect("/admin/login");
}

export async function setRoomsLockedAction(userId: string, locked: boolean) {
  await setRoomsLocked(userId, locked);
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${userId}`);
}

export async function deleteUserAction(userId: string) {
  await adminDeleteUser(userId);
  revalidatePath("/admin");
}

export async function deleteRoomAction(roomCode: string, backTo: string) {
  await adminDeleteRoom(roomCode);
  revalidatePath(backTo);
  if (backTo.startsWith("/admin")) redirect(backTo);
}
