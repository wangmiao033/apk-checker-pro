const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ABI_LIST = ['armeabi', 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']
const RULE_VERSION = '2026.06-static-v2'

const CHANNEL_RULES = [
  { id: 'generic', name: '通用渠道', logo: 'A', requireArm64: true, targetSdkMin: 30, allowPure32Bit: false, strictHttp: false },
  { id: 'xiaomi', name: '小米', logo: 'MI', requireArm64: true, targetSdkMin: 30, allowPure32Bit: false, strictHttp: true }
]

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

const PRIVACY_PERMISSION_RULES = [
  { name: 'android.permission.READ_PHONE_STATE', label: 'READ_PHONE_STATE', suggestion: '如非账号安全、实名或强风控必要，建议移除或延后到用户同意后申请。' },
  { name: 'android.permission.WRITE_EXTERNAL_STORAGE', label: 'WRITE_EXTERNAL_STORAGE', suggestion: 'Android 10+ 建议改用分区存储或系统选择器，避免申请外部存储写权限。' },
  { name: 'android.permission.READ_EXTERNAL_STORAGE', label: 'READ_EXTERNAL_STORAGE', suggestion: '如仅用于选择头像/截图，建议改用系统文件选择器并按需申请。' },
  { name: 'android.permission.GET_TASKS', label: 'GET_TASKS', suggestion: '游戏通常不建议申请，非必要建议移除。' },
  { name: 'android.permission.SYSTEM_ALERT_WINDOW', label: 'SYSTEM_ALERT_WINDOW', suggestion: '游戏通常不建议申请，非必要建议移除；悬浮窗能力容易触发渠道审核关注。' },
  { name: 'android.permission.ACCESS_WIFI_STATE', label: 'ACCESS_WIFI_STATE', suggestion: '如仅用于网络判断，建议使用更低敏的网络状态 API，并在隐私政策中说明。' },
  { name: 'android.permission.CHANGE_WIFI_STATE', label: 'CHANGE_WIFI_STATE', suggestion: '游戏通常不建议申请，非必要建议移除。' },
  { name: 'android.permission.CHANGE_NETWORK_STATE', label: 'CHANGE_NETWORK_STATE', suggestion: '游戏通常不建议申请，非必要建议移除。' },
  { name: 'android.permission.ACCESS_FINE_LOCATION', label: 'ACCESS_FINE_LOCATION', suggestion: '定位权限需有明确业务场景，必须在用户同意隐私政策后再申请。' },
  { name: 'android.permission.ACCESS_COARSE_LOCATION', label: 'ACCESS_COARSE_LOCATION', suggestion: '定位权限需有明确业务场景，必须在用户同意隐私政策后再申请。' },
  { name: 'android.permission.RECORD_AUDIO', label: 'RECORD_AUDIO', suggestion: '录音权限需对应语音聊天/客服等明确功能，并在使用前单独触发授权。' },
  { name: 'android.permission.CAMERA', label: 'CAMERA', suggestion: '相机权限需对应扫码/头像等明确功能，并在使用前单独触发授权。' },
  { name: 'android.permission.READ_CONTACTS', label: 'READ_CONTACTS', suggestion: '游戏通常不建议读取通讯录，非必要建议移除。' },
  { name: 'android.permission.READ_SMS', label: 'READ_SMS', suggestion: '短信权限属于高敏权限，游戏包通常不建议申请。' },
  { name: 'android.permission.CALL_PHONE', label: 'CALL_PHONE', suggestion: '拨号权限属于高敏权限，建议改为跳转拨号盘而不是直接拨打。' },
  { name: 'com.bun.miitmdid.permission', label: 'MSA / OAID 相关权限', suggestion: 'OAID/MSA SDK 需延后到用户同意隐私政策后初始化，并在隐私政策中披露用途。', fuzzy: true },
  { name: 'com.asus.msa.SupplementaryDID.ACCESS', label: 'MSA / OAID 相关权限', suggestion: 'OAID/MSA SDK 需延后到用户同意隐私政策后初始化，并在隐私政策中披露用途。', fuzzy: true }
]

const PRIVACY_RESOURCE_KEYWORDS = ['privacy', 'agreement', 'policy', 'user_agreement', '隐私', '用户协议', '隐私政策', '同意', '拒绝', '不同意', '取消', '确认', '好的', '我知道了']
const WEAK_PRIVACY_BUTTON_KEYWORDS = ['好的', '我知道了', '确认', '取消']
const COLLECTION_KEYWORDS = ['IMEI', 'IMSI', 'OAID', 'AAID', 'Android ID', 'ANDROID_ID', 'MAC', 'getDeviceId', 'getImei', 'getMac', 'getOAID', 'getAdvertisingIdInfo', 'getInstalledPackages', 'getRunningTasks', 'TelephonyManager', 'WifiInfo', 'DeviceInfo', 'MSA']

function execTool(command, args, timeout = 25000) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: 'utf8',
        timeout,
        maxBuffer: 1024 * 1024 * 80,
        shell: false,
        windowsHide: true
      })
    }
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : ''
    const stdout = error && error.stdout ? error.stdout.toString() : ''
    return {
      ok: false,
      output: `${stdout}\n${stderr}`.trim(),
      error: error && error.code === 'ENOENT' ? `${command} 不可用` : (stderr || (error && error.message) || `${command} 执行失败`)
    }
  }
}

