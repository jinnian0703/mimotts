const CHINA_TIME_ZONE = "Asia/Shanghai"
const CHINA_OFFSET_HOURS = 8

type DateInput = Date | number | string | null | undefined

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: CHINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: CHINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function hasExplicitTimezone(value: string) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim())
}

function parseChinaLocal(value: string) {
  const match = value
    .trim()
    .match(
      /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
    )

  if (!match) {
    return null
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match

  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - CHINA_OFFSET_HOURS,
    Number(minute),
    Number(second)
  )
}

function partsToRecord(parts: Intl.DateTimeFormatPart[]) {
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )
}

export function parseChinaTimestamp(value: DateInput) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isNaN(timestamp) ? null : timestamp
  }

  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const timestamp = hasExplicitTimezone(normalized)
    ? new Date(normalized).getTime()
    : parseChinaLocal(normalized.replace(" ", "T")) ??
      new Date(normalized.replace(" ", "T")).getTime()

  return Number.isNaN(timestamp) ? null : timestamp
}

export function formatChinaDateTime(value: DateInput, fallback = "-") {
  const timestamp = parseChinaTimestamp(value)
  if (timestamp === null) {
    return typeof value === "string" && value.trim() ? value : fallback
  }

  const parts = partsToRecord(dateTimeFormatter.formatToParts(timestamp))

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

export function chinaDateKey(value: DateInput = new Date()) {
  const timestamp = parseChinaTimestamp(value) ?? Date.now()
  const parts = partsToRecord(dateFormatter.formatToParts(timestamp))

  return `${parts.year}-${parts.month}-${parts.day}`
}

export function toChinaDateTimeLocalValue(value: DateInput) {
  const formatted = formatChinaDateTime(value, "")

  return formatted ? formatted.replace(" ", "T").slice(0, 16) : ""
}
