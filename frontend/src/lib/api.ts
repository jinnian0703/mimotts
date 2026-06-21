import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementLevel,
  AudioModule,
  AudioRetentionConfig,
  AudioTask,
  AuditEvent,
  BasicInfoConfig,
  BillingCheckout,
  BillingConfig,
  DashboardData,
  EmailLoginResult,
  EmailLoginPayload,
  EmailRegisterPayload,
  EmailAuthConfigState,
  HealthReport,
  InstallStatus,
  InstallPayload,
  MimoConfig,
  PaginatedTasks,
  PaginatedUsers,
  PaginationMeta,
  QuotaRecord,
  QuotaSummary,
  Role,
  SystemSetting,
  TaskUserOption,
  UpdateStatus,
  UpdateUpgradeResult,
  User,
  UserStatus,
} from "@/lib/types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api"
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const CSRF_EXEMPT_PATHS = new Set(["/install"])

type RequestOptions = RequestInit
let csrfToken: string | null = null

type TaskPageParams = {
  page?: number
  pageSize?: number
  query?: string
  module?: AudioModule | "all"
  status?: string
  userId?: string
}

type UserPageParams = {
  page?: number
  pageSize?: number
  query?: string
  role?: Role | "all"
  status?: UserStatus | "all"
  planId?: string
  email?: "verified" | "unverified" | "all"
  linuxDo?: "linked" | "unlinked" | "all"
}

type PaginationResponse = Partial<PaginationMeta> & {
  current_page?: number
  per_page?: number
  last_page?: number
}

type TaskPageResponse = {
  tasks?: AudioTask[]
  job?: AudioTask[]
  pagination?: PaginationResponse
  filters?: {
    users?: TaskUserOption[]
  }
}

type UserPageResponse = {
  users?: User[]
  pagination?: PaginationResponse
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export function apiPath(path: string) {
  const rawEndpoint = path.startsWith("/") ? path : `/${path}`
  const endpoint = rawEndpoint.replace(/^\/api(?=\/)/, "")
  const base = API_BASE_URL.trim() || "/api"

  if (base.includes("?")) {
    const separator =
      base.endsWith("=") || base.endsWith("?") || base.endsWith("&") ? "" : "="

    return `${base}${separator}${endpoint}`
  }

  return `${base.replace(/\/$/, "")}${endpoint}`
}

async function fetchCsrfToken() {
  if (typeof window === "undefined") {
    return null
  }

  if (csrfToken) {
    return csrfToken
  }

  let response: Response

  try {
    response = await fetch(apiPath("/csrf-token"), {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    })
  } catch {
    return null
  }

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { token?: string }
  csrfToken = data.token ?? null

  return csrfToken
}

function buildHeaders(headers: HeadersInit | undefined, body: BodyInit | null | undefined) {
  const requestHeaders = new Headers(headers)

  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/json")
  }

  if (!(body instanceof FormData) && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json")
  }

  return requestHeaders
}

async function fetchWithSession(path: string, init: RequestInit) {
  const method = (init.method ?? "GET").toUpperCase()
  const headers = buildHeaders(init.headers, init.body ?? null)
  const shouldAttachCsrf =
    UNSAFE_METHODS.has(method) && !CSRF_EXEMPT_PATHS.has(path)

  if (shouldAttachCsrf) {
    const token = await fetchCsrfToken()

    if (token) {
      headers.set("X-CSRF-TOKEN", token)
    }
  }

  let response = await fetch(apiPath(path), {
    ...init,
    credentials: "include",
    headers,
  })

  if (response.status === 419 && shouldAttachCsrf) {
    csrfToken = null
    const retryHeaders = buildHeaders(init.headers, init.body ?? null)
    const token = await fetchCsrfToken()

    if (token) {
      retryHeaders.set("X-CSRF-TOKEN", token)
      response = await fetch(apiPath(path), {
        ...init,
        credentials: "include",
        headers: retryHeaders,
      })
    }
  }

  return response
}

