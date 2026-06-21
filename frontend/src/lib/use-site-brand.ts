"use client"

import { useEffect, useState } from "react"

import { api } from "@/lib/api"
import {
  defaultSiteBrand,
  normalizeSiteBrand,
  publishSiteBrand,
  readCachedSiteBrand,
  subscribeSiteBrand,
  type SiteBrand,
} from "@/lib/site-brand"

export function useSiteBrand() {
  const [brand, setBrand] = useState<SiteBrand>(
    () => readCachedSiteBrand() ?? defaultSiteBrand
  )

  useEffect(() => {
    let cancelled = false
    const unsubscribe = subscribeSiteBrand(setBrand)

    api
      .basicInfo()
      .then((config) => {
        if (cancelled) {
          return
        }

        const nextBrand = normalizeSiteBrand(config)
        setBrand(nextBrand)
        publishSiteBrand(nextBrand)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return brand
}
