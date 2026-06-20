export type Role = "admin" | "user"

export type User = {
  id: string
  name: string
  email?: string
  role: Role
  status?: "active" | "suspended"
  planId?: string | null
  plan_id?: string | null
  quotaBalance?: number
  quota_balance?: number
  emailVerifiedAt?: string | null
  email_verified_at?: string | null
  twoFactorEnabled?: boolean
  two_factor_enabled?: boolean
  hasPassword?: boolean
  has_password?: boolean
  avatarUrl?: string
  avatar_url?: string
  is_admin?: boolean
  linuxdoId?: string | null
  linuxdo_id?: string | null
  lastLoginAt?: string | null
  last_login_at?: string | null
  createdAt?: string | null
  created_at?: string | null
}

export type InstallStatus = {
  installed: boolean
  install_state?: "uninstalled" | "installed" | "installed_needs_config" | "config_error"
  installState?: "uninstalled" | "installed" | "installed_needs_config" | "config_error"
  state_message?: string
  stateMessage?: string
  missing_config?: string[]
  missingConfig?: string[]
  config_error?: boolean
  configError?: boolean
  build?: BuildInfo
  administratorBound?: boolean
  admin_bound?: boolean
  mimo_configured?: boolean
  linuxDoConfigured?: boolean
  linuxdo_configured?: boolean
  linuxDoLoginEnabled?: boolean
  linuxdo_login_enabled?: boolean
  registrationEnabled?: boolean
  registration_enabled?: boolean
  emailAuthEnabled?: boolean
  email_auth_enabled?: boolean
  email_configured?: boolean
  php_version?: string
  checks?: Record<string, boolean>
  deployment?: {
    mode?: "source" | "docker"
    label?: string
  }
}

export type BuildInfo = {
  version?: string | null
  built_at?: string | null
  builtAt?: string | null
  commit?: string | null
}

export type UpdateLatestInfo = {
  ok: boolean
  version?: string | null
  commit?: string | null
  built_at?: string | null
  published_at?: string | null
  changelog_url?: string | null
  source_zip_url?: string | null
  source_sha256?: string | null
  docker_image?: string | null
  migration_required?: boolean
  body?: string | null
  manifest_url?: string | null
  error?: string | null
}

export type UpdateStatus = {
  current: BuildInfo
  latest: UpdateLatestInfo
  update_available: boolean
  updateAvailable?: boolean
  deployment: {
    mode: "source" | "docker"
    label: string
  }
  executor: {
    enabled: boolean
    message: string
  }
  commands: string[]
  checked_at?: string
  checkedAt?: string
}

export type UpdateUpgradeResult = {
  executed: boolean
  message: string
  pid?: string | null
  log_path?: string | null
  commands: string[]
  status: UpdateStatus
}

export type HealthCheck = {
  ok: boolean
  message: string
}

export type HealthReport = {
  status: "ok" | "degraded" | "error"
  checked_at?: string
  checkedAt?: string
  build?: BuildInfo
  checks: Record<string, HealthCheck>
}

export type MimoConfig = {
  base_url?: string | null
  api_key?: string
  enabled?: boolean
  configured?: boolean
}

export type BasicInfoConfig = {
  system_name?: string | null
  site_title?: string | null
  site_subtitle?: string | null
  icon_url?: string | null
  iconUrl?: string | null
  app_url?: string | null
  frontend_url?: string | null
  icp_record?: string | null
  footer_text?: string | null
  support_email?: string | null
  build?: BuildInfo
}

export type EmailEncryption = "none" | "tls" | "ssl"
export type EmailDriver = "smtp" | "api"
export type EmailApiProvider = "generic_json" | "resend"

export type EmailAuthConfig = {
  enabled: boolean
  registration_enabled?: boolean
  verification_required?: boolean
  driver?: EmailDriver
  smtp_host?: string
  smtp_port?: number
  smtp_username?: string
  smtp_password?: string
  smtp_encryption?: EmailEncryption
  mail_api_provider?: EmailApiProvider
  mail_api_endpoint?: string
  mail_api_token?: string
  mail_from_address?: string
  mail_from_name?: string
  verification_subject?: string
  verification_body?: string
  two_factor_subject?: string
  two_factor_body?: string
}

export type InstallPayload = {
  app_url?: string
  frontend_url?: string
  admin_name?: string
  admin_email?: string
  admin_password?: string
  admin_password_confirmation?: string
  db_connection?: "sqlite" | "mysql"
  db_host?: string
  db_port?: number
  db_database?: string
  db_username?: string
  db_password?: string
  linuxdo_client_id?: string
  linuxdo_client_secret?: string
  linuxdo_redirect_uri?: string
  mimo_api_key?: string
  mimo_base_url?: string
  email_auth?: EmailAuthConfig
}

export type EmailLoginPayload = {
  email: string
  password: string
}

export type EmailLoginResult =
  | {
      user: User
      twoFactorRequired: false
      email?: string
    }
  | {
      user: null
      twoFactorRequired: true
      email: string
    }

export type EmailRegisterPayload = EmailLoginPayload & {
  name: string
  password_confirmation: string
}

