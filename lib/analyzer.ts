import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { channelRules } from './channelRules'
import { buildDeveloperMessage, buildOperationMessage, buildHtmlReport } from './report'
import type { AbiInfo, AnalyzeResult, RiskItem } from './types'

const ABI_LIST: (keyof AbiInfo)[] = ['armeabi', 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']

const SENSITIVE_PERMISSIONS = [
  'android.permission.READ_PHONE_STATE',
  'android.permission.WRITE_SETTINGS',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.GET_TASKS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.QUERY_ALL_PACKAGES'
]

function safeExec(command: string, args: string[], timeout = 25000): string {
  try {
    return execFileSync(command, args, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 1024 * 1024 * 50
    })
  } catch {
    return ''
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function gradeFromScore(score: number): AnalyzeResult['grade'] {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

export function analyzeApk(filePath: string, selectedChannelIds?: string[]): AnalyzeResult {
  const stat = fs.statSync(filePath)
  const originalName = path.basename(filePath).replace(/^\d+-[a-f0-9]+-/, '')

  const unzipList = safeExec('unzip', ['-l', filePath])
  const stringsOutput = safeExec('strings', [filePath], 18000)
  const badging = safeExec('aapt', ['dump', 'badging', filePath])
  const permissionsDump = safeExec('aapt', ['dump', 'permissions', filePath])
  const xmltree = safeExec('aapt', ['dump', 'xmltree', filePath, 'AndroidManifest.xml'])

  const abiInfo = {} as AbiInfo
  for (const abi of ABI_LIST) {
    abiInfo[abi] = unzipList.includes(`lib/${abi}/`)
  }

  let packageName = ''
  let versionCode = ''
  let versionName = ''
  let minSdkVersion: number | null = null
  let targetSdkVersion: number | null = null

  const packageMatch = badging.match(/package: name='([^']+)' versionCode='([^']*)' versionName='([^']*)'/)
  if (packageMatch) {
    packageName = packageMatch[1]
    versionCode = packageMatch[2]
    versionName = packageMatch[3]
  }

  const minMatch = badging.match(/sdkVersion:'(\d+)'/)
  if (minMatch) minSdkVersion = Number(minMatch[1])

  const targetMatch = badging.match(/targetSdkVersion:'(\d+)'/)
  if (targetMatch) targetSdkVersion = Number(targetMatch[1])

  const permissionMatches = Array.from(permissionsDump.matchAll(/uses-permission(?:-sdk-\d+)?: name='([^']+)'/g)).map(m => m[1])
  const permissions = unique(permissionMatches)
  const sensitivePermissions = permissions.filter(permission => SENSITIVE_PERMISSIONS.includes(permission))

  const combined = `${stringsOutput}\n${unzipList}\n${badging}\n${xmltree}`
  const httpUrls = unique(Array.from(combined.matchAll(/http:\/\/[^\s"'<>\\)]+/g)).map(m => m[0])).slice(0, 100)

  const debugKeys = ['DEBUG', 'debug', 'JYSL_DEBUG', 'IS_DEBUG', 'debuggable', 'sandbox', 'staging', 'test_server', 'test']
  const debugKeywords = unique(debugKeys.filter(k => combined.includes(k)))

  const apksignerOutput = safeExec('apksigner', ['verify', '--print-certs', filePath])
  const hasMetaInf = unzipList.includes('META-INF/')
  const hasSignature = hasMetaInf || apksignerOutput.toLowerCase().includes('verified') || apksignerOutput.includes('Signer #1')

  const hasArm64 = abiInfo['arm64-v8a']
  const targetSdkOk = (targetSdkVersion ?? 0) >= 30
  const hasAny32 = abiInfo['armeabi'] || abiInfo['armeabi-v7a'] || abiInfo['x86']
  const hasAny64 = abiInfo['arm64-v8a'] || abiInfo['x86_64']
  const isPure32Bit = Boolean(hasAny32 && !hasAny64)
  const hasHttp = httpUrls.length > 0
  const hasDebugRisk = debugKeywords.length > 0 || xmltree.includes('android:debuggable') || combined.includes('android:debuggable="true"')
  const hasSensitivePermissions = sensitivePermissions.length > 0
  const hasCleartextRisk = xmltree.includes('usesCleartextTraffic') || combined.includes('usesCleartextTraffic')
  const hasAllowBackupRisk = xmltree.includes('allowBackup') || combined.includes('allowBackup="true"') || combined.includes('android:allowBackup')

  const risks: RiskItem[] = []

  if (!hasArm64) risks.push({
    level: 'blocker',
    title: '缺少 64 位 arm64-v8a',
    detail: 'APK 内未检测到 lib/arm64-v8a/，多渠道会判定为 64 位支持不足。',
    fix: '重新出包，确保最终提交渠道的 APK 内包含 lib/arm64-v8a/。'
  })
  if (isPure32Bit) risks.push({
    level: 'blocker',
    title: '纯 32 位包体',
    detail: '检测到 32 位 ABI，但未检测到 64 位 ABI。',
    fix: '输出 32/64 兼容包，至少包含 armeabi-v7a 与 arm64-v8a；或按渠道要求输出纯 64 位包。'
  })
  if (!targetSdkOk) risks.push({
    level: 'blocker',
    title: 'targetSdkVersion 不达标',
    detail: `当前 targetSdkVersion=${targetSdkVersion ?? '未知'}，基础要求为 >= 30。`,
    fix: '升级 targetSdkVersion 至 30 或以上，并完成兼容性回归。'
  })
  if (!hasSignature) risks.push({
    level: 'high',
    title: '签名检测异常',
    detail: '未检测到明确签名信息，或当前环境无法完成签名校验。',
    fix: '确认 APK 使用正式签名，并使用 apksigner verify 验证。'
  })
  if (hasHttp) risks.push({
    level: 'medium',
    title: '存在 HTTP 明文地址',
    detail: `检测到 ${httpUrls.length} 个 HTTP 明文地址，可能影响渠道安全检测和合规评分。`,
    fix: '将正式环境接口、公告、活动、资源地址升级为 HTTPS。'
  })
  if (hasCleartextRisk) risks.push({
    level: 'medium',
    title: '可能允许明文流量',
    detail: '检测到 usesCleartextTraffic 相关配置。',
    fix: '正式包确认关闭全局明文流量，或配置严格的 networkSecurityConfig 白名单。'
  })
  if (hasSensitivePermissions) risks.push({
    level: 'medium',
    title: '存在敏感权限',
    detail: sensitivePermissions.join('，'),
    fix: '逐项确认权限必要性，删除无用敏感权限，并同步隐私政策说明。'
  })
  if (hasDebugRisk) risks.push({
    level: 'medium',
    title: '疑似 Debug / 测试配置残留',
    detail: debugKeywords.join('，') || '检测到调试相关配置。',
    fix: '关闭 Debug 配置，确认没有测试环境、沙盒、调试开关残留。'
  })
  if (hasAllowBackupRisk) risks.push({
    level: 'low',
    title: '可能开启 allowBackup',
    detail: '正式包建议关闭 allowBackup，避免本地数据被备份或迁移。',
    fix: 'AndroidManifest 中设置 android:allowBackup="false"。'
  })

  const selectedRules = selectedChannelIds?.length
    ? channelRules.filter(rule => selectedChannelIds.includes(rule.id))
    : channelRules

  const channelChecks = selectedRules.map(rule => {
    let score = 100
    const messages: string[] = []

    if (rule.requireArm64 && !hasArm64) {
      score -= 45
      messages.push('未检测到 arm64-v8a')
    }
    if (!rule.allowPure32Bit && isPure32Bit) {
      score -= 35
      messages.push('当前为纯 32 位包体')
    }
    if ((targetSdkVersion ?? 0) < rule.targetSdkMin) {
      score -= 35
      messages.push(`targetSdkVersion 低于 ${rule.targetSdkMin}`)
    }
    if (rule.strictHttp && hasHttp) {
      score -= 10
      messages.push('存在 HTTP 明文地址')
    }
    if (hasDebugRisk) {
      score -= 10
      messages.push('疑似 Debug / 测试配置')
    }
    if (!hasSignature) {
      score -= 15
      messages.push('签名检测异常')
    }

    score = Math.max(0, score)
    return {
      id: rule.id,
      name: rule.name,
      logo: rule.logo,
      passed: score >= 80 && !(rule.requireArm64 && !hasArm64) && !((targetSdkVersion ?? 0) < rule.targetSdkMin),
      score,
      messages: messages.length ? messages : ['通过']
    }
  })

  const failReasons: string[] = []
  if (!hasArm64) failReasons.push('APK 未检测到 lib/arm64-v8a/，当前包体不满足 64 位要求')
  if (isPure32Bit) failReasons.push('当前 APK 属于纯 32 位包体')
  if (!targetSdkOk) failReasons.push(`targetSdkVersion=${targetSdkVersion ?? '未知'}，低于基础要求 30`)
  if (!hasSignature) failReasons.push('APK 签名检测异常或无法确认签名')

  let score = 100
  for (const risk of risks) {
    if (risk.level === 'blocker') score -= 35
    if (risk.level === 'high') score -= 20
    if (risk.level === 'medium') score -= 8
    if (risk.level === 'low') score -= 3
  }
  score = Math.max(0, Math.min(100, score))

  const baseResult = {
    status: failReasons.length === 0 ? 'passed' as const : 'failed' as const,
    grade: gradeFromScore(score),
    score,
    summary: failReasons.length === 0 ? '渠道提交前检测通过' : '渠道提交前检测不通过',
    generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    apkInfo: {
      fileName: originalName,
      fileSize: formatSize(stat.size),
      fileSizeBytes: stat.size,
      packageName,
      versionCode,
      versionName,
      minSdkVersion,
      targetSdkVersion,
      hasSignature,
      parseSuccess: Boolean(badging || unzipList)
    },
    abiInfo,
    checks: {
      hasArm64,
      targetSdkOk,
      isPure32Bit,
      hasHttp,
      hasDebugRisk,
      hasSensitivePermissions,
      hasSignature,
      hasCleartextRisk,
      hasAllowBackupRisk
    },
    permissions,
    sensitivePermissions,
    httpUrls,
    debugKeywords,
    risks,
    channelChecks,
    failReasons
  }

  const developerMessage = buildDeveloperMessage(baseResult)
  const operationMessage = buildOperationMessage(baseResult)
  const htmlReport = buildHtmlReport({ ...baseResult, developerMessage, operationMessage })

  return { ...baseResult, developerMessage, operationMessage, htmlReport }
}
