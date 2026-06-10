import { execFileSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { channelRules } from './channelRules'
import { buildDeveloperMessage, buildOperationMessage, buildHtmlReport } from './report'
import type {
  AbiInfo,
  AbiName,
  AnalyzeResult,
  DetectionLogItem,
  DetectionMode,
  EngineHealth,
  HardCheckItem,
  RiskItem,
  ToolHealth
} from './types'

const ABI_LIST: AbiName[] = ['armeabi', 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']
const RULE_VERSION = '2026.06-static-v2'

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

type ExecResult = {
  ok: boolean
  output: string
  error?: string
}

function execTool(command: string, args: string[], timeout = 25000): ExecResult {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: 'utf-8',
        timeout,
        maxBuffer: 1024 * 1024 * 80,
        shell: false,
        windowsHide: true
      })
    }
  } catch (error: any) {
    const stderr = error?.stderr?.toString?.() || ''
    const stdout = error?.stdout?.toString?.() || ''
    return {
      ok: false,
      output: `${stdout}\n${stderr}`.trim(),
      error: error?.code === 'ENOENT' ? `${command} 不可用` : (stderr || error?.message || `${command} 执行失败`)
    }
  }
}

function commandExists(command: string, args: string[]): boolean {
  return execTool(command, args, 5000).ok
}

function detectionMode(tools: ToolHealth): DetectionMode {
  if (tools.unzip && tools.aapt && tools.apksigner && tools.strings) return 'full'
  if (tools.unzip || tools.aapt || tools.strings) return 'degraded'
  return 'unavailable'
}

