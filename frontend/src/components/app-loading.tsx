"use client"

import { IconClipboardList } from "@tabler/icons-react"

export function AppLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-xs flex-col items-center gap-5">
        <div className="relative flex size-12 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
          <IconClipboardList className="size-5 text-primary" />
          <span className="absolute -inset-1 rounded-2xl border border-primary/20 opacity-80 app-loading-ring" />
        </div>
        <div className="h-px w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/3 rounded-full bg-primary app-loading-line" />
        </div>
        <div className="text-sm font-medium text-muted-foreground">正在加载</div>
      </div>
    </main>
  )
}
