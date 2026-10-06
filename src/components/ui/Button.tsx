import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600 shadow-sm",
  secondary: "bg-white text-neutral-900 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50 focus-visible:outline-indigo-600",
  ghost: "text-neutral-700 hover:bg-neutral-100 focus-visible:outline-indigo-600",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600 shadow-sm",
  dark: "bg-neutral-950 text-white hover:bg-neutral-800 focus-visible:outline-neutral-950 shadow-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  size?: "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        size === "lg" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm"
      } ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