export function getEngineHealth(): EngineHealth {
  const tools = {
    unzip: commandExists('unzip', ['-v']),
    aapt: commandExists('aapt', ['version']),
    apksigner: commandExists('apksigner', ['--version']),
    strings: commandExists('strings', ['--version'])
  }
  const mode = detectionMode(tools)
  return {
    mode,
    tools,
    message: mode === 'full'
      ? '完整检测模式'
      : mode === 'degraded'
        ? '降级检测模式'
        : '检测引擎异常',
    checkedAt: new Date().toISOString()
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

function fileHash(filePath: string, algorithm: 'md5' | 'sha1' | 'sha256') {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest('hex')
}

function logItem(key: DetectionLogItem['key'], label: string, ok: boolean, successMessage: string, errorMessage: string): DetectionLogItem {
  return {
    key,
    label,
    status: ok ? 'success' : 'failed',
    message: ok ? successMessage : errorMessage
  }
}

function abiListText(abiInfo: AbiInfo): string {
  const found = ABI_LIST.filter(abi => abiInfo[abi] === true)
  if (ABI_LIST.some(abi => abiInfo[abi] === null)) return 'ABI 扫描失败'
  return found.length ? found.join('、') : '未检测到 lib/ ABI 目录'
}

function buildHardChecks(targetSdkVersion: number | null, abiInfo: AbiInfo, abiScanOk: boolean): HardCheckItem[] {
  const targetCheck: HardCheckItem = targetSdkVersion === null
    ? {
        key: 'targetSdkVersion',
        title: 'targetSdkVersion 无法解析',
        status: 'unknown',
        level: 'info',
        currentValue: '未解析',
        expectedValue: '>= 30',
        description: '无法从 Manifest 解析 targetSdkVersion，不能判定为通过，需要人工确认。',
        suggestion: '请确认 APK 可被 aapt 正常解析，并人工核对 AndroidManifest.xml / Gradle / Unity Target API Level。'
      }
    : targetSdkVersion < 30
      ? {
          key: 'targetSdkVersion',
          title: 'targetSdkVersion 低于要求',
          status: 'blocker',
          level: 'blocker',
          currentValue: String(targetSdkVersion),
          expectedValue: '>= 30',
          description: `当前 targetSdkVersion=${targetSdkVersion}，低于渠道要求。渠道通常要求 targetSdkVersion >= 30。`,
          suggestion: '请研发将 targetSdkVersion / Unity Target API Level 升级到 30 或以上，建议 33/34/35/36。',
          unityTip: 'Unity 路径：File > Build Settings > Player Settings > Other Settings > Target API Level'
        }
      : {
          key: 'targetSdkVersion',
          title: 'targetSdkVersion 达标',
          status: 'pass',
          level: 'info',
          currentValue: String(targetSdkVersion),
          expectedValue: '>= 30',
          description: `当前 targetSdkVersion=${targetSdkVersion}，满足渠道基础要求。`,
          suggestion: '保持当前 Target API Level，并在升级 Unity/Android SDK 后继续回归兼容性。'
        }

  let abiCheck: HardCheckItem
  const hasArm64 = abiInfo['arm64-v8a'] === true
  const hasArmv7 = abiInfo['armeabi-v7a'] === true

  if (!abiScanOk) {
    abiCheck = {
      key: 'abiCompatibility',
      title: 'ABI 扫描失败',
      status: 'unknown',
      level: 'info',
      currentValue: '未解析',
      expectedValue: '同时包含 armeabi-v7a + arm64-v8a',
      description: '无法读取 APK 的 lib/ 目录，不能确认 32/64 位兼容情况，需要人工确认。',
      suggestion: '请确认 APK Zip 结构完整，或人工解压检查 lib/armeabi-v7a/ 与 lib/arm64-v8a/。'
    }
  } else if (!hasArm64) {
    abiCheck = {
      key: 'abiCompatibility',
      title: hasArmv7 ? '纯 32 位包体' : '缺少 arm64-v8a',
      status: 'blocker',
      level: 'blocker',
      currentValue: abiListText(abiInfo),
      expectedValue: '必须包含 arm64-v8a；推荐同时包含 armeabi-v7a + arm64-v8a',
      description: hasArmv7
        ? '当前 APK 只有 armeabi-v7a 等 32 位 ABI，没有 arm64-v8a，属于纯 32 位包。'
        : 'APK 未检测到 lib/arm64-v8a/，当前包体不满足 64 位要求。',
      suggestion: '请研发重新输出 64 位包体，并确保最终 APK 至少包含 lib/arm64-v8a/；如需兼容 32 位设备，建议同时保留 lib/armeabi-v7a/。'
    }
  } else if (!hasArmv7) {
    abiCheck = {
      key: 'abiCompatibility',
      title: '只有 64 位 ABI',
      status: 'warning',
      level: 'medium',
      currentValue: abiListText(abiInfo),
      expectedValue: '同时包含 armeabi-v7a + arm64-v8a',
      description: 'APK 已包含 arm64-v8a，满足 64 位基础要求，但未检测到 armeabi-v7a，不是 32/64 兼容包。',
      suggestion: '如果渠道或业务仍需兼容 32 位设备，请研发同时输出 lib/armeabi-v7a/ 与 lib/arm64-v8a/。'
    }
  } else {
    abiCheck = {
      key: 'abiCompatibility',
      title: '32/64 兼容包通过',
      status: 'pass',
      level: 'info',
      currentValue: abiListText(abiInfo),
      expectedValue: '同时包含 armeabi-v7a + arm64-v8a',
      description: 'APK 同时包含 armeabi-v7a 与 arm64-v8a，满足 32/64 兼容包要求。',
      suggestion: '保持当前 ABI 输出配置，提审前继续确认各渠道包没有被二次裁剪。'
    }
  }

  return [targetCheck, abiCheck]
}

export function analyzeApk(filePath: string, selectedChannelIds?: string[]): AnalyzeResult {
  const stat = fs.statSync(filePath)
  const originalName = path.basename(filePath).replace(/^\d+-[a-f0-9]+-/, '')
  const engine = getEngineHealth()
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const reportId = `APKFLOW-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const apkHash = {
    md5: fileHash(filePath, 'md5'),
    sha1: fileHash(filePath, 'sha1'),
    sha256: fileHash(filePath, 'sha256')
  }

  const unzip = execTool('unzip', ['-l', filePath])
  const badging = execTool('aapt', ['dump', 'badging', filePath])
  const permissionsDump = execTool('aapt', ['dump', 'permissions', filePath])
  const xmltree = execTool('aapt', ['dump', 'xmltree', filePath, 'AndroidManifest.xml'])
  const stringsOutput = execTool('strings', [filePath], 18000)
  const apksignerOutput = execTool('apksigner', ['verify', '--print-certs', filePath])

  const zipScanOk = unzip.ok && unzip.output.includes('AndroidManifest.xml')
  const manifestOk = badging.ok && /package: name='[^']+'/.test(badging.output)
  const abiScanOk = unzip.ok && unzip.output.length > 0
  const signatureOk = apksignerOutput.ok || unzip.output.includes('META-INF/')
  const httpScanOk = stringsOutput.ok || unzip.ok || xmltree.ok

  const detectionLogs: DetectionLogItem[] = [
    logItem('zip', 'APK Zip 扫描', zipScanOk, 'Zip 结构读取成功', unzip.error || 'Zip 结构读取失败'),
    logItem('manifest', 'Manifest 解析', manifestOk, 'Manifest 基础信息解析成功', badging.error || 'Manifest 解析失败'),
    logItem('abi', 'ABI 扫描', abiScanOk, 'ABI 目录扫描成功', unzip.error || 'ABI 扫描失败'),
    logItem('signature', '签名检测', signatureOk, '签名信息已检测', apksignerOutput.error || '签名检测失败'),
    logItem('http', 'HTTP 扫描', httpScanOk, 'HTTP 明文地址扫描完成', stringsOutput.error || 'HTTP 扫描失败')
  ]

  const abiInfo = {} as AbiInfo
  for (const abi of ABI_LIST) abiInfo[abi] = abiScanOk ? unzip.output.includes(`lib/${abi}/`) : null

  const packageMatch = badging.output.match(/package: name='([^']+)' versionCode='([^']*)' versionName='([^']*)'/)
  const packageName = packageMatch ? packageMatch[1] : null
  const versionCode = packageMatch ? packageMatch[2] || null : null
  const versionName = packageMatch ? packageMatch[3] || null : null
  const appNameMatch = badging.output.match(/application-label:'([^']*)'/)
  const appName = appNameMatch ? appNameMatch[1] || null : null
  const minMatch = badging.output.match(/sdkVersion:'(\d+)'/)
  const targetMatch = badging.output.match(/targetSdkVersion:'(\d+)'/)
  const minSdkVersion = minMatch ? Number(minMatch[1]) : null
  const targetSdkVersion = targetMatch ? Number(targetMatch[1]) : null

  const permissions = permissionsDump.ok
    ? unique(Array.from(permissionsDump.output.matchAll(/uses-permission(?:-sdk-\d+)?: name='([^']+)'/g)).map(m => m[1]))
    : []
  const sensitivePermissions = permissions.filter(permission => SENSITIVE_PERMISSIONS.includes(permission))

  const combined = `${stringsOutput.output}\n${unzip.output}\n${badging.output}\n${xmltree.output}`
  const httpUrls = httpScanOk ? unique(Array.from(combined.matchAll(/http:\/\/[^\s"'<>\\)]+/g)).map(m => m[0])).slice(0, 100) : []
  const debugKeys = ['DEBUG', 'debug', 'JYSL_DEBUG', 'IS_DEBUG', 'debuggable', 'sandbox', 'staging', 'test_server', 'test']
  const debugKeywords = unique(debugKeys.filter(k => combined.includes(k)))

  const parseErrorReasons: string[] = []
  if (!zipScanOk) parseErrorReasons.push(unzip.error || 'Zip 结构读取失败')
  if (!manifestOk) parseErrorReasons.push(badging.error || 'Manifest 解析失败，无法读取 packageName/version/targetSdkVersion')

  const baseChecks = {
    hasArm64: abiScanOk ? Boolean(abiInfo['arm64-v8a']) : null,
    targetSdkOk: targetSdkVersion === null ? null : targetSdkVersion >= 30,
    isPure32Bit: abiScanOk
      ? Boolean((abiInfo.armeabi || abiInfo['armeabi-v7a'] || abiInfo.x86) && !(abiInfo['arm64-v8a'] || abiInfo.x86_64))
      : null,
    hasHttp: httpScanOk ? httpUrls.length > 0 : null,
    hasDebugRisk: httpScanOk || xmltree.ok ? (debugKeywords.length > 0 || xmltree.output.includes('android:debuggable') || combined.includes('android:debuggable="true"')) : null,
    hasSensitivePermissions: permissionsDump.ok ? sensitivePermissions.length > 0 : null,
    hasSignature: signatureOk,
    hasCleartextRisk: xmltree.ok || stringsOutput.ok ? (xmltree.output.includes('usesCleartextTraffic') || combined.includes('usesCleartextTraffic')) : null,
    hasAllowBackupRisk: xmltree.ok || stringsOutput.ok ? (xmltree.output.includes('allowBackup') || combined.includes('allowBackup="true"') || combined.includes('android:allowBackup')) : null
  }

  const selectedRules = selectedChannelIds?.length
    ? channelRules.filter(rule => selectedChannelIds.includes(rule.id))
    : channelRules
  const hardChecks = buildHardChecks(targetSdkVersion, abiInfo, abiScanOk)

  const reportMeta = {
    reportId,
    detectedAt: generatedAt,
    ruleVersion: RULE_VERSION,
    detectionMode: engine.mode
  }

  if (parseErrorReasons.length > 0) {
    const parseResultBase = {
      status: 'parse_error' as const,
      grade: null,
      score: null,
      summary: 'APK 解析失败，当前环境无法完整解析该 APK',
      generatedAt,
      reportMeta,
      apkHash,
      engine,
      detectionLogs,
      apkInfo: {
        fileName: originalName,
        fileSize: formatSize(stat.size),
        fileSizeBytes: stat.size,
        packageName,
        appName,
        versionCode,
        versionName,
        minSdkVersion,
        targetSdkVersion,
        hasSignature: signatureOk,
        parseSuccess: false
      },
      abiInfo,
      checks: baseChecks,
      permissions,
      sensitivePermissions,
      httpUrls,
      debugKeywords,
      hardChecks,
      risks: [{
        level: 'info' as const,
        title: '解析失败',
        detail: parseErrorReasons.join('；'),
        fix: '请将检测后端部署到支持 unzip、aapt、apksigner、strings 的服务器后重新检测。'
      }],
      channelChecks: selectedRules.map(rule => ({
        id: rule.id,
        name: rule.name,
        logo: rule.logo,
        passed: null,
        score: null,
        messages: ['解析失败，渠道结论不可用']
      })),
      failReasons: parseErrorReasons
    }

    const developerMessage = buildDeveloperMessage(parseResultBase)
    const operationMessage = buildOperationMessage(parseResultBase)
    const htmlReport = buildHtmlReport({ ...parseResultBase, developerMessage, operationMessage })
    return { ...parseResultBase, developerMessage, operationMessage, htmlReport }
  }

  const risks: RiskItem[] = []
  const failReasons: string[] = []

  if (baseChecks.hasArm64 === false) {
    failReasons.push('APK 未检测到 lib/arm64-v8a/，当前包体不满足 64 位要求。')
    risks.push({
      level: 'blocker',
      title: abiInfo['armeabi-v7a'] ? '纯 32 位包体' : '缺少 arm64-v8a',
      detail: abiInfo['armeabi-v7a']
        ? '当前 APK 只有 armeabi-v7a 等 32 位 ABI，没有 arm64-v8a，属于纯 32 位包。'
        : 'APK 未检测到 lib/arm64-v8a/，当前包体不满足 64 位要求。',
      currentValue: abiListText(abiInfo),
      expectedValue: '必须包含 arm64-v8a；推荐同时包含 armeabi-v7a + arm64-v8a',
      fix: '请研发重新输出 64 位包体，并确保最终 APK 至少包含 lib/arm64-v8a/；如需兼容 32 位设备，建议同时保留 lib/armeabi-v7a/。'
    })
  }
  if (targetSdkVersion !== null && targetSdkVersion < 30) {
    failReasons.push('targetSdkVersion 低于 30，不符合渠道要求。')
    risks.push({
      level: 'blocker',
      title: 'targetSdkVersion 低于要求',
      detail: `当前 targetSdkVersion=${targetSdkVersion}，低于渠道要求。渠道通常要求 targetSdkVersion >= 30。`,
      currentValue: targetSdkVersion,
      expectedValue: '>= 30',
      fix: '请研发将 targetSdkVersion / Unity Target API Level 升级到 30 或以上，建议 33/34/35/36。Unity 路径：File > Build Settings > Player Settings > Other Settings > Target API Level'
    })
  }
  if (baseChecks.hasArm64 && abiInfo['armeabi-v7a'] === false) {
    risks.push({
      level: 'medium',
      title: '只有 64 位 ABI',
      detail: 'APK 已包含 arm64-v8a，满足 64 位基础要求，但未检测到 armeabi-v7a，不是 32/64 兼容包。',
      currentValue: abiListText(abiInfo),
      expectedValue: '同时包含 armeabi-v7a + arm64-v8a',
      fix: '如果渠道或业务仍需兼容 32 位设备，请研发同时输出 lib/armeabi-v7a/ 与 lib/arm64-v8a/。'
    })
  }
  if (!signatureOk) {
    risks.push({
      level: 'high',
      title: '签名检测失败',
      detail: apksignerOutput.error || '未检测到明确签名信息。',
      fix: '确认 APK 使用正式签名，并使用 apksigner verify 验证。'
    })
  }
  if (baseChecks.hasHttp) {
    risks.push({
      level: 'medium',
      title: '存在 HTTP 明文地址',
      detail: `检测到 ${httpUrls.length} 个 HTTP 明文地址。`,
      fix: '将正式环境接口、公告、活动、资源地址升级为 HTTPS。'
    })
  }
  if (baseChecks.hasSensitivePermissions) {
    risks.push({
      level: 'medium',
      title: '存在敏感权限',
      detail: sensitivePermissions.join('；'),
      fix: '逐项确认权限必要性，删除无用敏感权限，并同步隐私政策说明。'
    })
  }
  if (baseChecks.hasDebugRisk) {
    risks.push({
      level: 'medium',
      title: '疑似 Debug / 测试配置残留',
      detail: debugKeywords.join('；') || '检测到调试相关配置。',
      fix: '关闭 Debug 配置，确认没有测试环境、沙盒、调试开关残留。'
    })
  }

  const channelChecks = selectedRules.map(rule => {
    let channelScore = 100
    const messages: string[] = []
    if (rule.requireArm64 && baseChecks.hasArm64 === false) {
      channelScore -= 45
      messages.push('未检测到 arm64-v8a')
    }
    if (!rule.allowPure32Bit && baseChecks.isPure32Bit) {
      channelScore -= 35
      messages.push('当前为纯 32 位包体')
    }
    if (targetSdkVersion !== null && targetSdkVersion < rule.targetSdkMin) {
      channelScore -= 35
      messages.push(`targetSdkVersion 低于 ${rule.targetSdkMin}`)
    }
    if (targetSdkVersion === null) messages.push('targetSdkVersion 未解析，不参与达标判定')
    if (baseChecks.hasHttp && rule.strictHttp) {
      channelScore -= 10
      messages.push('存在 HTTP 明文地址')
    }

    channelScore = Math.max(0, channelScore)
    return {
      id: rule.id,
      name: rule.name,
      logo: rule.logo,
      passed: channelScore >= 80 && !(rule.requireArm64 && baseChecks.hasArm64 === false) && !(targetSdkVersion !== null && targetSdkVersion < rule.targetSdkMin),
      score: channelScore,
      messages: messages.length ? messages : ['通过']
    }
  })

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
    summary: failReasons.length === 0 ? '渠道提审检测通过' : '渠道提审检测不通过',
    generatedAt,
    reportMeta,
    apkHash,
    engine,
    detectionLogs,
    apkInfo: {
      fileName: originalName,
      fileSize: formatSize(stat.size),
      fileSizeBytes: stat.size,
      packageName,
      versionCode,
      versionName,
      minSdkVersion,
      targetSdkVersion,
      appName,
      hasSignature: signatureOk,
      parseSuccess: true
    },
    abiInfo,
    checks: baseChecks,
    permissions,
    sensitivePermissions,
    httpUrls,
    debugKeywords,
    risks,
    hardChecks,
    channelChecks,
    failReasons
  }

  const developerMessage = buildDeveloperMessage(baseResult)
  const operationMessage = buildOperationMessage(baseResult)
  const htmlReport = buildHtmlReport({ ...baseResult, developerMessage, operationMessage })

  return { ...baseResult, developerMessage, operationMessage, htmlReport }
}
