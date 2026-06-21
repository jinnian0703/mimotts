import type { BasicInfoConfig } from "@/lib/types"

export const fallbackSiteIconUrl = "/favicon.ico"

export const defaultSiteBrand = {
  name: "MimoTTS",
  iconUrl: "",
  subtitle: "集中管理语音识别、语音合成、音色设计、声音克隆、账户接入与套餐计费。",
  icpRecord: "",
  footerText: "",
  supportEmail: "",
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
    subtitle: (config.site_subtitle ?? "").trim() || defaultSiteBrand.subtitle,
    icpRecord: (config.icp_record ?? "").trim(),
    footerText: (config.footer_text ?? "").trim(),
    supportEmail: (config.support_email ?? "").trim(),
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
      subtitle:
        typeof parsed.subtitle === "string" && parsed.subtitle.trim()
          ? parsed.subtitle.trim()
          : defaultSiteBrand.subtitle,
      icpRecord:
        typeof parsed.icpRecord === "string" ? parsed.icpRecord.trim() : "",
      footerText:
        typeof parsed.footerText === "string" ? parsed.footerText.trim() : "",
      supportEmail:
        typeof parsed.supportEmail === "string"
          ? parsed.supportEmail.trim()
          : "",
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
