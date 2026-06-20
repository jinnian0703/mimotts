"use client"

import { useEffect } from "react"

import { api } from "@/lib/api"
import { normalizeSiteBrand, writeCachedSiteBrand } from "@/lib/site-brand"

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

        const brand = normalizeSiteBrand(config)

        document.title = brand.name
        applySiteIcon(brand.iconUrl)
        writeCachedSiteBrand(brand)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
