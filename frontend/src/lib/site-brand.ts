import type { BasicInfoConfig } from "@/lib/types"

export const fallbackSiteIconUrl = "/favicon.ico"

export const defaultSiteBrand = {
  name: "MimoTTS",
  iconUrl: "",
}

const cacheKey = "mimotts:site-brand"
const changeEventName = "mimotts:site-brand-change"

export type SiteBrand = typeof defaultSiteBrand

export function resolveSiteIconUrl(iconUrl?: string | null) {
  return iconUrl?.trim() || fallbackSiteIconUrl
}

export function normalizeSiteBrand(config: BasicInfoConfig): SiteBrand {
  return {
    name: config.system_name || config.site_title || defaultSiteBrand.name,
    iconUrl: (config.icon_url ?? config.iconUrl ?? "").trim(),
  }
}

export function readCachedSiteBrand(): SiteBrand | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(cacheKey)
    const parsed = raw ? (JSON.parse(raw) as Partial<SiteBrand>) : null

    if (!parsed || typeof parsed !== "object") {
      return null
    }

    return {
      name: parsed.name || defaultSiteBrand.name,
      iconUrl: typeof parsed.iconUrl === "string" ? parsed.iconUrl.trim() : "",
    }
  } catch {
    return null
  }
}

export function writeCachedSiteBrand(brand: SiteBrand) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(brand))
  } catch {
    return
  }
}

export function publishSiteBrand(brand: SiteBrand) {
  if (typeof window === "undefined") {
    return
  }

  writeCachedSiteBrand(brand)
  window.dispatchEvent(new CustomEvent<SiteBrand>(changeEventName, { detail: brand }))
}

export function subscribeSiteBrand(listener: (brand: SiteBrand) => void) {
  if (typeof window === "undefined") {
    return () => undefined
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<SiteBrand>).detail)
  }

  window.addEventListener(changeEventName, handler)

  return () => window.removeEventListener(changeEventName, handler)
}