async function request<T>(
  path: string,
  { headers, ...init }: RequestOptions = {}
) {
  const response = await fetchWithSession(path, { ...init, headers })

  if (!response.ok) {
    let message = `请求失败：${response.status}`

    try {
      const data = (await response.json()) as {
        error?: { message?: string }
        message?: string
      }
      message = data.error?.message ?? data.message ?? message
    } catch {
      message = response.statusText || message
    }

    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function mapUser(input: Partial<User> & { is_admin?: boolean }): User {
  return {
    id: String(input.id ?? ""),
    name: input.name ?? "",
    email: input.email,
    role: input.role ?? (input.is_admin ? "admin" : "user"),
    status: input.status ?? "active",
    planId: input.planId ?? input.plan_id,
    quotaBalance: input.quotaBalance ?? input.quota_balance ?? 0,
    emailVerifiedAt: input.emailVerifiedAt ?? input.email_verified_at,
    twoFactorEnabled: input.twoFactorEnabled ?? input.two_factor_enabled ?? false,
    hasPassword: input.hasPassword ?? input.has_password ?? false,
    avatarUrl: input.avatarUrl ?? input.avatar_url,
    linuxdoId: input.linuxdoId ?? input.linuxdo_id,
    lastLoginAt: input.lastLoginAt ?? input.last_login_at,
    createdAt: input.createdAt ?? input.created_at,
  }
}

function mapAnnouncement(input: Partial<Announcement>): Announcement {
  return {
    id: String(input.id ?? ""),
    title: input.title ?? "",
    content: input.content ?? "",
    level: (input.level ?? "info") as AnnouncementLevel,
    audience: (input.audience ?? "all") as AnnouncementAudience,
    active: input.active !== false,
    showPopup: input.showPopup ?? input.show_popup ?? true,
    show_popup: input.showPopup ?? input.show_popup ?? true,
    startsAt: input.startsAt ?? input.starts_at,
    endsAt: input.endsAt ?? input.ends_at,
    createdAt: input.createdAt ?? input.created_at,
    updatedAt: input.updatedAt ?? input.updated_at,
  }
}

function endpointForModule(module: AudioModule) {
  return {
    "speech-recognition": "/mimo/asr",
    "speech-synthesis": "/mimo/tts",
    "voice-design": "/mimo/voice-design",
    "voice-clone": "/mimo/voice-clone",
  }[module]
}

function withQuery(path: string, params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === "all") {
      continue
    }

    search.set(key, String(value))
  }

  const query = search.toString()

  return query ? `${path}?${query}` : path
}

function mapPaginationMeta(
  pagination: PaginationResponse | undefined,
  fallbackTotal: number,
  fallbackPerPage = 20
): PaginationMeta {
  const meta = pagination ?? {}
  const page = Number(meta.page ?? meta.current_page ?? 1)
  const rawPerPage = meta.perPage ?? meta.per_page ?? fallbackPerPage
  const perPage = Number(rawPerPage || fallbackPerPage)
  const total = Number(meta.total ?? fallbackTotal)
  const pageCount = Number(
    meta.pageCount ?? meta.last_page ?? Math.max(1, Math.ceil(total / perPage))
  )

  return {
    page,
    perPage,
    total,
    pageCount,
  }
}

function mapTaskPagination(data: TaskPageResponse): PaginatedTasks {
  const tasks = data.tasks ?? data.job ?? []

  return {
    tasks,
    pagination: mapPaginationMeta(data.pagination, tasks.length, tasks.length || 20),
  }
}

function mapUserPagination(data: UserPageResponse): PaginatedUsers {
  const users = (data.users ?? []).map(mapUser)

  return {
    users,
    pagination: mapPaginationMeta(data.pagination, users.length, users.length || 20),
  }
}

