import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/brand";
import { InlineScript } from "@/components/ui/InlineScript";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} — Simple chat rooms for two`,
  description: "Create a chat room, share the link with a friend, and start talking. No sign-up needed.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" data-chat-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved chat theme before first paint (key matches CHAT_THEME_KEY in useChatTheme). */}
        <InlineScript html={`try{if(localStorage.getItem("talkroom:theme")==="light")document.documentElement.dataset.chatTheme="light"}catch(e){}`} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
