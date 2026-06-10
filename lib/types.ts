export type AbiName = 'armeabi' | 'armeabi-v7a' | 'arm64-v8a' | 'x86' | 'x86_64'
export type AbiInfo = Record<AbiName, boolean>

export type ApkInfo = {
  fileName: string
  fileSize: string
  fileSizeBytes: number
  packageName: string
  versionCode: string
  versionName: string
  minSdkVersion: number | null
  targetSdkVersion: number | null
  hasSignature: boolean
  parseSuccess: boolean
}

export type RiskLevel = 'blocker' | 'high' | 'medium' | 'low' | 'info'

export type RiskItem = {
  level: RiskLevel
  title: string
  detail: string
  fix?: string
}

export type ChannelCheck = {
  id: string
  name: string
  logo: string
  passed: boolean
  score: number
  messages: string[]
}

export type AnalyzerChecks = {
  hasArm64: boolean
  targetSdkOk: boolean
  isPure32Bit: boolean
  hasHttp: boolean
  hasDebugRisk: boolean
  hasSensitivePermissions: boolean
  hasSignature: boolean
  hasCleartextRisk: boolean
  hasAllowBackupRisk: boolean
}

export type AnalyzeResult = {
  status: 'passed' | 'failed'
  grade: 'A' | 'B' | 'C' | 'D'
  score: number
  summary: string
  generatedAt: string
  apkInfo: ApkInfo
  abiInfo: AbiInfo
  checks: AnalyzerChecks
  permissions: string[]
  sensitivePermissions: string[]
  httpUrls: string[]
  debugKeywords: string[]
  risks: RiskItem[]
  channelChecks: ChannelCheck[]
  failReasons: string[]
  developerMessage: string
  operationMessage: string
  htmlReport: string
}
