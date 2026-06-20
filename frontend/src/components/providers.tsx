"use client"

import { ThemeProvider } from "next-themes"
import { SiteBrandEffect } from "@/components/site-brand-effect"
import { TooltipProvider } from "@/components/ui/tooltip"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>
        <SiteBrandEffect />
        {children}
      </TooltipProvider>
    </ThemeProvider>
  )
}
