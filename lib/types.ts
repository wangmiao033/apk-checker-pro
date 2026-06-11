export type AbiName = 'armeabi' | 'armeabi-v7a' | 'arm64-v8a' | 'x86' | 'x86_64'
export type AbiInfo = Record<AbiName, boolean | null>

export type DetectionStatus = 'passed' | 'failed' | 'parse_error'
export type DetectionMode = 'full' | 'degraded' | 'unavailable'
export type LogStatus = 'success' | 'failed' | 'skipped'
export type HardCheckStatus = 'pass' | 'blocker' | 'warning' | 'unknown'
export type PrivacyCheckStatus = 'found' | 'warning' | 'high_risk' | 'unknown'
export type StandardDetectionStatus = 'pass' | 'fail' | 'warning' | 'unknown' | 'unsupported' | 'parse_failed' | 'error'
export type StandardSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type ApkHash = {
  md5: string
  sha1: string
  sha256: string
}

export type FileIdentification = {
  originalFileName: string
  normalizedFileName: string
  detectedFileType: 'apk'
  isApkLike: boolean
  isNormalized: boolean
  normalizeReason: string
  identificationEvidence: string[]
  confidence?: number
  entryCount?: number
  totalUncompressedSize?: number
}

export type DetectionLogItem = {
  key: 'upload' | 'zip' | 'manifest' | 'abi' | 'signature' | 'http' | 'scoring'
  label: string
  status: LogStatus
  message: string
  detail?: Record<string, unknown>
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
  originalFileName?: string
  normalizedFileName?: string
  detectedFileType?: string
  isApkLike?: boolean
  isNormalized?: boolean
  normalizeReason?: string
  identificationEvidence?: string[]
  fileSize: string
  fileSizeBytes: number
  packageName: string | null
  appName: string | null
  appLabel?: string | null
  versionCode: string | null
  versionName: string | null
  minSdkVersion: number | null
  targetSdkVersion: number | null
  compileSdkVersion?: number | null
  hasSignature: boolean | null
  parseSuccess: boolean
}

export type AbiDetail = {
  abi: AbiName
  exists: boolean | null
  soCount: number
  sampleSoFiles: string[]
}

export type SignatureInfo = {
  status: 'signed' | 'unsigned' | 'unsupported' | 'unknown'
  isDebugSignature: boolean | null
  schemes: {
    v1: boolean | null
    v2: boolean | null
    v3: boolean | null
    v4: boolean | null
  }
  certificateSha1: string | null
  certificateSha256: string | null
  validFrom: string | null
  validTo: string | null
  rawSummary: string | null
}

export type IconInfo = {
  hasAppIcon: boolean | null
  hasRoundIcon: boolean | null
  hasAdaptiveIcon: boolean | null
  hasDefaultIconRisk: boolean | null
  densities: Record<string, boolean>
}

export type SizeAnalysis = {
  totalSizeBytes: number
  totalSize: string
  assetsSizeBytes: number
  libSizeBytes: number
  dexSizeBytes: number
  resSizeBytes: number
  topFiles: Array<{
    path: string
    sizeBytes: number
    size: string
  }>
}

export type RiskLevel = 'blocker' | 'high' | 'medium' | 'low' | 'info'
export type SubmissionConclusionStatus = 'passed' | 'risk' | 'not_recommended' | 'blocked' | 'unknown'

export type RiskItem = {
  level: RiskLevel
  title: string
  detail: string
  currentValue?: string | number | null
  expectedValue?: string
  fix?: string
  operationNote?: string
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
  isOnly64Bit?: boolean | null
  hasArmv7?: boolean | null
  hasHttp: boolean | null
  usesCleartextTraffic?: boolean | null
  cleartextMode?: 'global' | 'domain' | 'none' | 'unknown'
  hasDebugRisk: boolean | null
  debuggable?: boolean | null
  hasSensitivePermissions: boolean | null
  hasSignature: boolean | null
  hasCleartextRisk: boolean | null
  hasAllowBackupRisk: boolean | null
}

export type StandardDetectionItem = {
  id: string
  category: string
  title: string
  status: StandardDetectionStatus
  severity: StandardSeverity
  currentValue: string
  expectedValue: string
  evidence: string
  risk: string
  suggestion: string
  devInstruction: string
  scoreImpact?: number
  includedInScore?: boolean
}

export type ScoreBreakdownItem = {
  id: string
  title: string
  status: StandardDetectionStatus
  severity: StandardSeverity
  deduction: number
  reason: string
  includedInScore: boolean
}

export type ReviewSummaryItem = {
  key: 'fail' | 'warning' | 'pass' | 'parse_failed' | 'unknown'
  label: string
  count: number
  ratio: number
}

export type CoverageItem = {
  key: string
  label: string
  status: 'covered' | 'partial' | 'manual_review'
  scope: string
  limitation: string
}

export type SdkCategory = 'ad' | 'payment' | 'push' | 'analytics' | 'oaid'

export type SdkFinding = {
  id: string
  name: string
  category: SdkCategory
  categoryLabel: string
  matched: boolean
  evidence: string[]
  disclosureNote: string
  suggestion: string
}

export type AnalyzeResult = {
  status: DetectionStatus
  submissionConclusion: {
    status: SubmissionConclusionStatus
    title: string
    summary: string
    level: RiskLevel
  }
  grade: 'A' | 'B' | 'C' | 'D' | null
  score: number | null
  summary: string
  generatedAt: string
  reportMeta: ReportMeta
  apkHash: ApkHash
  fileIdentification?: FileIdentification
  originalFileName?: string
  normalizedFileName?: string
  detectedFileType?: 'apk'
  isApkLike?: boolean
  isNormalized?: boolean
  normalizeReason?: string
  engine: EngineHealth
  detectionLogs: DetectionLogItem[]
  apkInfo: ApkInfo
  currentChannelRules?: Array<{
    id: string
    name: string
    targetSdkMin: number
    requireArm64: boolean
    allowDebuggable: boolean
    allowCleartextTraffic: boolean
  }>
  abiInfo: AbiInfo
  abiDetails?: AbiDetail[]
  signatureInfo?: SignatureInfo
  iconInfo?: IconInfo
  sizeAnalysis?: SizeAnalysis
  checks: AnalyzerChecks
  permissions: string[]
  sensitivePermissions: string[]
  httpUrls: string[]
  debugKeywords: string[]
  detectionItems?: StandardDetectionItem[]
  scoreBreakdown?: ScoreBreakdownItem[]
  reviewSummary?: ReviewSummaryItem[]
  coverageItems?: CoverageItem[]
  sdkFindings?: SdkFinding[]
  risks: RiskItem[]
  hardChecks: HardCheckItem[]
  privacyChecks: PrivacyCheckItem[]
  channelChecks: ChannelCheck[]
  failReasons: string[]
  developerMessage: string
  operationMessage: string
  markdownReport: string
  fullReportText: string
  htmlReport: string
}