export type TaskStatus = "queued" | "running" | "completed" | "failed"

export type TaskSummaryItem = {
  label: string
  value?: string | number | boolean | null
}

export type TaskRequestSummary = {
  sections?: TaskSummaryItem[]
  options?: TaskSummaryItem[]
}

export type AudioTask = {
  id: string
  module: AudioModule
  title: string
  status: TaskStatus
  progress: number
  createdAt: string
  startedAt?: string | null
  completedAt?: string | null
  outputUrl?: string
  summary?: string
  errorMessage?: string | null
  requestSummary?: TaskRequestSummary | null
  userId?: string
  userName?: string | null
  userEmail?: string | null
  fileName?: string | null
  fileMimeType?: string | null
  fileSize?: number | null
  apiConfigSource?: "system" | "user" | null
  billable?: boolean | null
  quotaCost?: number | null
  quotaLedgerId?: string | null
}

export type AudioModule =
  | "speech-recognition"
  | "speech-synthesis"
  | "voice-design"
  | "voice-clone"

export type DashboardTaskStats = {
  total: number
  queued: number
  running: number
  completed: number
  failed: number
  modules: Partial<Record<AudioModule, number>> & Record<string, number>
}

export type DashboardUserStats = {
  total: number
  active: number
  suspended: number
  verified: number
  linuxdo_linked: number
  linuxDoLinked?: number
}

export type DashboardSettingsStats = {
  total: number
}

export type DashboardData = {
  tasks: {
    items: AudioTask[]
    stats: DashboardTaskStats
  }
  billing: BillingConfig
  users?: DashboardUserStats | null
  mimo?: MimoConfig | null
  email?: EmailAuthConfigState | null
  settings?: DashboardSettingsStats | null
  updated_at?: string
  updatedAt?: string
}

export type AuditEvent = {
  id: string
  actor: string
  action: string
  target: string
  createdAt: string
}

export type AnnouncementLevel =
  | "info"
  | "success"
  | "warning"
  | "destructive"

export type AnnouncementAudience = "all" | "admin" | "user"

export type Announcement = {
  id: string
  title: string
  content: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  active: boolean
  startsAt?: string | null
  starts_at?: string | null
  endsAt?: string | null
  ends_at?: string | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
}

export type SystemSetting = {
  key: string
  value: string
  updatedAt: string
}

export type AudioRetentionConfig = {
  enabled: boolean
  retention_days: number
  retentionDays?: number
  last_pruned_at?: string | null
  lastPrunedAt?: string | null
  last_pruned_count?: number
  lastPrunedCount?: number
}

export type EmailAuthConfigState = {
  enabled: boolean
  registration_enabled?: boolean
  verification_required?: boolean
  linuxdo?: {
    enabled?: boolean
    client_id?: string | null
    client_secret_configured?: boolean
    redirect_uri?: string | null
    configured?: boolean
  }
  driver?: EmailDriver
  smtp?: {
    host?: string | null
    port?: number | null
    username?: string | null
    password_configured?: boolean
    encryption?: string | null
  }
  api?: {
    provider?: EmailApiProvider | string | null
    endpoint?: string | null
    token_configured?: boolean
  }
  sender?: {
    address?: string | null
    name?: string | null
  }
  templates?: {
    verification?: EmailTemplateConfig
    two_factor?: EmailTemplateConfig
  }
  smtp_configured?: boolean
  api_configured?: boolean
  sender_configured?: boolean
}

export type EmailTemplateConfig = {
  subject?: string | null
  body?: string | null
}

export type BillingPlan = {
  id: string
  name: string
  quota: number
  base_amount: string
  credit_amount: string
  enabled: boolean
}

export type UsageCostKey = "asr" | "tts" | "voice_design" | "voice_clone"
export type UsageCosts = Record<UsageCostKey, number>

export type CheckinConfig = {
  enabled: boolean
  daily_quota: number
  checked_today?: boolean
  date?: string
}

export type BillingConfig = {
  enabled: boolean
  provider: string
  provider_name: string
  configured: boolean
  default_plan_id?: string | null
  credit_multiplier: number
  usage_costs?: UsageCosts
  checkin?: CheckinConfig
  plans: BillingPlan[]
  gateway_url?: string
  client_id?: string
  client_secret?: string
  client_secret_configured?: boolean
  notify_url?: string | null
  return_url?: string | null
  plans_json?: string
  plans_revision?: number
  plans_history?: Array<Record<string, unknown>>
}

export type BillingCheckout = {
  checkout_url: string
  checkout_method: "POST"
  checkout_params: Record<string, string | number | boolean>
  out_trade_no: string
}

export type QuotaRecord = {
  id: string
  type: string
  typeLabel: string
  module?: string | null
  moduleLabel?: string | null
  amount: number
  balanceAfter: number
  description?: string | null
  metadata?: Record<string, unknown>
  audioJobId?: string | null
  createdAt?: string | null
}

export type QuotaSummary = {
  balance: number
  usage_costs: UsageCosts
  checkin: CheckinConfig
  records: QuotaRecord[]
}
