/**
 * Runs a tiny script during HTML parsing (before first paint). Typed "text/plain" on the client so
 * React doesn't warn about rendering <script>; suppressHydrationWarning covers the type mismatch.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
