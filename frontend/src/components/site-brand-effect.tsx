"use client"

import { useEffect } from "react"

import { api } from "@/lib/api"

const defaultTitle = "MimoTTS"

function ensureIconLink(rel: string) {
  const selector = `link[rel="${rel}"]`
  const existing = document.head.querySelector<HTMLLinkElement>(selector)

  if (existing) {
    return existing
  }

  const link = document.createElement("link")
  link.rel = rel
  document.head.appendChild(link)

  return link
}

function applySiteIcon(iconUrl: string) {
  if (!iconUrl) {
    return
  }

  for (const rel of ["icon", "shortcut icon", "apple-touch-icon"]) {
    const link = ensureIconLink(rel)
    link.href = iconUrl
  }
}

export function SiteBrandEffect() {
  useEffect(() => {
    let cancelled = false

    api
      .basicInfo()
      .then((config) => {
        if (cancelled) {
          return
        }

        const title = config.site_title || config.system_name || defaultTitle
        const iconUrl = config.icon_url ?? config.iconUrl ?? ""

        document.title = title
        applySiteIcon(iconUrl)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
