import type { InstallStatus, User } from "@/lib/types"

const USER_KEY = "mimo.user"
const INSTALL_KEY = "mimo.install"
const SESSION_EVENT = "mimo:session-change"

function notifySessionChange() {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new Event(SESSION_EVENT))
}

export function setSession(user: User) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  notifySessionChange()
}

export function clearSession() {
  window.localStorage.removeItem(USER_KEY)
  notifySessionChange()
}

export function onSessionChange(listener: () => void) {
  window.addEventListener(SESSION_EVENT, listener)
  window.addEventListener("storage", listener)

  return () => {
    window.removeEventListener(SESSION_EVENT, listener)
    window.removeEventListener("storage", listener)
  }
}

export function getStoredUser() {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem(USER_KEY)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function getStoredInstallStatus(): InstallStatus | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem(INSTALL_KEY)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as InstallStatus
  } catch {
    return null
  }
}

export function setStoredInstallStatus(status: InstallStatus) {
  window.localStorage.setItem(INSTALL_KEY, JSON.stringify(status))
}
