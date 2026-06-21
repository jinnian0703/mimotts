"use client"

import { useEffect, useState } from "react"
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBellRinging,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconInfoCircle,
} from "@tabler/icons-react"

import { api } from "@/lib/api"
import {
  chinaDateKey,
  formatChinaDateTime,
  parseChinaTimestamp,
} from "@/lib/china-time"
import { cn } from "@/lib/utils"
import type { Announcement, AnnouncementLevel } from "@/lib/types"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const CAROUSEL_INTERVAL = 6000
const REMINDER_TODAY_KEY = "mimo:announcements:reminder-date"
const REMINDER_FOREVER_KEY = "mimo:announcements:reminder-forever"

const icons: Record<AnnouncementLevel, React.ReactNode> = {
  info: <IconInfoCircle className="size-4" />,
  success: <IconCircleCheck className="size-4" />,
  warning: <IconAlertTriangle className="size-4" />,
  destructive: <IconAlertCircle className="size-4" />,
}

const levelClasses: Record<AnnouncementLevel, string> = {
  info: "border-[rgba(13,87,79,0.14)] bg-[rgba(240,248,247,0.9)] text-[oklch(0.23_0.03_190)] dark:border-primary/20 dark:bg-primary/10 dark:text-foreground",
  success:
    "border-[rgba(18,122,73,0.14)] bg-[rgba(239,249,243,0.92)] text-[oklch(0.3_0.06_155)] dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-100",
  warning:
    "border-[rgba(180,132,12,0.16)] bg-[rgba(255,249,233,0.96)] text-[oklch(0.42_0.08_85)] dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100",
  destructive:
    "border-[rgba(181,53,40,0.16)] bg-[rgba(255,241,240,0.96)] text-[oklch(0.47_0.12_28)] dark:border-destructive/25 dark:bg-destructive/15 dark:text-red-100",
}

const levelLabels: Record<AnnouncementLevel, string> = {
  info: "信息",
  success: "完成",
  warning: "注意",
  destructive: "重要",
}

function timestampForAnnouncement(announcement: Announcement) {
  const value =
    announcement.startsAt ?? announcement.createdAt ?? announcement.updatedAt

  if (!value) {
    return Number.MAX_SAFE_INTEGER
  }

  const timestamp = parseChinaTimestamp(value)

  if (timestamp === null) {
    return Number.MAX_SAFE_INTEGER
  }

  return timestamp
}

function sortAnnouncements(announcements: Announcement[]) {
  return [...announcements].sort((first, second) => {
    const timeGap =
      timestampForAnnouncement(first) - timestampForAnnouncement(second)

    if (timeGap !== 0) {
      return timeGap
    }

    return first.id.localeCompare(second.id)
  })
}

function formatPeriod(announcement: Announcement) {
  if (!announcement.startsAt && !announcement.endsAt) {
    return null
  }

  const format = (value?: string | null) => {
    if (!value) {
      return null
    }

    return formatChinaDateTime(value, value)
  }

  const start = format(announcement.startsAt)
  const end = format(announcement.endsAt)

  if (start && end) {
    return `${start} - ${end}`
  }

  return start ?? end
}

function localDateKey() {
  return chinaDateKey()
}

function shouldOpenReminder() {
  if (typeof window === "undefined") {
    return false
  }

  try {
    const permanentlyClosed =
      window.localStorage.getItem(REMINDER_FOREVER_KEY) === "1"
    const closedToday =
      window.localStorage.getItem(REMINDER_TODAY_KEY) === localDateKey()

    return !permanentlyClosed && !closedToday
  } catch {
    return true
  }
}

function saveReminderValue(key: string, value: string) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    return
  }
}

