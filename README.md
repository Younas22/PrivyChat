# TalkRoom

Simple chat rooms for two. Create a room, share the link with a friend, chat, then save it. Saved rooms appear in **My Rooms** (`/rooms`) for the person who created them, read-only.

The app name is set in `src/lib/brand.ts`.

**Stack:** Next.js 16 (App Router, TypeScript) · MySQL/MariaDB · Prisma 7 · Tailwind CSS 4

## Setup

```bash
cp .env.example .env          # set DATABASE_URL
npm install                   # also runs `prisma generate`
npx prisma migrate deploy     # or `npm run db:migrate` in development
npm run dev                   # http://localhost:3000
```

Production: `npm run build && npm start`.

## How it works

| Concern | Implementation |
| --- | --- |
| Identity | Random 192-bit anonymous ID in an `httpOnly` cookie (`talkroom_uid`), mapped to a `User` row. No login. |
| Room codes | 12-char cryptographically random codes (~70 bits) → `/chat/[roomCode]`. |
| Permissions | All checks are server-side in `src/lib/server/rooms.ts` (`requireMember`, owner-only operations). The client never sends user or owner IDs. |
| 2-member limit | Join runs in a transaction that locks the room row (`SELECT … FOR UPDATE`). |
| Realtime | Server-Sent Events (`/api/rooms/[code]/events`) fed by an in-process pub/sub, with an automatic polling fallback. |
| Uploads | `/api/rooms/[code]/upload`: checks extension, magic bytes (`file-type`) and size. Files are stored outside `public/` and served by `/api/files/...` only to active members of open rooms (supports Range requests for video). |
| Storage | `src/lib/storage` defines a `StorageDriver` interface; `LocalStorageDriver` is the default. Add an S3/R2/Supabase driver and return it from `getStorage()`. |
| Saved rooms | Closing a room makes it read-only for the owner (listed in `/rooms`); everyone else gets "This chat room has been closed." A saved room can never receive messages or be reopened. |
| Rate limiting | In-memory sliding window per user/IP (`src/lib/server/rate-limit.ts`). |

### Scaling note

The realtime bus and rate limiter are in-memory, so they assume a **single Node process** (`next start`).
To run several instances, swap both for Redis (pub/sub + counters). The polling fallback keeps chats working even then.

## Project structure

```
prisma/schema.prisma          database schema
src/app/                      pages, server actions, route handlers (api/)
src/components/chat/          chat UI (ChatRoom, MessageList, Composer, …)
src/components/ui/            reusable UI (Button, Dialog, Toast, icons)
src/lib/server/               server-only logic: rooms, identity, uploads, realtime
src/lib/storage/              file storage abstraction
```
