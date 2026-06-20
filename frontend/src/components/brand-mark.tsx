import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      <path
        d="M17 19.5A7.5 7.5 0 0 1 24.5 12h15A7.5 7.5 0 0 1 47 19.5v15A7.5 7.5 0 0 1 39.5 42H35l-9.5 8.2A2.2 2.2 0 0 1 22 48.5V42A7.5 7.5 0 0 1 17 34.9V19.5Z"
        fill="currentColor"
      />
      <path
        d="M25 30v-6m7 11V20m7 10v-6"
        stroke="var(--primary)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M25 52h14M39 47v10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  )
}
