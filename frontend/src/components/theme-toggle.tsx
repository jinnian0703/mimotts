"use client"

import { useTheme } from "next-themes"
import { IconMoonStars, IconSunHigh } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function ThemeToggle({
  compact = false,
  tooltip = true,
  className,
  iconClassName,
}: {
  compact?: boolean
  tooltip?: boolean
  className?: string
  iconClassName?: string
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const label = isDark ? "日间模式" : "夜间模式"
  const button = (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon-xs" : "icon-sm"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "切换到日间模式" : "切换到夜间模式"}
      className={cn(
        "group/theme-toggle shrink-0 overflow-hidden",
        compact && "rounded-[min(var(--radius-md),10px)]",
        className
      )}
    >
      <span className={cn("relative grid size-4 place-items-center", iconClassName)}>
        <IconSunHigh
          className={cn(
            "absolute transition-all duration-300 motion-safe:group-hover/theme-toggle:rotate-180 motion-safe:group-hover/theme-toggle:scale-110",
            isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
          )}
        />
        <IconMoonStars
          className={cn(
            "absolute transition-all duration-300 motion-safe:group-hover/theme-toggle:-rotate-12 motion-safe:group-hover/theme-toggle:scale-110",
            isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0"
          )}
        />
      </span>
    </Button>
  )

  if (!tooltip) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
