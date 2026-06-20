import type { BasicInfoConfig } from "@/lib/types"

export const defaultSiteBrand = {
  name: "MimoTTS",
  iconUrl: "",
}

const cacheKey = "mimotts:site-brand"

export type SiteBrand = typeof defaultSiteBrand

export function normalizeSiteBrand(config: BasicInfoConfig): SiteBrand {
  return {
    name: config.system_name || config.site_title || defaultSiteBrand.name,
    iconUrl: config.icon_url ?? config.iconUrl ?? "",
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
      iconUrl: typeof parsed.iconUrl === "string" ? parsed.iconUrl : "",
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
