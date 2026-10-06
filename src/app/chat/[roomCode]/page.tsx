import type { Metadata } from "next";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { JoinRoomForm } from "@/components/chat/JoinRoomForm";
import { RoomNotice } from "@/components/chat/RoomNotice";
import { listMessages, resolveRoomAccess } from "@/lib/server/rooms";
import { toRoomInfo } from "@/lib/server/serialize";
import { maxSizeFor } from "@/lib/server/uploads";

export const metadata: Metadata = {
  title: "Private chat room · PrivyChat",
  robots: { index: false, follow: false },
};

export default async function ChatPage({ params }: PageProps<"/chat/[roomCode]">) {
  const { roomCode } = await params;
  const access = await resolveRoomAccess(roomCode);

  switch (access.state) {
    case "not_found":
    case "closed":
    case "full":
    case "removed":
      return <RoomNotice kind={access.state} />;
    case "can_join": {
      const owner = access.room.members.find((m) => m.userId === access.room.ownerId);
      return (
        <JoinRoomForm
          roomCode={access.room.roomCode}
          roomName={access.room.name}
          ownerName={owner?.user.displayName ?? "Someone"}
          defaultName={access.user?.displayName}
        />
      );
    }
    case "member": {
      const { room, user } = access;
      const page = await listMessages(roomCode);
      return (
        <ChatRoom
          initialRoom={toRoomInfo(room)}
          viewer={{ userId: user.id, displayName: user.displayName, isOwner: room.ownerId === user.id }}
          initialMessages={page.messages}
          initialHasMore={page.hasMore}
          limits={{ image: maxSizeFor("image"), video: maxSizeFor("video"), document: maxSizeFor("document") }}
        />
      );
    }
  }
}
