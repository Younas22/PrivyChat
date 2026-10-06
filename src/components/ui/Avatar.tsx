const COLORS = [
  "bg-indigo-600",
  "bg-violet-600",
  "bg-sky-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-fuchsia-600",
  "bg-teal-600",
];

/** Stable color per user, so the same person always gets the same avatar color. */
function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

/** "Alex" → "A", "Sam Lee" → "SL" (Unicode/emoji safe). */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-9 text-sm",
} as const;

export function Avatar({ name, id, size = "sm" }: { name: string; id: string; size?: keyof typeof SIZES }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white select-none ${SIZES[size]} ${colorFor(id)}`}
      title={name}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
