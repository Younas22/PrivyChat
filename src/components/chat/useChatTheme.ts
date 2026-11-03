"use client";

import { useCallback, useEffect } from "react";
import { usePersistentValue } from "@/lib/client/usePersistentFlag";

/** localStorage key; also read by the inline script in the root layout (keep in sync). */
export const CHAT_THEME_KEY = "talkroom:theme";

export type ChatTheme = "dark" | "light";

/**
 * Chat room light/dark theme, each person's own choice kept in their browser (dark by default).
 * The theme is applied as `data-chat-theme` on <html>; globals.css swaps the `tr-` palette for
 * `.chat-root` when it is "light". The layout's inline script sets it before first paint.
 */
export function useChatTheme() {
  const [raw, setRaw] = usePersistentValue(CHAT_THEME_KEY, "dark");
  const theme: ChatTheme = raw === "light" ? "light" : "dark";

  useEffect(() => {
    document.documentElement.dataset.chatTheme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next: ChatTheme = theme === "light" ? "dark" : "light";
    setRaw(next);
    return next;
  }, [theme, setRaw]);

  return { theme, toggle };
}
