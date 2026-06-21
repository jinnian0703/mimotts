"use client"

import Image from "next/image"
import { useEffect, useState } from "react"

import {
  fallbackSiteIconUrl,
  readCachedSiteBrand,
  resolveSiteIconUrl,
  subscribeSiteBrand,
} from "@/lib/site-brand"

export function AppLoading() {
  const [iconUrl, setIconUrl] = useState(() =>
    resolveSiteIconUrl(readCachedSiteBrand()?.iconUrl)
  )
  const [failed, setFailed] = useState(false)
  const resolvedIconUrl = failed ? fallbackSiteIconUrl : iconUrl

  useEffect(() => {
    return subscribeSiteBrand((brand) => {
      setFailed(false)
      setIconUrl(resolveSiteIconUrl(brand.iconUrl))
    })
  }, [])

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="flex w-full max-w-xs flex-col items-center gap-5">
        <div className="relative flex size-12 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
          <Image
            src={resolvedIconUrl}
            alt=""
            width={48}
            height={48}
            priority
            unoptimized
            className="max-h-12 max-w-12 object-contain"
            onError={() => setFailed(true)}
          />
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
