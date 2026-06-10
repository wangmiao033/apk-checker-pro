export type AbiName = 'armeabi' | 'armeabi-v7a' | 'arm64-v8a' | 'x86' | 'x86_64'
export type AbiInfo = Record<AbiName, boolean | null>

export type DetectionStatus = 'passed' | 'failed' | 'parse_error'
export type DetectionMode = 'full' | 'degraded' | 'unavailable'
export type LogStatus = 'success' | 'failed' | 'skipped'
export type HardCheckStatus = 'pass' | 'blocker' | 'warning' | 'unknown'
export type PrivacyCheckStatus = 'found' | 'warning' | 'high_risk' | 'unknown'

export type ApkHash = {
  md5: string
  sha1: string
  sha256: string
}

export type DetectionLogItem = {
  key: 'zip' | 'manifest' | 'abi' | 'signature' | 'http'
  label: string
  status: LogStatus
  message: string
}

export type ToolHealth = {
  unzip: boolean
  aapt: boolean
  apksigner: boolean
  strings: boolean
}

export type EngineHealth = {
  mode: DetectionMode
  tools: ToolHealth
  message: string
  checkedAt: string
}

export type ReportMeta = {
  reportId: string
  detectedAt: string
  ruleVersion: string
  detectionMode: DetectionMode
}

export type ApkInfo = {
  fileName: string
  fileSize: string
  fileSizeBytes: number
  packageName: string | null
  appName: string | null
  versionCode: string | null
  versionName: string | null
  minSdkVersion: number | null
  targetSdkVersion: number | null
  hasSignature: boolean | null
  parseSuccess: boolean
}

export type RiskLevel = 'blocker' | 'high' | 'medium' | 'low' | 'info'

export type RiskItem = {
  level: RiskLevel
  title: string
  detail: string
  currentValue?: string | number | null
  expectedValue?: string
  fix?: string
}

export type HardCheckItem = {
  key: 'targetSdkVersion' | 'abiCompatibility'
  title: string
  status: HardCheckStatus
  level: RiskLevel
  currentValue: string
  expectedValue: string
  description: string
  suggestion: string
  unityTip?: string
}

export type PrivacyFinding = {
  key: string
  label: string
  detail: string
  suggestion?: string
}

export type PrivacyCheckItem = {
  key: 'permissions' | 'privacyResources' | 'preConsentCollection'
  title: string
  status: PrivacyCheckStatus
  level: RiskLevel
  description: string
  findings: PrivacyFinding[]
  suggestion: string
}

export type ChannelCheck = {
  id: string
  name: string
  logo: string
  passed: boolean | null
  score: number | null
  messages: string[]
}

export type AnalyzerChecks = {
  hasArm64: boolean | null
  targetSdkOk: boolean | null
  isPure32Bit: boolean | null
  hasHttp: boolean | null
  hasDebugRisk: boolean | null
  hasSensitivePermissions: boolean | null
  hasSignature: boolean | null
  hasCleartextRisk: boolean | null
  hasAllowBackupRisk: boolean | null
}

export type AnalyzeResult = {
  status: DetectionStatus
  grade: 'A' | 'B' | 'C' | 'D' | null
  score: number | null
  summary: string
  generatedAt: string
  reportMeta: ReportMeta
  apkHash: ApkHash
  engine: EngineHealth
  detectionLogs: DetectionLogItem[]
  apkInfo: ApkInfo
  abiInfo: AbiInfo
  checks: AnalyzerChecks
  permissions: string[]
  sensitivePermissions: string[]
  httpUrls: string[]
  debugKeywords: string[]
  risks: RiskItem[]
  hardChecks: HardCheckItem[]
  privacyChecks: PrivacyCheckItem[]
  channelChecks: ChannelCheck[]
  failReasons: string[]
  developerMessage: string
  operationMessage: string
  htmlReport: string
}