export const api = {
  installStatus() {
    return request<InstallStatus>("/install/status").then((status) => ({
      ...status,
      installState:
        status.installState ?? status.install_state ?? "uninstalled",
      stateMessage:
        status.stateMessage ?? status.state_message ?? "",
      missingConfig:
        status.missingConfig ?? status.missing_config ?? [],
      configError:
        status.configError ?? status.config_error ?? false,
      administratorBound:
        status.administratorBound ?? status.admin_bound ?? false,
      linuxDoConfigured:
        status.linuxDoConfigured ?? status.linuxdo_configured ?? false,
      linuxDoLoginEnabled:
        status.linuxDoLoginEnabled ??
        status.linuxdo_login_enabled ??
        status.linuxDoConfigured ??
        status.linuxdo_configured ??
        false,
      registrationEnabled:
        status.registrationEnabled ?? status.registration_enabled ?? true,
      emailAuthEnabled:
        status.emailAuthEnabled ??
        status.email_auth_enabled ??
        status.email_configured ??
        false,
    }))
  },
  async health() {
    const response = await fetchWithSession("/health", { method: "GET" })
    const report = (await response.json()) as HealthReport

    if (!response.ok && !report.status) {
      throw new ApiError("健康检查失败", response.status)
    }

    return {
      ...report,
      checkedAt: report.checkedAt ?? report.checked_at,
      build: report.build
        ? {
            ...report.build,
            builtAt: report.build.builtAt ?? report.build.built_at,
          }
        : undefined,
    }
  },
  install(payload: InstallPayload) {
    return request<{ installed: boolean; user: User }>("/install", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((data) => ({
      installed: data.installed,
      user: mapUser(data.user),
    }))
  },
  loginWithLinuxDo() {
    return request<{ authorize_url: string }>("/auth/linuxdo/redirect").then(
      ({ authorize_url }) => ({ redirectUrl: authorize_url })
    )
  },
  bindLinuxDo() {
    return request<{ authorize_url: string }>("/account/linuxdo/redirect").then(
      ({ authorize_url }) => ({ redirectUrl: authorize_url })
    )
  },
  loginWithEmail(payload: EmailLoginPayload) {
    return request<{
      user?: User
      two_factor_required?: boolean
      email?: string
    }>("/auth/email/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((data): EmailLoginResult => {
      if (data.two_factor_required) {
        return {
          user: null,
          twoFactorRequired: true,
          email: data.email ?? payload.email,
        }
      }

      return {
        user: mapUser(data.user ?? {}),
        twoFactorRequired: false,
      }
    })
  },
  verifyEmailTwoFactor(payload: { email: string; code: string }) {
    return request<{ user: User }>("/auth/email/two-factor", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then(({ user }) => mapUser(user))
  },
  registerWithEmail(payload: EmailRegisterPayload) {
    return request<{
      user?: User
      verification_required?: boolean
      message?: string
    }>("/auth/email/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then((data) => ({
      user: data.user ? mapUser(data.user) : null,
      verificationRequired: data.verification_required === true,
      message: data.message,
    }))
  },
  verifyEmail(payload: { email: string; token: string }) {
    return request<{ user: User }>("/auth/email/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then(({ user }) => mapUser(user))
  },
  me() {
    return request<{ user: User }>("/me").then(({ user }) => mapUser(user))
  },
  dashboard() {
    return request<{ dashboard: DashboardData }>("/dashboard").then(
      ({ dashboard }) => ({
        ...dashboard,
        users: dashboard.users
          ? {
              ...dashboard.users,
              linuxDoLinked:
                dashboard.users.linuxDoLinked ??
                dashboard.users.linuxdo_linked,
            }
          : dashboard.users,
        updatedAt: dashboard.updatedAt ?? dashboard.updated_at,
      })
    )
  },
  logout() {
    return request<void>("/auth/logout", { method: "POST" })
  },
  updateAccountProfile(payload: { name: string }) {
    return request<{ user: User }>("/account/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then(({ user }) => mapUser(user))
  },
  updateAccountEmail(payload: { email: string; current_password?: string }) {
    return request<{ user: User; verification_required?: boolean }>(
      "/account/email",
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    ).then(({ user, verification_required }) => ({
      user: mapUser(user),
      verificationRequired: verification_required === true,
    }))
  },
  updateAccountPassword(payload: {
    current_password?: string
    password: string
    password_confirmation: string
  }) {
    return request<{ user: User }>("/account/password", {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then(({ user }) => mapUser(user))
  },
  sendTwoFactorChallenge(payload: { current_password?: string }) {
    return request<{ sent: boolean; expires_at?: string }>(
      "/account/two-factor/challenge",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    )
  },
  updateTwoFactor(payload: {
    enabled: boolean
    code?: string
    current_password?: string
  }) {
    return request<{ user: User }>("/account/two-factor", {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then(({ user }) => mapUser(user))
  },
  unlinkLinuxDo(payload: { current_password?: string }) {
    return request<{ user: User }>("/account/linuxdo", {
      method: "DELETE",
      body: JSON.stringify(payload),
    }).then(({ user }) => mapUser(user))
  },
  deleteAccount(payload: { current_password?: string; confirmation: string }) {
    return request<void>("/account", {
      method: "DELETE",
      body: JSON.stringify(payload),
    })
  },
  adminMimoConfig() {
    return request<{ config: MimoConfig }>("/admin/mimo-config").then(
      ({ config }) => config
    )
  },
  adminBasicInfo() {
    return request<{ config: BasicInfoConfig }>("/admin/basic-info").then(
      ({ config }) => config
    )
  },
  basicInfo() {
    return request<{ config: BasicInfoConfig }>("/basic-info").then(
      ({ config }) => config
    )
  },
  saveAdminBasicInfo(config: BasicInfoConfig) {
    return request<{ config: BasicInfoConfig }>("/admin/basic-info", {
      method: "PUT",
      body: JSON.stringify(config),
    }).then(({ config }) => config)
  },
  uploadAdminBasicIcon(file: File) {
    const form = new FormData()
    form.append("icon", file)

    return request<{ config: BasicInfoConfig; url: string }>("/admin/basic-icon", {
      method: "POST",
      body: form,
    }).then(({ config }) => config)
  },
  adminAudioRetention() {
    return request<{ config: AudioRetentionConfig }>("/admin/audio-retention").then(
      ({ config }) => config
    )
  },
  audioRetention() {
    return request<{ config: AudioRetentionConfig }>("/audio-retention").then(
      ({ config }) => config
    )
  },
  saveAdminAudioRetention(config: Pick<AudioRetentionConfig, "enabled" | "retention_days">) {
    return request<{ config: AudioRetentionConfig }>("/admin/audio-retention", {
      method: "PUT",
      body: JSON.stringify(config),
    }).then(({ config }) => config)
  },
  saveAdminMimoConfig(config: MimoConfig & { api_key?: string }) {
    return request<{ config: MimoConfig }>("/admin/mimo-config", {
      method: "PUT",
      body: JSON.stringify(config),
    }).then(({ config }) => config)
  },
  adminEmailAuthConfig() {
    return request<{ config: EmailAuthConfigState }>(
      "/admin/email-auth-config"
    ).then(({ config }) => config)
  },
  saveAdminEmailAuthConfig(config: {
    enabled?: boolean
    registration_enabled?: boolean
    driver?: string
    linuxdo_enabled?: boolean
    linuxdo_client_id?: string
    linuxdo_client_secret?: string
    linuxdo_redirect_uri?: string
    smtp_host?: string
    smtp_port?: number
    smtp_username?: string
    smtp_password?: string
    smtp_encryption?: string
    mail_api_provider?: string
    mail_api_endpoint?: string
    mail_api_token?: string
    mail_from_address?: string
    mail_from_name?: string
    verification_required?: boolean
    verification_subject?: string
    verification_body?: string
    two_factor_subject?: string
    two_factor_body?: string
  }) {
    return request<{ config: EmailAuthConfigState }>(
      "/admin/email-auth-config",
      {
        method: "PUT",
        body: JSON.stringify(config),
      }
    ).then(({ config }) => config)
  },
  testAdminEmailAuthConfig(config: {
    to?: string
    driver?: string
    smtp_host?: string
    smtp_port?: number
    smtp_username?: string
    smtp_password?: string
    smtp_encryption?: string
    mail_api_provider?: string
    mail_api_endpoint?: string
    mail_api_token?: string
    mail_from_address?: string
    mail_from_name?: string
  }) {
    return request<{ sent: boolean; message: string }>(
      "/admin/email-auth-config/test",
      {
        method: "POST",
        body: JSON.stringify(config),
      }
    )
  },
  billingConfig() {
    return request<{ config: BillingConfig }>("/billing/config").then(
      ({ config }) => config
    )
  },
  createBillingCheckout(planId: string) {
    return request<BillingCheckout>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan_id: planId }),
    })
  },
  quotaSummary() {
    return request<{ quota: QuotaSummary }>("/quota/summary").then(
      ({ quota }) => quota
    )
  },
  checkIn() {
    return request<{
      checked: boolean
      message: string
      quota: QuotaSummary
    }>("/quota/check-in", {
      method: "POST",
    })
  },
  adminBillingConfig() {
    return request<{ config: BillingConfig }>("/admin/billing-config").then(
      ({ config }) => config
    )
  },
  saveAdminBillingConfig(config: Partial<BillingConfig>) {
    return request<{ config: BillingConfig }>("/admin/billing-config", {
      method: "PUT",
      body: JSON.stringify(config),
    }).then(({ config }) => config)
  },
  userMimoConfig() {
    return request<{ config: MimoConfig }>("/user/api-config").then(
      ({ config }) => config
    )
  },
  saveUserMimoConfig(config: MimoConfig & { api_key?: string }) {
    return request<{ config: MimoConfig }>("/user/api-config", {
      method: "PUT",
      body: JSON.stringify(config),
    }).then(({ config }) => config)
  },
  taskPage(params: TaskPageParams = {}) {
    return request<TaskPageResponse>(
      withQuery("/mimo/jobs", {
        page: params.page,
        per_page: params.pageSize,
      })
    ).then(mapTaskPagination)
  },
  tasks() {
    return api.taskPage().then(({ tasks }) => tasks)
  },
  announcements() {
    return request<{ announcements: Announcement[] }>("/announcements").then(
      ({ announcements }) => announcements.map(mapAnnouncement)
    )
  },
  adminAnnouncements() {
    return request<{ announcements: Announcement[] }>("/admin/announcements").then(
      ({ announcements }) => announcements.map(mapAnnouncement)
    )
  },
  createAdminAnnouncement(payload: {
    title: string
    content: string
    level: AnnouncementLevel
    audience: AnnouncementAudience
    active: boolean
    show_popup?: boolean
    starts_at?: string | null
    ends_at?: string | null
  }) {
    return request<{ announcement: Announcement }>("/admin/announcements", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then(({ announcement }) => mapAnnouncement(announcement))
  },
  updateAdminAnnouncement(
    id: string,
    payload: {
      title: string
      content: string
      level: AnnouncementLevel
      audience: AnnouncementAudience
      active: boolean
      show_popup?: boolean
      starts_at?: string | null
      ends_at?: string | null
    }
  ) {
    return request<{ announcement: Announcement }>(`/admin/announcements/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then(({ announcement }) => mapAnnouncement(announcement))
  },
  deleteAdminAnnouncement(id: string) {
    return request<void>(`/admin/announcements/${id}`, {
      method: "DELETE",
    })
  },
  runAudioTask(module: AudioModule, form: FormData) {
    return request<{ job: AudioTask }>(endpointForModule(module), {
      method: "POST",
      body: form,
    }).then(({ job }) => job)
  },
  deleteTask(id: string) {
    return request<void>(`/mimo/jobs/${id}`, {
      method: "DELETE",
    })
  },
  userPage(params: UserPageParams = {}) {
    return request<UserPageResponse>(
      withQuery("/admin/users", {
        page: params.page,
        per_page: params.pageSize,
        q: params.query,
        role: params.role,
        status: params.status,
        plan_id: params.planId,
        email: params.email,
        linuxdo: params.linuxDo,
      })
    ).then(mapUserPagination)
  },
  users() {
    return api.userPage().then(({ users }) => users)
  },
  updateUser(
    id: string,
    payload: {
      name: string
      email?: string | null
      role: Role
      status: UserStatus
      plan_id?: string | null
      quota_balance?: number
      quota_adjustment_reason?: string
    }
  ) {
    return request<{ user: User }>(`/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then(({ user }) => mapUser(user))
  },
  removeDeletedUser(id: string) {
    return request<{ removed_id: string }>(`/admin/users/${id}`, {
      method: "DELETE",
    }).then(({ removed_id }) => removed_id)
  },
  adjustUserQuota(
    id: string,
    payload: {
      mode: "add" | "subtract" | "set"
      amount: number
      reason: string
    }
  ) {
    return request<{ user: User; entry: QuotaRecord | null }>(
      `/admin/users/${id}/quota-adjustments`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ).then(({ user, entry }) => ({ user: mapUser(user), entry }))
  },
  bulkUsers(payload: {
    ids: string[]
    action: "activate" | "suspend" | "set_plan"
    plan_id?: string | null
  }) {
    return request<{ users?: User[] }>("/admin/users/bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then(({ users }) => (users ?? []).map(mapUser))
  },
  adminTaskPage(params: TaskPageParams = {}) {
    return request<TaskPageResponse>(
      withQuery("/admin/jobs", {
        page: params.page,
        per_page: params.pageSize,
        q: params.query,
        module: params.module,
        status: params.status,
        user_id: params.userId,
      })
    ).then((data) => ({
      ...mapTaskPagination(data),
      filters: data.filters,
    }))
  },
  adminTasks() {
    return api.adminTaskPage().then(({ tasks }) => tasks)
  },
  deleteAdminTask(id: string) {
    return request<void>(`/admin/jobs/${id}`, {
      method: "DELETE",
    })
  },
  bulkDeleteAdminTasks(ids: string[]) {
    return request<{ deleted_ids: string[] }>("/admin/jobs/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }).then(({ deleted_ids }) => deleted_ids)
  },
  auditEvents() {
    return request<{ audits: AuditEvent[] }>("/admin/audits").then(
      ({ audits }) => audits
    )
  },
  systemSettings() {
    return request<{ settings: SystemSetting[] }>("/admin/settings").then(
      ({ settings }) => settings
    )
  },
  adminUpdateStatus() {
    return request<UpdateStatus>("/admin/update/status").then((status) => ({
      ...status,
      updateAvailable: status.updateAvailable ?? status.update_available,
      checkedAt: status.checkedAt ?? status.checked_at,
    }))
  },
  runAdminUpdate(mode?: "source" | "docker") {
    return request<UpdateUpgradeResult>("/admin/update/upgrade", {
      method: "POST",
      body: JSON.stringify({ mode }),
    })
  },
}
