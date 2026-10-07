import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { UsersTable } from "@/components/admin/AdminClient";
import { APP_NAME } from "@/lib/brand";
import { listAllUsers, requireAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: `Admin · ${APP_NAME}`, robots: { index: false, follow: false } };

export default async function AdminHomePage() {
  await requireAdmin();
  const users = await listAllUsers();
  return (
    <AdminShell title="Users">
      <p className="mb-4 text-sm text-neutral-500">
        Everyone who has used {APP_NAME}. Open a user to see and read their rooms. &quot;Make private&quot; makes their My
        Rooms ask for their access code.
      </p>
      <UsersTable users={users} />
    </AdminShell>
  );
}