export function AnnouncementStack() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderIndex, setReminderIndex] = useState(0)

  useEffect(() => {
    let mounted = true

    api
      .announcements()
      .then((nextAnnouncements) => {
        if (mounted) {
          const sortedAnnouncements = sortAnnouncements(nextAnnouncements)
          const popupAnnouncements = sortedAnnouncements.filter(
            (announcement) => announcement.showPopup !== false
          )

          setAnnouncements(sortedAnnouncements)
          setActiveIndex((current) =>
            current >= sortedAnnouncements.length ? 0 : current
          )
          setReminderIndex(0)
          setReminderOpen(
            popupAnnouncements.length > 0 && shouldOpenReminder()
          )
        }
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (paused || announcements.length <= 1) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % announcements.length)
    }, CAROUSEL_INTERVAL)

    return () => window.clearInterval(timer)
  }, [announcements.length, paused])

  if (announcements.length === 0) {
    return null
  }

  const currentIndex = activeIndex % announcements.length
  const current = announcements[currentIndex] ?? announcements[0]
  const period = formatPeriod(current)
  const hasMultiple = announcements.length > 1
  const popupAnnouncements = announcements.filter(
    (announcement) => announcement.showPopup !== false
  )
  const reminder = popupAnnouncements[reminderIndex] ?? popupAnnouncements[0]
  const reminderPeriod = reminder ? formatPeriod(reminder) : null
  const hasNextReminder = reminderIndex + 1 < popupAnnouncements.length

  function closeReminderForToday() {
    saveReminderValue(REMINDER_TODAY_KEY, localDateKey())
    setReminderOpen(false)
  }

  function closeReminderForever() {
    saveReminderValue(REMINDER_FOREVER_KEY, "1")
    setReminderOpen(false)
  }

  function advanceReminder() {
    if (hasNextReminder) {
      setReminderIndex((currentReminderIndex) => currentReminderIndex + 1)
      return
    }

    setReminderOpen(false)
  }

  function goToPrevious() {
    setActiveIndex((currentActiveIndex) =>
      currentActiveIndex === 0 ? announcements.length - 1 : currentActiveIndex - 1
    )
  }

  function goToNext() {
    setActiveIndex((currentIndex) => (currentIndex + 1) % announcements.length)
  }

  return (
    <div
      className="grid gap-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {reminder && (
        <Dialog
          open={reminderOpen}
          onOpenChange={(open) => {
            if (open) {
              setReminderOpen(true)
              return
            }

            advanceReminder()
          }}
        >
          <DialogContent showCloseButton={false} className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <IconBellRinging className="size-5" />
                </div>
                <DialogTitle>公告提醒</DialogTitle>
              </div>
            </DialogHeader>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-primary">
                      {icons[reminder.level]}
                    </span>
                    <span
                      className="truncate font-medium"
                      title={reminder.title}
                    >
                      {reminder.title}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {levelLabels[reminder.level]}
                    </Badge>
                  </div>
                  <div
                    className="mt-2 line-clamp-3 text-sm text-muted-foreground"
                    title={reminder.content}
                  >
                    {reminder.content}
                  </div>
                  <div
                    className="mt-3 truncate text-xs text-muted-foreground"
                    title={reminderPeriod ?? "持续发布"}
                  >
                    {reminderPeriod ?? "持续发布"}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {reminderIndex + 1}/{popupAnnouncements.length}
                </Badge>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={advanceReminder}>
                {hasNextReminder ? "下一条" : "取消"}
              </Button>
              <Button variant="outline" onClick={closeReminderForever}>
                以后都不提醒
              </Button>
              <Button onClick={closeReminderForToday}>今日不再提醒</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Alert
        key={current.id}
        className={cn(
          "min-h-11 rounded-lg border px-2.5 py-1.5 shadow-sm animate-in fade-in-0 slide-in-from-bottom-1 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-x-2 xl:grid-cols-[auto_minmax(0,1fr)_auto_auto] [&>svg]:row-span-1 [&>svg]:translate-y-0",
          levelClasses[current.level]
        )}
      >
        {icons[current.level]}
        <div className="col-start-2 row-start-1 flex min-w-0 flex-col gap-0.5 md:flex-row md:items-center md:gap-2">
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 md:max-w-[34%]">
            <span
              className="truncate text-[13px] font-semibold leading-5"
              title={current.title}
            >
              {current.title}
            </span>
            <Badge variant="outline" className="h-5 shrink-0 bg-white/55 px-1.5 text-[11px] dark:border-white/10 dark:bg-white/[0.08]">
              {levelLabels[current.level]}
            </Badge>
            {hasMultiple && (
              <Badge variant="outline" className="h-5 shrink-0 bg-white/55 px-1.5 text-[11px] dark:border-white/10 dark:bg-white/[0.08]">
                {currentIndex + 1}/{announcements.length}
              </Badge>
            )}
          </div>
          <p
            className="line-clamp-1 min-w-0 cursor-help text-xs leading-5 opacity-85"
            title={current.content}
          >
            {current.content}
          </p>
        </div>
        {hasMultiple && (
          <div className="col-start-2 mt-1 flex items-center gap-1 justify-self-start md:col-start-3 md:row-start-1 md:mt-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={goToPrevious}
              aria-label="上一条公告"
            >
              <IconChevronLeft />
            </Button>
            <div className="flex items-center gap-1">
              {announcements.map((announcement, index) => (
                <button
                  key={announcement.id}
                  type="button"
                  className={cn(
                    "size-1.5 rounded-full bg-current opacity-30 transition",
                    index === currentIndex && "w-4 opacity-90"
                  )}
                  aria-label={`切换到第 ${index + 1} 条公告`}
                  aria-current={index === currentIndex}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={goToNext}
              aria-label="下一条公告"
            >
              <IconChevronRight />
            </Button>
          </div>
        )}
        <span
          className={cn(
            "col-start-2 mt-1 hidden shrink-0 truncate text-xs leading-5 opacity-70 md:col-start-3 md:row-start-1 md:mt-0 md:block md:justify-self-end md:max-w-52",
            hasMultiple && "md:hidden xl:col-start-4 xl:block"
          )}
          title={period ?? "持续发布"}
        >
          {period ?? "持续发布"}
        </span>
      </Alert>
    </div>
  )
}
