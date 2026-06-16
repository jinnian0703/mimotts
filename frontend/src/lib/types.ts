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
  administratorBound?: boolean
  admin_bound?: boolean
  mimo_configured?: boolean
  linuxDoConfigured?: boolean
  linuxdo_configured?: boolean
  emailAuthEnabled?: boolean
  email_auth_enabled?: boolean
  email_configured?: boolean
  php_version?: string
  checks?: Record<string, boolean>
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
  app_url?: string | null
  frontend_url?: string | null
  icp_record?: string | null
  footer_text?: string | null
  support_email?: string | null
}

export type EmailEncryption = "none" | "tls" | "ssl"
export type EmailDriver = "smtp" | "api"
export type EmailApiProvider = "generic_json" | "resend"

export type EmailAuthConfig = {
  enabled: boolean
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

export type EmailAuthConfigState = {
  enabled: boolean
  verification_required?: boolean
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
  audioJobId?: string | null
  createdAt?: string | null
}

export type QuotaSummary = {
  balance: number
  usage_costs: UsageCosts
  checkin: CheckinConfig
  records: QuotaRecord[]
}
