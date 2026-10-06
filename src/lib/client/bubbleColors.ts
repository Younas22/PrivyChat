/** Colors a person can pick for their own message bubbles (bg + readable text color). */
export const BUBBLE_COLORS = [
  { id: "indigo", name: "Indigo", bg: "#4f46e5", fg: "#ffffff" },
  { id: "black", name: "Black", bg: "#171717", fg: "#ffffff" },
  { id: "blue", name: "Blue", bg: "#2563eb", fg: "#ffffff" },
  { id: "teal", name: "Teal", bg: "#0d9488", fg: "#ffffff" },
  { id: "green", name: "Green", bg: "#16a34a", fg: "#ffffff" },
  { id: "purple", name: "Purple", bg: "#9333ea", fg: "#ffffff" },
  { id: "rose", name: "Rose", bg: "#e11d48", fg: "#ffffff" },
  { id: "orange", name: "Orange", bg: "#ea580c", fg: "#ffffff" },
  { id: "sky", name: "Light blue", bg: "#e0f2fe", fg: "#0c4a6e" },
  { id: "yellow", name: "Yellow", bg: "#fef08a", fg: "#422006" },
] as const;

export type BubbleColorId = (typeof BUBBLE_COLORS)[number]["id"];

export const DEFAULT_BUBBLE_COLOR: BubbleColorId = "indigo";

export function bubbleColor(id: string) {
  return BUBBLE_COLORS.find((c) => c.id === id) ?? BUBBLE_COLORS[0];
}
