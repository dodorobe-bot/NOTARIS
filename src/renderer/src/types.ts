export interface SessionInfo {
  userId: string
  username: string
  fullName: string
  email: string | null
  roleCode: string
  roleName: string
  permissions: string[]
  loginAt: string
  lastActivity: string
}

export interface VaultStatus {
  status: 'SETUP' | 'LOCKED' | 'UNLOCKED' | 'DISABLED' | 'ERROR'
  vaultExists: boolean
  dbExists: boolean
  encryptedExists: boolean
  crashRecovered: boolean
  error: string | null
  createdAt: string | null
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  electron: string
  dataRoot: string
  timezone: string
  isPackaged: boolean
}

export interface SettingRow {
  key: string
  value: string
  group: string
  description: string | null
  updatedAt: string
  updatedById: string | null
}

export interface SequenceRow {
  id: string
  key: string
  prefix: string
  pattern: string
  lastNumber: number
  periodKey: string
  resetPeriod: string
  updatedAt: string
}