function commandExists(command, args) {
  return execTool(command, args, 5000).ok
}

function modeFromTools(tools) {
  if (tools.unzip && tools.aapt && tools.apksigner && tools.strings) return 'full'
  if (tools.unzip || tools.aapt || tools.strings) return 'degraded'
  return 'unavailable'
}

function getEngineHealth() {
  const tools = {
    unzip: commandExists('unzip', ['-v']),
    aapt: commandExists('aapt', ['version']),
    apksigner: commandExists('apksigner', ['--version']),
    strings: commandExists('strings', ['--version'])
  }
  const mode = modeFromTools(tools)
  return {
    mode,
    tools,
    message: mode === 'full' ? '完整检测模式' : mode === 'degraded' ? '降级检测模式' : '检测引擎异常',
    checkedAt: new Date().toISOString()
  }
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function gradeFromScore(score) {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

function fileHash(filePath, algorithm) {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest('hex')
}

function esc(input) {
  return String(input == null ? '' : input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function display(value) {
  return value == null || value === '' ? '未解析' : String(value)
}

function logItem(key, label, ok, successMessage, errorMessage) {
  return { key, label, status: ok ? 'success' : 'failed', message: ok ? successMessage : errorMessage }
}

function abiListText(abiInfo) {
  const found = ABI_LIST.filter(abi => abiInfo[abi] === true)
  if (ABI_LIST.some(abi => abiInfo[abi] === null)) return 'ABI 扫描失败'
  return found.length ? found.join('、') : '未检测到 lib/ ABI 目录'
}

function buildHardChecks(targetSdkVersion, abiInfo, abiScanOk) {
  const targetCheck = targetSdkVersion === null
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

  let abiCheck
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

function keywordFindings(source, keywords, limit = 30) {
  return unique(keywords.filter(keyword => source.toLowerCase().includes(keyword.toLowerCase())))
    .slice(0, limit)
    .map(keyword => ({
      key: keyword,
      label: keyword,
      detail: `静态扫描命中关键词：${keyword}`
    }))
}

function buildPrivacyChecks(permissions, combined) {
  const permissionFindings = PRIVACY_PERMISSION_RULES
    .filter(rule => rule.fuzzy
      ? permissions.some(permission => permission.toLowerCase().includes(rule.name.toLowerCase()) || permission.toLowerCase().includes('oaid') || permission.toLowerCase().includes('msa'))
      : permissions.includes(rule.name))
    .map(rule => ({
      key: rule.name,
      label: rule.label,
      detail: `Manifest 申请了 ${rule.label}。权限存在不等于违规，但需要确认申请时机、业务必要性和隐私政策披露。`,
      suggestion: rule.suggestion
    }))

  const privacyResourceFindings = keywordFindings(combined, PRIVACY_RESOURCE_KEYWORDS)
  const weakButtonFindings = keywordFindings(combined, WEAK_PRIVACY_BUTTON_KEYWORDS).map(item => ({
    ...item,
    detail: `隐私弹窗按钮疑似使用“${item.label}”。如果只有这类按钮，渠道可能认为授权表达不清晰。`,
    suggestion: '建议改成“同意 / 不同意”或“同意 / 拒绝”，避免只有“好的 / 我知道了 / 确认 / 取消”。'
  }))
  const collectionFindings = keywordFindings(combined, COLLECTION_KEYWORDS, 40).map(item => ({
    ...item,
    detail: `静态扫描命中采集能力关键词：${item.label}。`,
    suggestion: '静态检测只能说明具备采集能力，需要真机验证用户同意前是否采集或上报。'
  }))

  return [
    {
      key: 'permissions',
      title: '高风险权限检测',
      status: permissionFindings.length ? 'warning' : 'found',
      level: permissionFindings.length ? 'medium' : 'info',
      description: permissionFindings.length
        ? 'Manifest 中发现隐私敏感或渠道关注权限。权限存在不等于违规，需要结合业务场景和授权时机确认。'
        : 'Manifest 未命中本轮重点隐私权限清单。',
      findings: permissionFindings,
      suggestion: permissionFindings.length
        ? '逐项确认权限必要性；GET_TASKS、SYSTEM_ALERT_WINDOW、CHANGE_WIFI_STATE、CHANGE_NETWORK_STATE 游戏通常不建议申请，非必要建议移除。'
        : '继续保持最小权限原则，仅在功能触发时申请必要权限。'
    },
    {
      key: 'privacyResources',
      title: '隐私弹窗资源检测',
      status: privacyResourceFindings.length ? 'found' : 'warning',
      level: privacyResourceFindings.length ? 'info' : 'medium',
      description: privacyResourceFindings.length
        ? '发现疑似隐私弹窗资源。静态检测只能说明存在相关资源，不能判定隐私弹窗流程合规通过。'
        : '未发现明显隐私弹窗资源关键词，可能缺少隐私弹窗或资源被混淆，需要人工确认。',
      findings: [...privacyResourceFindings, ...weakButtonFindings].slice(0, 40),
      suggestion: weakButtonFindings.length
        ? '隐私弹窗按钮建议改成“同意 / 不同意”或“同意 / 拒绝”，不要只使用“好的 / 我知道了 / 确认 / 取消”。'
        : '请人工确认首次启动是否先展示隐私政策弹窗，并提供明确的同意与拒绝入口。'
    },
    {
      key: 'preConsentCollection',
      title: '授权前采集能力检测',
      status: collectionFindings.length ? 'high_risk' : 'found',
      level: collectionFindings.length ? 'high' : 'info',
      description: collectionFindings.length
        ? '发现设备标识、应用列表、运行任务、网络信息等采集能力关键词。静态检测不能直接判定违规，但需要重点真机验证用户同意前是否采集或上报。'
        : '未命中本轮授权前采集能力关键词，但仍需以真机抓包和运行时日志验证为准。',
      findings: collectionFindings,
      suggestion: collectionFindings.length
        ? '用户点击同意隐私政策前，不得初始化广告 SDK、统计 SDK、登录 SDK、支付 SDK、OAID/MSA SDK、TapTap SDK 等可能采集个人信息的模块。Unity 游戏建议在 UnityPlayerActivity 前增加 PrivacyActivity，先完成隐私授权，再启动 UnityPlayerActivity。'
        : '继续确认 SDK 初始化时机，确保任何个人信息采集都发生在用户同意隐私政策之后。'
    }
  ]
}

function buildDeveloperMessage(result) {
  if (result.status === 'parse_error') {
    return [
      'APK 解析失败，当前环境无法完整解析该 APK。',
      '',
      '请先修复检测后端环境，不要直接按渠道不通过处理。',
      '',
      '解析失败原因：',
      ...result.failReasons.map(item => `- ${item}`),
      '',
      '整改建议：',
      '- 确认 unzip / aapt / apksigner / strings 可用；',
      '- 确认 Android SDK Build Tools 已加入 PATH；',
      '- 确认上传 APK 完整且 Zip 结构未损坏；',
      '- 环境修复后重新上传检测。'
    ].join('\n')
  }
  if (result.status === 'passed') return '当前 APK 渠道提审检测通过。'
  const hardCheckFixes = (result.hardChecks || [])
    .filter(item => item.status !== 'pass')
    .map((item, index) => [
      `${index + 1}. ${item.title}`,
      `   当前值：${item.currentValue}`,
      `   要求值：${item.expectedValue}`,
      `   说明：${item.description}`,
      `   整改：${item.suggestion}`,
      item.unityTip ? `   Unity 提示：${item.unityTip}` : ''
    ].filter(Boolean).join('\n'))
    .join('\n')
  const privacyFixes = (result.privacyChecks || [])
    .filter(item => item.status === 'warning' || item.status === 'high_risk')
    .map((item, index) => [
      `${index + 1}. ${item.title}`,
      `   风险说明：${item.description}`,
      item.findings.length ? `   命中项：${item.findings.map(f => f.label).join('；')}` : '',
      `   整改：${item.suggestion}`
    ].filter(Boolean).join('\n'))
    .join('\n')
  return [
    '该 APK 不符合渠道提审要求，请研发修复后重新出包。',
    '',
    '失败原因：',
    ...result.failReasons.map((item, index) => `${index + 1}. ${item}`),
    '',
    '整改说明：',
    hardCheckFixes || '1. 请重新输出 64 位包体，并确保 targetSdkVersion >= 30。',
    privacyFixes ? ['', '隐私合规关注项：', privacyFixes].join('\n') : '',
    '',
    '处理完成后，请重新上传 APKFlow 复测。'
  ].join('\n')
}

function buildOperationMessage(result) {
  if (result.status === 'parse_error') return `APK 解析失败，当前环境无法完整解析该 APK。评分不可用，渠道结论不可用。原因：${result.failReasons.join('；')}`
  if (result.status === 'passed') return 'APK 提交前检测通过。'
  const blockers = (result.hardChecks || []).filter(item => item.status === 'blocker').map(item => item.title)
  const warnings = (result.hardChecks || []).filter(item => item.status === 'warning' || item.status === 'unknown').map(item => item.title)
  return `APK 提交前检测不通过，暂不建议提交渠道。阻断问题：${blockers.join('；') || result.failReasons.join('；')}。${warnings.length ? `需关注：${warnings.join('；')}。` : ''}`
}

function buildHtmlReport(result) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>APKFlow 检测报告</title></head><body>
<h1>APKFlow 检测报告</h1>
<p>报告编号：${esc(result.reportMeta.reportId)}</p>
<p>检测时间：${esc(result.reportMeta.detectedAt)}</p>
<p>规则版本：${esc(result.reportMeta.ruleVersion)}</p>
<p>检测模式：${esc(result.reportMeta.detectionMode)}</p>
<p>状态：${esc(result.status)}；评分：${result.score == null ? '评分不可用' : esc(result.score)}</p>
<h2>硬性检测项</h2><pre>${esc(JSON.stringify(result.hardChecks || [], null, 2))}</pre>
<h2>隐私合规风险</h2><pre>${esc(JSON.stringify(result.privacyChecks || [], null, 2))}</pre>
<h2>APK Hash</h2><pre>${esc(JSON.stringify(result.apkHash, null, 2))}</pre>
<h2>扫描日志</h2><pre>${esc(JSON.stringify(result.detectionLogs, null, 2))}</pre>
<h2>报告详情</h2><pre>${esc(JSON.stringify(result, null, 2))}</pre>
</body></html>`
}

function analyzeApk(filePath, options = {}) {
  const stat = fs.statSync(filePath)
  const originalName = options.originalName || path.basename(filePath).replace(/^\d+-[a-f0-9]+-/, '')
  const engine = getEngineHealth()
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const reportMeta = {
    reportId: `APKFLOW-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    detectedAt: generatedAt,
    ruleVersion: RULE_VERSION,
    detectionMode: engine.mode
  }
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

  const detectionLogs = [
    logItem('zip', 'APK Zip 扫描', zipScanOk, 'Zip 结构读取成功', unzip.error || 'Zip 结构读取失败'),
    logItem('manifest', 'Manifest 解析', manifestOk, 'Manifest 基础信息解析成功', badging.error || 'Manifest 解析失败'),
    logItem('abi', 'ABI 扫描', abiScanOk, 'ABI 目录扫描成功', unzip.error || 'ABI 扫描失败'),
    logItem('signature', '签名检测', signatureOk, '签名信息已检测', apksignerOutput.error || '签名检测失败'),
    logItem('http', 'HTTP 扫描', httpScanOk, 'HTTP 明文地址扫描完成', stringsOutput.error || 'HTTP 扫描失败')
  ]

  const abiInfo = {}
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

  const permissions = permissionsDump.ok ? unique(Array.from(permissionsDump.output.matchAll(/uses-permission(?:-sdk-\d+)?: name='([^']+)'/g)).map(m => m[1])) : []
  const sensitivePermissions = permissions.filter(permission => SENSITIVE_PERMISSIONS.includes(permission))
  const combined = `${stringsOutput.output}\n${unzip.output}\n${badging.output}\n${xmltree.output}`
  const httpUrls = httpScanOk ? unique(Array.from(combined.matchAll(/http:\/\/[^\s"'<>\\)]+/g)).map(m => m[0])).slice(0, 100) : []
  const debugKeys = ['DEBUG', 'debug', 'JYSL_DEBUG', 'IS_DEBUG', 'debuggable', 'sandbox', 'staging', 'test_server', 'test']
  const debugKeywords = unique(debugKeys.filter(k => combined.includes(k)))

  const checks = {
    hasArm64: abiScanOk ? Boolean(abiInfo['arm64-v8a']) : null,
    targetSdkOk: targetSdkVersion === null ? null : targetSdkVersion >= 30,
    isPure32Bit: abiScanOk ? Boolean((abiInfo.armeabi || abiInfo['armeabi-v7a'] || abiInfo.x86) && !(abiInfo['arm64-v8a'] || abiInfo.x86_64)) : null,
    hasHttp: httpScanOk ? httpUrls.length > 0 : null,
    hasDebugRisk: httpScanOk || xmltree.ok ? debugKeywords.length > 0 || xmltree.output.includes('android:debuggable') || combined.includes('android:debuggable="true"') : null,
    hasSensitivePermissions: permissionsDump.ok ? sensitivePermissions.length > 0 : null,
    hasSignature: signatureOk,
    hasCleartextRisk: xmltree.ok || stringsOutput.ok ? xmltree.output.includes('usesCleartextTraffic') || combined.includes('usesCleartextTraffic') : null,
    hasAllowBackupRisk: xmltree.ok || stringsOutput.ok ? xmltree.output.includes('allowBackup') || combined.includes('allowBackup="true"') || combined.includes('android:allowBackup') : null
  }

  const selectedRules = Array.isArray(options.selectedChannelIds) && options.selectedChannelIds.length
    ? CHANNEL_RULES.filter(rule => options.selectedChannelIds.includes(rule.id))
    : CHANNEL_RULES
  const hardChecks = buildHardChecks(targetSdkVersion, abiInfo, abiScanOk)
  const privacyChecks = buildPrivacyChecks(permissions, combined)

  const parseErrorReasons = []
  if (!zipScanOk) parseErrorReasons.push(unzip.error || 'Zip 结构读取失败')
  if (!manifestOk) parseErrorReasons.push(badging.error || 'Manifest 解析失败，无法读取 packageName/version/targetSdkVersion')

  const common = {
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
      parseSuccess: parseErrorReasons.length === 0
    },
    abiInfo,
    checks,
    permissions,
    sensitivePermissions,
    httpUrls,
    debugKeywords,
    hardChecks,
    privacyChecks
  }

  if (parseErrorReasons.length > 0) {
    const base = {
      status: 'parse_error',
      grade: null,
      score: null,
      summary: 'APK 解析失败，当前环境无法完整解析该 APK',
      ...common,
      risks: [{ level: 'info', title: '解析失败', detail: parseErrorReasons.join('；'), fix: '请将检测后端部署到支持 unzip、aapt、apksigner、strings 的服务器后重新检测。' }],
      channelChecks: selectedRules.map(rule => ({ id: rule.id, name: rule.name, logo: rule.logo, passed: null, score: null, messages: ['解析失败，渠道结论不可用'] })),
      failReasons: parseErrorReasons
    }
    const developerMessage = buildDeveloperMessage(base)
    const operationMessage = buildOperationMessage(base)
    const htmlReport = buildHtmlReport({ ...base, developerMessage, operationMessage })
    return { ...base, developerMessage, operationMessage, htmlReport }
  }

  const risks = []
  const failReasons = []
  if (checks.hasArm64 === false) {
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
  if (checks.hasArm64 && abiInfo['armeabi-v7a'] === false) {
    risks.push({
      level: 'medium',
      title: '只有 64 位 ABI',
      detail: 'APK 已包含 arm64-v8a，满足 64 位基础要求，但未检测到 armeabi-v7a，不是 32/64 兼容包。',
      currentValue: abiListText(abiInfo),
      expectedValue: '同时包含 armeabi-v7a + arm64-v8a',
      fix: '如果渠道或业务仍需兼容 32 位设备，请研发同时输出 lib/armeabi-v7a/ 与 lib/arm64-v8a/。'
    })
  }
  if (checks.hasHttp) risks.push({ level: 'medium', title: '存在 HTTP 明文地址', detail: `检测到 ${httpUrls.length} 个 HTTP 明文地址。`, fix: '将正式环境地址升级为 HTTPS。' })
  if (checks.hasSensitivePermissions) risks.push({ level: 'medium', title: '存在敏感权限', detail: sensitivePermissions.join('；'), fix: '删除无用敏感权限并同步隐私政策。' })
  for (const item of privacyChecks) {
    if (item.status === 'warning') {
      risks.push({
        level: 'medium',
        title: item.title,
        detail: item.description,
        currentValue: item.findings.length ? item.findings.map(f => f.label).join('；') : '未发现',
        expectedValue: item.key === 'privacyResources' ? '应存在明确同意/拒绝隐私弹窗' : '最小权限、按需申请、授权后初始化',
        fix: item.suggestion
      })
    }
    if (item.status === 'high_risk') {
      risks.push({
        level: 'high',
        title: item.title,
        detail: item.description,
        currentValue: item.findings.map(f => f.label).join('；'),
        expectedValue: '用户同意隐私政策后再初始化和采集',
        fix: item.suggestion
      })
    }
  }

  const channelChecks = selectedRules.map(rule => {
    let channelScore = 100
    const messages = []
    if (rule.requireArm64 && checks.hasArm64 === false) {
      channelScore -= 45
      messages.push('未检测到 arm64-v8a')
    }
    if (targetSdkVersion !== null && targetSdkVersion < rule.targetSdkMin) {
      channelScore -= 35
      messages.push(`targetSdkVersion 低于 ${rule.targetSdkMin}`)
    }
    if (targetSdkVersion === null) messages.push('targetSdkVersion 未解析，不参与达标判定')
    if (checks.hasHttp && rule.strictHttp) {
      channelScore -= 10
      messages.push('存在 HTTP 明文地址')
    }
    channelScore = Math.max(0, channelScore)
    return {
      id: rule.id,
      name: rule.name,
      logo: rule.logo,
      passed: channelScore >= 80 && !(rule.requireArm64 && checks.hasArm64 === false) && !(targetSdkVersion !== null && targetSdkVersion < rule.targetSdkMin),
      score: channelScore,
      messages: messages.length ? messages : ['通过']
    }
  })

  let score = 100
  for (const risk of risks) {
    if (risk.level === 'blocker') score -= 35
    if (risk.level === 'high') score -= 20
    if (risk.level === 'medium') score -= 8
  }
  score = Math.max(0, Math.min(100, score))

  const base = {
    status: failReasons.length === 0 ? 'passed' : 'failed',
    grade: gradeFromScore(score),
    score,
    summary: failReasons.length === 0 ? '渠道提审检测通过' : '渠道提审检测不通过',
    ...common,
    risks,
    channelChecks,
    failReasons
  }
  const developerMessage = buildDeveloperMessage(base)
  const operationMessage = buildOperationMessage(base)
  const htmlReport = buildHtmlReport({ ...base, developerMessage, operationMessage })
  return { ...base, developerMessage, operationMessage, htmlReport }
}

module.exports = { analyzeApk, getEngineHealth }
