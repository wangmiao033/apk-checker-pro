const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const CHANNEL_RULES = require('../../config/channelRules.json')

const ABI_LIST = ['armeabi', 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']
const RULE_VERSION = '2026.06-static-v2'

const SENSITIVE_PERMISSIONS = [
  'android.permission.READ_PHONE_STATE',
  'android.permission.WRITE_SETTINGS',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.GET_TASKS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM'
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
    strings: commandExists('strings', ['/dev/null'])
  }
  const mode = modeFromTools(tools)
  return {
    mode,
    tools,
    message: mode === 'full' ? '完整检测模式' : mode === 'degraded' ? '降级检测模式' : '检测服务暂不可用，请稍后重试',
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

function zipEntries(output) {
  return output.split('\n').map(line => {
    const match = line.trim().match(/^(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/)
    return match ? { size: Number(match[1]), path: match[2] } : null
  }).filter(Boolean)
}

function directorySize(entries, prefix) {
  return entries.filter(entry => entry.path === prefix || entry.path.startsWith(`${prefix}/`)).reduce((sum, entry) => sum + entry.size, 0)
}

function buildAbiDetails(entries, abiInfo) {
  return ABI_LIST.map(abi => {
    const files = entries.filter(entry => entry.path.startsWith(`lib/${abi}/`) && entry.path.endsWith('.so')).map(entry => entry.path.replace(`lib/${abi}/`, ''))
    return { abi, exists: abiInfo[abi], soCount: files.length, sampleSoFiles: files.slice(0, 8) }
  })
}

function buildSizeAnalysis(entries, totalSizeBytes) {
  return {
    totalSizeBytes,
    totalSize: formatSize(totalSizeBytes),
    assetsSizeBytes: directorySize(entries, 'assets'),
    libSizeBytes: directorySize(entries, 'lib'),
    dexSizeBytes: entries.filter(entry => /^classes\d*\.dex$/.test(entry.path)).reduce((sum, entry) => sum + entry.size, 0),
    resSizeBytes: directorySize(entries, 'res'),
    topFiles: entries.filter(entry => entry.size > 0).sort((a, b) => b.size - a.size).slice(0, 20).map(entry => ({ path: entry.path, sizeBytes: entry.size, size: formatSize(entry.size) }))
  }
}

function selectedTargetSdkMin(rules) {
  return rules.reduce((max, rule) => Math.max(max, rule.minTargetSdkVersion || rule.targetSdkMin || 33), 0) || 33
}

function currentChannelRules(rules) {
  return rules.map(rule => ({
    id: rule.id,
    name: rule.name || rule.channelName,
    targetSdkMin: rule.minTargetSdkVersion || rule.targetSdkMin,
    requireArm64: rule.requireArm64,
    allowDebuggable: rule.allowDebuggable,
    allowCleartextTraffic: rule.allowCleartextTraffic
  }))
}

function parseXmlBooleanAttr(xml, attr) {
  const attrLine = (xml || '').split('\n').find(line => line.includes(`android:${attr}`))
  if (!attrLine) return null
  if (/0xffffffff|true/i.test(attrLine)) return true
  if (/0x0|false/i.test(attrLine)) return false
  return null
}

function parseCleartext(xmltree, combined) {
  const value = parseXmlBooleanAttr(xmltree, 'usesCleartextTraffic')
  if (value === true) return { value, mode: 'global' }
  if (value === false) return { value, mode: 'none' }
  if (/networkSecurityConfig/i.test(combined) || /cleartextTrafficPermitted/i.test(combined)) return { value: null, mode: 'domain' }
  return { value: null, mode: 'unknown' }
}

function parseExportedIssues(xmltree, targetSdkVersion) {
  if (targetSdkVersion == null || targetSdkVersion < 31) return []
  const lines = (xmltree || '').split('\n')
  const components = []
  let current = null
  for (const line of lines) {
    const elementMatch = line.match(/^(\s*)E:\s+(activity|service|receiver)\s/)
    if (elementMatch) {
      current = { type: elementMatch[2], name: '未解析组件名', exported: null, hasIntentFilter: false, indent: elementMatch[1].length }
      components.push(current)
      continue
    }
    if (!current) continue
    const indent = (line.match(/^(\s*)/) || [''])[0].length
    if (/^\s*E:\s+intent-filter\s/.test(line) && indent > current.indent) current.hasIntentFilter = true
    if (line.includes('android:name') && indent > current.indent) {
      const nameMatch = line.match(/="([^"]+)"/) || line.match(/\(Raw:\s+"([^"]+)"/)
      if (nameMatch) current.name = nameMatch[1]
    }
    if (line.includes('android:exported') && indent > current.indent) current.exported = parseXmlBooleanAttr(line, 'exported')
  }
  return components.filter(item => item.hasIntentFilter && item.exported === null)
}

function buildSignatureInfo(apksignerOutput, unzipOutput) {
  if (!apksignerOutput.ok) {
    return {
      status: unzipOutput.includes('META-INF/') ? 'unsupported' : 'unknown',
      isDebugSignature: null,
      schemes: { v1: null, v2: null, v3: null, v4: null },
      certificateSha1: null,
      certificateSha256: null,
      validFrom: null,
      validTo: null,
      rawSummary: apksignerOutput.error || null
    }
  }
  const output = apksignerOutput.output
  const scheme = version => {
    const match = output.match(new RegExp(`Verified using v${version} scheme[^:]*:\\s*(true|false)`, 'i'))
    return match ? match[1].toLowerCase() === 'true' : null
  }
  const subject = (output.match(/Signer #\d+ certificate DN:\s*(.+)/) || [])[1] || ''
  return {
    status: 'signed',
    isDebugSignature: /debug|androiddebugkey/i.test(output) || /CN=Android Debug/i.test(subject),
    schemes: { v1: scheme(1), v2: scheme(2), v3: scheme(3), v4: scheme(4) },
    certificateSha1: (output.match(/Signer #\d+ certificate SHA-1 digest:\s*([a-fA-F0-9:]+)/) || [])[1] || null,
    certificateSha256: (output.match(/Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/) || [])[1] || null,
    validFrom: (output.match(/Signer #\d+ certificate valid from:\s*(.+)/) || [])[1] || null,
    validTo: (output.match(/Signer #\d+ certificate valid until:\s*(.+)/) || [])[1] || null,
    rawSummary: subject || output.slice(0, 500)
  }
}

function buildIconInfo(badging, combined) {
  const iconPaths = Array.from((badging || '').matchAll(/application-icon-[^:]+:'([^']+)'/g)).map(match => match[1])
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].reduce((acc, density) => {
    acc[density] = iconPaths.some(icon => icon.includes(`-${density}`) || icon.includes(`/${density}`))
    return acc
  }, {})
  return {
    hasAppIcon: /application-icon/.test(badging || ''),
    hasRoundIcon: /roundIcon/i.test(combined || ''),
    hasAdaptiveIcon: /adaptive-icon/i.test(combined || ''),
    hasDefaultIconRisk: /sym_def_app_icon|ic_launcher/.test(combined || '') && iconPaths.length <= 1,
    densities
  }
}

function normalizePermission(permission) {
  return permission.replace(/^android\.permission\./, '')
}

function permissionSeverity(permission, rules) {
  const shortName = normalizePermission(permission)
  const configured = rules.map(rule => rule.sensitivePermissionPolicy && rule.sensitivePermissionPolicy[shortName]).find(Boolean)
  if (configured === 'high') return 'high'
  if (configured === 'medium') return 'medium'
  if (configured === 'low') return 'low'
  if (['QUERY_ALL_PACKAGES', 'REQUEST_INSTALL_PACKAGES', 'SYSTEM_ALERT_WINDOW'].includes(shortName)) return 'high'
  return 'medium'
}

function createItem(input) {
  return { includedInScore: input.status === 'fail' || input.status === 'warning', ...input }
}

function deductionFor(item) {
  if (item.status !== 'fail' && item.status !== 'warning') return 0
  if (typeof item.scoreImpact === 'number') return Math.abs(item.scoreImpact)
  if (item.severity === 'critical') return 25
  if (item.severity === 'high') return 15
  if (item.severity === 'medium') return 8
  if (item.severity === 'low') return 3
  return 0
}

function scoreFromItems(items) {
  const breakdown = items.map(item => {
    const includedInScore = item.status === 'fail' || item.status === 'warning'
    const deduction = includedInScore ? deductionFor(item) : 0
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      severity: item.severity,
      deduction,
      reason: includedInScore ? item.risk : `${item.status}，未纳入评分。`,
      includedInScore
    }
  })
  return { score: Math.max(0, 100 - breakdown.reduce((sum, item) => sum + item.deduction, 0)), breakdown }
}

function abiListText(abiInfo) {
  const found = ABI_LIST.filter(abi => abiInfo[abi] === true)
  if (ABI_LIST.some(abi => abiInfo[abi] === null)) return 'ABI 扫描失败'
  return found.length ? found.join('、') : '未检测到 lib/ ABI 目录'
}

function buildHardChecks(targetSdkVersion, abiInfo, abiScanOk, targetSdkMin) {
  const targetCheck = targetSdkVersion === null
    ? {
        key: 'targetSdkVersion',
        title: 'targetSdkVersion 无法解析',
        status: 'unknown',
        level: 'info',
        currentValue: '未解析',
        expectedValue: `>= ${targetSdkMin}`,
        description: '无法从 Manifest 解析 targetSdkVersion，不能判定为通过，需要人工确认。',
        suggestion: '请确认 APK 可被 aapt 正常解析，并人工核对 AndroidManifest.xml / Gradle / Unity Target API Level。'
      }
    : targetSdkVersion < targetSdkMin
      ? {
          key: 'targetSdkVersion',
          title: 'targetSdkVersion 低于要求',
          status: 'blocker',
          level: 'blocker',
          currentValue: String(targetSdkVersion),
          expectedValue: `>= ${targetSdkMin}`,
          description: `当前 targetSdkVersion=${targetSdkVersion}，低于当前渠道规则要求 ${targetSdkMin}。`,
          suggestion: `请研发将 targetSdkVersion / Unity Target API Level 升级到 ${targetSdkMin} 或以上，并完成 Android 高版本适配。`,
          unityTip: 'Unity 路径：File > Build Settings > Player Settings > Other Settings > Target API Level'
        }
      : {
          key: 'targetSdkVersion',
          title: 'targetSdkVersion 达标',
          status: 'pass',
          level: 'info',
          currentValue: String(targetSdkVersion),
          expectedValue: `>= ${targetSdkMin}`,
          description: `当前 targetSdkVersion=${targetSdkVersion}，满足当前渠道规则要求。`,
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

function buildDetectionItems(input) {
  const items = []
  const ruleNames = input.selectedRules.map(rule => rule.name || rule.channelName).join('、')
  const abiNames = ABI_LIST.filter(abi => input.abiInfo[abi] === true)
  const hasArm64 = input.abiInfo['arm64-v8a'] === true
  const hasArmv7 = input.abiInfo['armeabi-v7a'] === true

  items.push(createItem({
    id: 'apk_basic_info',
    category: 'basic',
    title: input.parseFailed ? 'APK 基础信息解析失败' : 'APK 基础信息解析完成',
    status: input.parseFailed ? 'parse_failed' : 'pass',
    severity: 'info',
    currentValue: [
      `文件名：${input.fileName}`,
      `文件大小：${formatSize(input.statSize)}`,
      `包名：${display(input.packageName)}`,
      `应用名：${display(input.appName)}`,
      `版本：${display(input.versionName)} / ${display(input.versionCode)}`,
      `minSdkVersion：${display(input.minSdkVersion)}`,
      `targetSdkVersion：${display(input.targetSdkVersion)}`,
      `SHA256：${input.apkHash.sha256}`
    ].join('\n'),
    expectedValue: 'APK 可被 unzip / aapt 正常解析，并能读取包名、版本、Manifest 和 Hash。',
    evidence: input.parseFailed ? input.parseErrorReasons.join('；') : 'aapt dump badging 与 Hash 计算完成。',
    risk: input.parseFailed ? '当前 APK 未被完整解析，不能生成可靠的渠道通过或不通过结论。' : '基础信息已读取，可继续进行渠道关键项判断。',
    suggestion: input.parseFailed ? '请重新上传 APK，或检查文件是否完整、是否为有效 APK。' : '提审前确认包名、应用名、版本号与本次渠道包一致。',
    devInstruction: input.parseFailed ? '请确认 APK 文件完整且 Zip 结构正常，必要时重新导出渠道包。' : '无需整改。'
  }))

  items.push(createItem({
    id: 'abi_64_bit',
    category: 'abi',
    title: hasArm64 ? (hasArmv7 ? 'ABI 32/64 位兼容检查通过' : '仅检测到 64 位 ABI') : '缺少 arm64-v8a 64 位包体',
    status: input.abiInfo['arm64-v8a'] === null ? 'unknown' : hasArm64 ? (hasArmv7 ? 'pass' : 'warning') : 'fail',
    severity: hasArm64 ? (hasArmv7 ? 'info' : 'medium') : 'critical',
    currentValue: [
      `当前 ABI：${abiNames.length ? abiNames.join('、') : '未检测到 lib/ ABI 目录'}`,
      ...input.abiDetails.map(item => `${item.abi}：${item.exists === null ? '未解析' : item.exists ? `${item.soCount} 个 so` : '不存在'}`)
    ].join('\n'),
    expectedValue: '需要包含 arm64-v8a；推荐同时包含 armeabi-v7a + arm64-v8a。',
    evidence: input.abiDetails.map(item => `${item.abi}: ${item.sampleSoFiles.slice(0, 3).join(', ') || '-'}`).join('\n'),
    risk: hasArm64 ? (hasArmv7 ? '未发现 64 位包体阻断风险。' : '仅 64 位包可能影响仍需 32 位兼容的设备覆盖。') : '缺少 arm64-v8a 可能导致渠道 64 位审核不通过。',
    suggestion: hasArm64 ? (hasArmv7 ? '保持当前 ABI 输出配置。' : '如业务仍需覆盖 32 位设备，请补充 armeabi-v7a。') : '请开启 arm64-v8a 架构支持，重新生成 32/64 位兼容包。',
    devInstruction: hasArm64 ? '检查构建产物是否符合渠道包要求。' : '请在 Gradle/Unity/IL2CPP 构建配置中启用 arm64-v8a，并确认 APK 内存在 lib/arm64-v8a/。',
    scoreImpact: hasArm64 ? undefined : 25
  }))

  items.push(createItem({
    id: 'target_sdk_version',
    category: 'target_sdk',
    title: input.targetSdkVersion === null ? 'targetSdkVersion 无法解析' : input.targetSdkVersion < input.targetSdkMin ? 'targetSdkVersion 低于渠道规则要求' : 'targetSdkVersion 检查通过',
    status: input.targetSdkVersion === null ? 'unknown' : input.targetSdkVersion < input.targetSdkMin ? 'fail' : 'pass',
    severity: input.targetSdkVersion === null ? 'info' : input.targetSdkVersion < input.targetSdkMin ? 'high' : 'info',
    currentValue: `当前 targetSdkVersion：${display(input.targetSdkVersion)}`,
    expectedValue: `当前选择规则（${ruleNames}）要求 >= ${input.targetSdkMin}`,
    evidence: input.targetSdkVersion === null ? 'aapt 未返回 targetSdkVersion。' : `AndroidManifest.xml uses-sdk targetSdkVersion=${input.targetSdkVersion}`,
    risk: input.targetSdkVersion === null ? '无法确认 targetSdkVersion 是否满足渠道要求。' : input.targetSdkVersion < input.targetSdkMin ? 'targetSdkVersion 过低，可能影响渠道提审或高版本系统兼容。' : '当前 targetSdkVersion 满足已选渠道规则。',
    suggestion: input.targetSdkVersion === null ? '请人工核对 Gradle 或 AndroidManifest uses-sdk。' : input.targetSdkVersion < input.targetSdkMin ? `建议研发升级 targetSdkVersion 到 ${input.targetSdkMin} 或以上，并完成对应 Android 版本适配。` : '保持当前配置，并关注后续渠道规则变更。',
    devInstruction: input.targetSdkVersion !== null && input.targetSdkVersion < input.targetSdkMin ? '请在 build.gradle 中升级 targetSdkVersion，并同步处理 Android 12+ exported、PendingIntent mutability、通知权限等适配项。' : '无需整改。',
    scoreImpact: input.targetSdkVersion !== null && input.targetSdkVersion < input.targetSdkMin ? 20 : undefined
  }))

  items.push(createItem({
    id: 'android_12_exported',
    category: 'target_sdk',
    title: input.targetSdkVersion !== null && input.targetSdkVersion >= 31 ? 'Android 12+ exported 检查' : 'Android 12+ exported 检查未触发',
    status: input.targetSdkVersion === null ? 'unknown' : input.targetSdkVersion < 31 ? 'pass' : input.exportedIssues.length ? 'fail' : 'pass',
    severity: input.exportedIssues.length ? 'high' : 'info',
    currentValue: input.exportedIssues.length ? input.exportedIssues.map(item => `${item.type} ${item.name}`).join('\n') : '未发现明显 exported 缺失',
    expectedValue: 'targetSdkVersion >= 31 时，带 intent-filter 的组件需要明确 android:exported。',
    evidence: input.exportedIssues.length ? `发现 ${input.exportedIssues.length} 个疑似缺少 exported 的组件。` : 'Manifest xmltree 静态扫描未发现明显 exported 缺失。',
    risk: input.exportedIssues.length ? 'Android 12+ 安装或渠道审核可能因 exported 缺失失败。' : '未发现本项明显阻断风险。',
    suggestion: input.exportedIssues.length ? '请为带 intent-filter 的组件明确声明 android:exported。' : '保持当前组件声明。',
    devInstruction: input.exportedIssues.length ? '请检查 AndroidManifest.xml 中上述组件，补充 android:exported=\"true/false\" 并重新打包。' : '无需整改。',
    scoreImpact: input.exportedIssues.length ? 15 : undefined
  }))

  items.push(createItem({
    id: 'debuggable',
    category: 'debug',
    title: input.debuggable === true ? 'Debug 包风险' : input.debuggable === false ? 'Debug 状态检查通过' : 'Debug 状态无法确认',
    status: input.debuggable === true ? 'fail' : input.debuggable === false ? 'pass' : 'unknown',
    severity: input.debuggable === true ? 'critical' : 'info',
    currentValue: `android:debuggable=${input.debuggable === null ? '未解析' : input.debuggable}`,
    expectedValue: '正式提审包 android:debuggable 必须为 false 或不显式开启。',
    evidence: input.debuggable === null ? 'Manifest 未解析到 debuggable 属性。' : `Manifest debuggable=${input.debuggable}`,
    risk: input.debuggable === true ? 'Debug 包可能暴露调试能力，通常会导致渠道审核阻断。' : '未发现 Debug 包风险或需要人工确认。',
    suggestion: input.debuggable === true ? '请关闭 debug 构建配置，使用 release 包和正式签名重新打包。' : '继续保持 release 构建配置。',
    devInstruction: input.debuggable === true ? '请确认 buildTypes.release.debuggable=false，AndroidManifest 不要开启 android:debuggable=true。' : '无需整改。',
    scoreImpact: input.debuggable === true ? 25 : undefined
  }))

  items.push(createItem({
    id: 'http_cleartext',
    category: 'http',
    title: input.cleartext.value === true ? 'HTTP 明文全局开启' : input.httpUrls.length ? '检测到 HTTP 明文地址' : 'HTTP 明文检查',
    status: input.cleartext.value === true ? 'fail' : input.httpUrls.length || input.cleartext.mode === 'domain' ? 'warning' : input.cleartext.mode === 'unknown' ? 'unknown' : 'pass',
    severity: input.cleartext.value === true ? 'high' : input.httpUrls.length || input.cleartext.mode === 'domain' ? 'medium' : 'info',
    currentValue: [`usesCleartextTraffic：${input.cleartext.value === null ? '未解析' : input.cleartext.value}`, `HTTP URL：${input.httpUrls.length ? input.httpUrls.slice(0, 10).join('；') : '未检测到'}`].join('\n'),
    expectedValue: '正式环境地址建议使用 HTTPS；如必须 HTTP，应限定必要域名，不要全局放开。',
    evidence: input.httpUrls.length ? `strings/xmltree 命中 ${input.httpUrls.length} 个 http:// 地址。` : '静态字符串未命中 http:// 地址。',
    risk: input.cleartext.value === true ? '全局允许 HTTP 明文可能触发渠道隐私与网络安全审核。' : input.httpUrls.length ? 'HTTP 明文地址可能触发隐私和网络安全审核关注。' : '未发现明显 HTTP 明文风险。',
    suggestion: input.cleartext.value === true ? '请关闭全局 cleartext，尽量全部改为 HTTPS。' : input.httpUrls.length ? '请将正式环境地址升级为 HTTPS，或限定到必要域名。' : '保持 HTTPS 化。',
    devInstruction: input.cleartext.value === true ? '请移除 android:usesCleartextTraffic=\"true\"，并检查 network_security_config。' : input.httpUrls.length ? '请搜索并替换上述 HTTP 地址，重新打包后复测。' : '无需整改。',
    scoreImpact: input.cleartext.value === true ? 10 : input.httpUrls.length ? 5 : undefined
  }))

  const permissionNames = ['READ_PHONE_STATE', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS', 'QUERY_ALL_PACKAGES', 'REQUEST_INSTALL_PACKAGES', 'SYSTEM_ALERT_WINDOW', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM']
  for (const permissionName of permissionNames) {
    const fullName = `android.permission.${permissionName}`
    const exists = input.permissions.includes(fullName)
    const severity = permissionSeverity(fullName, input.selectedRules)
    items.push(createItem({
      id: `permission_${permissionName.toLowerCase()}`,
      category: 'permissions',
      title: `${permissionName} 权限检查`,
      status: exists ? 'warning' : 'pass',
      severity: exists ? severity : 'info',
      currentValue: exists ? `已申请 ${permissionName}` : `未申请 ${permissionName}`,
      expectedValue: '权限最小化；敏感权限需要业务必要性、授权时机和隐私政策说明。',
      evidence: exists ? `Manifest uses-permission: ${fullName}` : 'Manifest 未发现该权限。',
      risk: exists ? `${permissionName} 属于渠道或隐私合规关注权限，需要确认是否必要。` : '未发现该权限风险。',
      suggestion: exists ? '请确认权限必要性；非必要建议移除，必要时补充隐私政策和权限使用说明。' : '继续保持最小权限。',
      devInstruction: exists ? `请研发确认 ${permissionName} 是否必要；如不必要，从 AndroidManifest.xml 移除。` : '无需整改。',
      scoreImpact: exists && severity === 'high' ? 10 : exists ? 4 : undefined
    }))
  }

  items.push(createItem({
    id: 'signature',
    category: 'signature',
    title: input.signatureInfo.status === 'signed' ? '签名信息检查' : '签名信息无法确认',
    status: input.signatureInfo.status === 'signed' ? input.signatureInfo.isDebugSignature ? 'fail' : 'pass' : input.signatureInfo.status === 'unsupported' ? 'unsupported' : 'unknown',
    severity: input.signatureInfo.isDebugSignature ? 'high' : 'info',
    currentValue: [`签名状态：${input.signatureInfo.status}`, `Debug 签名：${input.signatureInfo.isDebugSignature === null ? '未解析' : input.signatureInfo.isDebugSignature}`, `证书 SHA1：${display(input.signatureInfo.certificateSha1)}`, `证书 SHA256：${display(input.signatureInfo.certificateSha256)}`].join('\n'),
    expectedValue: 'APK 使用正式签名，建议至少支持 v2 签名；不要使用 Android Debug 签名。',
    evidence: input.signatureInfo.rawSummary || 'apksigner 未返回完整签名信息。',
    risk: input.signatureInfo.isDebugSignature ? 'Debug 签名不适合渠道提审，可能导致上传或审核失败。' : input.signatureInfo.status === 'signed' ? '签名信息已确认。' : '当前工具未能确认签名，不直接扣分，但需要人工复核。',
    suggestion: input.signatureInfo.isDebugSignature ? '请使用正式 keystore 重新签名。' : '保持正式签名流程或人工复核。',
    devInstruction: input.signatureInfo.isDebugSignature ? '请切换 release signingConfig，重新打包签名。' : '无需整改或人工复核。',
    scoreImpact: input.signatureInfo.isDebugSignature ? 15 : undefined
  }))

  items.push(createItem({
    id: 'icon_label',
    category: 'icon',
    title: input.iconInfo.hasAppIcon ? '图标与应用名检查' : '应用图标缺失风险',
    status: !input.appName || input.iconInfo.hasAppIcon === false || input.iconInfo.hasDefaultIconRisk ? 'warning' : 'pass',
    severity: !input.appName || input.iconInfo.hasDefaultIconRisk ? 'medium' : 'info',
    currentValue: [`应用名：${display(input.appName)}`, `app icon：${display(input.iconInfo.hasAppIcon)}`, `roundIcon：${display(input.iconInfo.hasRoundIcon)}`, `adaptive icon：${display(input.iconInfo.hasAdaptiveIcon)}`].join('\n'),
    expectedValue: '应用名不为空，应用图标存在，尽量提供多密度图标、roundIcon 或 adaptive icon。',
    evidence: '基于 aapt badging 与 APK 资源名静态扫描。',
    risk: !input.appName ? '应用名为空可能影响渠道展示和审核。' : input.iconInfo.hasDefaultIconRisk ? '疑似默认图标会影响渠道素材审核和用户识别。' : '未发现明显图标或应用名风险。',
    suggestion: !input.appName ? '请补充正式 appLabel。' : input.iconInfo.hasDefaultIconRisk ? '请替换默认图标，并补齐多分辨率图标资源。' : '保持当前图标与应用名配置。',
    devInstruction: !input.appName ? '请检查 android:label 或应用名资源。' : input.iconInfo.hasDefaultIconRisk ? '请替换 mipmap/ic_launcher 相关默认资源。' : '无需整改。',
    scoreImpact: !input.appName || input.iconInfo.hasDefaultIconRisk ? 5 : undefined
  }))

  items.push(createItem({
    id: 'size_analysis',
    category: 'size',
    title: '包体大小分析',
    status: 'pass',
    severity: 'low',
    currentValue: [`APK 总大小：${input.sizeAnalysis.totalSize}`, `assets：${formatSize(input.sizeAnalysis.assetsSizeBytes)}`, `lib：${formatSize(input.sizeAnalysis.libSizeBytes)}`, `dex：${formatSize(input.sizeAnalysis.dexSizeBytes)}`, `res：${formatSize(input.sizeAnalysis.resSizeBytes)}`, `Top 大文件：${input.sizeAnalysis.topFiles.slice(0, 5).map(file => `${file.path} ${file.size}`).join('；') || '无'}`].join('\n'),
    expectedValue: '不超过当前渠道规则包体限制。',
    evidence: '基于 unzip -l 文件大小统计。',
    risk: '包体过大可能影响渠道上传、审核和用户下载转化。',
    suggestion: '优先检查 assets、lib、res 和 Top 大文件，清理无用资源、压缩图片音频。',
    devInstruction: '请研发根据 Top 大文件列表进行资源清理和压缩。'
  }))

  return items
}

function buildSubmissionConclusion(status, hardChecks, privacyChecks, risks) {
  if (status === 'parse_error') {
    return {
      status: 'unknown',
      title: '无法解析，需要人工确认',
      summary: '当前环境无法完整解析 APK，不能判定为通过或不通过，需要先修复解析能力或人工确认。',
      level: 'info'
    }
  }
  const hasBlocker = hardChecks.some(item => item.status === 'blocker') || risks.some(item => item.level === 'blocker')
  const noPrivacyDialog = privacyChecks.some(item => item.key === 'privacyResources' && item.status === 'warning')
  const hasCollectionRisk = privacyChecks.some(item => item.key === 'preConsentCollection' && item.status === 'high_risk')
  const hasHighOrWarning = risks.some(item => item.level === 'high' || item.level === 'medium')

  if (hasBlocker) return { status: 'blocked', title: '阻断，需要重新出包', summary: 'APK 存在 targetSdkVersion 或 64 位包体等阻断问题，当前不应提交渠道，需要研发重新打包。', level: 'blocker' }
  if (noPrivacyDialog && hasCollectionRisk) return { status: 'not_recommended', title: '不建议提交', summary: '未发现明确隐私弹窗资源，同时发现设备标识或 SDK 采集能力，建议先完成隐私授权流程整改和真机验证。', level: 'high' }
  if (hasHighOrWarning) return { status: 'risk', title: '有风险', summary: '硬性项未发现阻断问题，但仍存在隐私、权限、HTTP 或 SDK 初始化相关风险，建议整改后提交。', level: 'medium' }
  return { status: 'passed', title: '通过', summary: '硬性检测项通过，未发现明显高风险项，可进入渠道提交前复核。', level: 'info' }
}

function abiList(result) {
  const found = Object.entries(result.abiInfo || {}).filter(([, exists]) => exists === true).map(([abi]) => abi)
  if (Object.values(result.abiInfo || {}).some(value => value === null)) return 'ABI 扫描失败'
  return found.length ? found.join('、') : '未检测到 lib/ ABI 目录'
}

function permissionList(result) {
  const permissionCheck = (result.privacyChecks || []).find(item => item.key === 'permissions')
  return permissionCheck && permissionCheck.findings.length ? permissionCheck.findings.map(item => item.label).join('、') : '未命中重点权限'
}

function collectionList(result) {
  const collectionCheck = (result.privacyChecks || []).find(item => item.key === 'preConsentCollection')
  return collectionCheck && collectionCheck.findings.length ? collectionCheck.findings.map(item => item.label).join('、') : '未命中设备标识采集关键词'
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
  if (Array.isArray(result.detectionItems) && result.detectionItems.length) {
    const items = result.detectionItems.filter(item => item.status === 'fail' || item.status === 'warning')
    return [
      '【APK 渠道提审整改说明】',
      '',
      `APK：${display(result.apkInfo.fileName)}`,
      `包名：${display(result.apkInfo.packageName)}`,
      `版本：${display(result.apkInfo.versionName)} / ${display(result.apkInfo.versionCode)}`,
      `检测结论：${result.submissionConclusion.title}`,
      '',
      items.length ? '需要研发处理的问题：' : '当前未发现需要研发立即整改的 fail / warning 项。',
      '',
      ...items.map((item, index) => [
        `${index + 1}. ${item.title}`,
        `当前检测值：${item.currentValue}`,
        `渠道要求：${item.expectedValue}`,
        `风险：${item.risk}`,
        `建议：${item.devInstruction || item.suggestion}`
      ].join('\n\n')),
      '',
      '处理完成后，请重新打包并上传 APKFlow 复测。'
    ].filter(Boolean).join('\n')
  }
  if (result.status === 'passed') return [
    `当前 APK 检测结论：${result.submissionConclusion.title}。`,
    '',
    `包名：${display(result.apkInfo.packageName)}`,
    `版本：${display(result.apkInfo.versionName)} / ${display(result.apkInfo.versionCode)}`,
    `targetSdkVersion：${display(result.apkInfo.targetSdkVersion)}`,
    `ABI 情况：${abiList(result)}`,
    '',
    '请在渠道后台提交前再核对渠道专属规则。'
  ].join('\n')
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
    `当前 APK 检测${result.submissionConclusion.title}。主要问题如下：`,
    '',
    `1. targetSdkVersion=${display(result.apkInfo.targetSdkVersion)}，${result.checks.targetSdkOk === false ? '低于当前渠道规则要求，需要按已选规则升级' : '当前未发现 targetSdkVersion 阻断问题'}；`,
    `2. ABI 情况：${abiList(result)}；`,
    `3. Manifest 中存在高风险权限：${permissionList(result)}；`,
    `4. APK 中发现设备标识采集能力：${collectionList(result)}；`,
    '5. 请确保用户同意隐私政策前，不初始化 SDK、不申请权限、不读取设备信息；',
    '6. Unity 项目建议在 UnityPlayerActivity 前增加 PrivacyActivity；',
    '7. 隐私政策和第三方 SDK 清单需要补全 SDK 名称、第三方公司、收集信息类型、功能用途、官网和隐私政策链接；',
    '8. 整改后重新打包并重新上传渠道检测。',
    hardCheckFixes ? ['', '硬性检测整改明细：', hardCheckFixes].join('\n') : '',
    privacyFixes ? ['', '隐私合规关注项：', privacyFixes].join('\n') : '',
    '',
    '处理完成后，请重新上传 APKFlow 复测。'
  ].join('\n')
}

function buildOperationMessage(result) {
  if (result.status === 'parse_error') return `APK 解析失败，当前环境无法完整解析该 APK。评分不可用，渠道结论不可用。原因：${result.failReasons.join('；')}`
  if (result.status === 'passed') return 'APK 提交前检测通过。'
  if (Array.isArray(result.detectionItems) && result.detectionItems.length) {
    const items = result.detectionItems.filter(item => item.status === 'fail' || item.status === 'warning')
    if (items.length) return `当前 APK 检测结果为${result.submissionConclusion.title}，主要原因是 ${items.slice(0, 4).map(item => item.title).join('、')}。建议先交由研发处理上述问题，重新打包并通过 APKFlow 复测后再提交渠道。`
  }
  const blockers = (result.hardChecks || []).filter(item => item.status === 'blocker').map(item => item.title)
  const warnings = (result.hardChecks || []).filter(item => item.status === 'warning' || item.status === 'unknown').map(item => item.title)
  return `该 APK 当前存在上架风险，${result.submissionConclusion.status === 'blocked' ? '需要重新出包' : '暂不建议直接提交'}。主要原因是 ${blockers.join('；') || result.failReasons.join('；') || '存在隐私合规高风险项'}。需要研发重新打包，并确认首次启动隐私授权、SDK 初始化时机、权限申请和第三方 SDK 披露情况。${warnings.length ? `需关注：${warnings.join('；')}。` : ''}`
}

function buildMarkdownReport(result) {
  if (Array.isArray(result.detectionItems) && result.detectionItems.length) {
    const scoreLines = (result.scoreBreakdown || [])
      .filter(item => item.includedInScore || item.status === 'unknown' || item.status === 'unsupported')
      .map(item => item.includedInScore ? `- ${item.title}：-${item.deduction}（${item.reason}）` : `- ${item.title}：未纳入评分（${item.reason}）`)
      .join('\n') || '未发现扣分项。'
    const section = (title, categories) => {
      const items = result.detectionItems.filter(item => categories.includes(item.category))
      return [`## ${title}`, '', items.length ? items.map(item => [
        `**${item.title}**`,
        `- 状态：${item.status}`,
        `- 当前检测值：${item.currentValue}`,
        `- 规则要求：${item.expectedValue}`,
        `- 证据：${item.evidence}`,
        `- 风险说明：${item.risk}`,
        `- 研发整改建议：${item.devInstruction || item.suggestion}`
      ].join('\n')).join('\n\n') : '暂无检测项。'].join('\n')
    }
    return [
      '# APKFlow 渠道上架前 APK 风险检测报告',
      '',
      '## 检测结论',
      '',
      `- 总体结论：${result.submissionConclusion.title}`,
      `- 结论说明：${result.submissionConclusion.summary}`,
      `- APKFlow Score：${result.score == null ? '不可用' : `${result.score}/100`}`,
      `- 报告编号：${result.reportMeta.reportId}`,
      `- 检测时间：${result.reportMeta.detectedAt}`,
      `- 当前使用的渠道规则：${(result.currentChannelRules || []).map(rule => `${rule.name}(targetSdk>=${rule.targetSdkMin})`).join('、') || '未记录'}`,
      '',
      '## 评分明细',
      '',
      scoreLines,
      '',
      section('APK 基础信息', ['basic']),
      '',
      section('渠道提审关键项', ['target_sdk', 'abi', 'debug', 'http', 'signature']),
      '',
      section('权限与隐私风险', ['permissions']),
      '',
      section('图标与资源', ['icon']),
      '',
      section('包体大小分析', ['size']),
      '',
      '## 研发整改清单',
      '',
      result.developerMessage,
      '',
      '## 运营提审建议',
      '',
      result.operationMessage
    ].join('\n')
  }

  const risks = result.risks.length
    ? result.risks.map((risk, index) => [
      `${index + 1}. **${risk.title}**`,
      `   - 风险等级：${risk.level}`,
      `   - 当前检测值：${display(risk.currentValue)}`,
      `   - 要求值：${display(risk.expectedValue)}`,
      `   - 影响说明：${risk.detail}`,
      `   - 研发整改建议：${display(risk.fix)}`,
      `   - 运营备注：${display(risk.operationNote)}`
    ].join('\n')).join('\n')
    : '未发现明显风险。'

  return [
    '# APKFlow 渠道上架前 APK 风险检测报告',
    '',
    `- 总体结论：${result.submissionConclusion.title}`,
    `- 结论说明：${result.submissionConclusion.summary}`,
    `- 报告编号：${result.reportMeta.reportId}`,
    `- 检测时间：${result.reportMeta.detectedAt}`,
    `- 规则版本：${result.reportMeta.ruleVersion}`,
    '',
    '## APK 基础信息',
    '',
    `- 应用名：${display(result.apkInfo.appName)}`,
    `- 包名：${display(result.apkInfo.packageName)}`,
    `- 版本：${display(result.apkInfo.versionName)} / ${display(result.apkInfo.versionCode)}`,
    `- minSdkVersion：${display(result.apkInfo.minSdkVersion)}`,
    `- targetSdkVersion：${display(result.apkInfo.targetSdkVersion)}`,
    `- ABI：${abiList(result)}`,
    '',
    '## 风险项',
    '',
    risks,
    '',
    '## 研发整改说明',
    '',
    result.developerMessage,
    '',
    '## 运营说明',
    '',
    result.operationMessage
  ].join('\n')
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
  const entries = unzip.ok ? zipEntries(unzip.output) : []

  const zipScanOk = unzip.ok && unzip.output.includes('AndroidManifest.xml')
  const manifestOk = badging.ok && /package: name='[^']+'/.test(badging.output)
  const abiScanOk = unzip.ok && unzip.output.length > 0
  const signatureOk = apksignerOutput.ok || unzip.output.includes('META-INF/')
  const httpScanOk = stringsOutput.ok || unzip.ok || xmltree.ok

  const detectionLogs = [
    { key: 'upload', label: '上传阶段', status: 'success', message: 'APK 文件已保存到临时检测目录', detail: { originalFileName: originalName, storedFileName: options.storedFileName || path.basename(filePath), fileSize: stat.size, mimeType: options.mimeType || '未提供', sha256: apkHash.sha256 } },
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
  const compileMatch = badging.output.match(/compileSdkVersion='(\d+)'/)
  const minSdkVersion = minMatch ? Number(minMatch[1]) : null
  const targetSdkVersion = targetMatch ? Number(targetMatch[1]) : null
  const compileSdkVersion = compileMatch ? Number(compileMatch[1]) : null

  const permissions = permissionsDump.ok ? unique(Array.from(permissionsDump.output.matchAll(/uses-permission(?:-sdk-\d+)?: name='([^']+)'/g)).map(m => m[1])) : []
  const sensitivePermissions = permissions.filter(permission => SENSITIVE_PERMISSIONS.includes(permission))
  const combined = `${stringsOutput.output}\n${unzip.output}\n${badging.output}\n${xmltree.output}`
  const httpUrls = httpScanOk ? unique(Array.from(combined.matchAll(/http:\/\/[^\s"'<>\\)]+/g)).map(m => m[0])).slice(0, 100) : []
  const debugKeys = ['JYSL_DEBUG', 'IS_DEBUG', 'sandbox', 'staging', 'test_server']
  const debugKeywords = unique(debugKeys.filter(k => combined.includes(k)))
  const availableRules = Array.isArray(options.channelRules) && options.channelRules.length ? options.channelRules : CHANNEL_RULES
  const selectedRules = Array.isArray(options.selectedChannelIds) && options.selectedChannelIds.length
    ? availableRules.filter(rule => options.selectedChannelIds.includes(rule.id))
    : availableRules
  const targetSdkMin = selectedTargetSdkMin(selectedRules)
  const debuggable = xmltree.ok ? parseXmlBooleanAttr(xmltree.output, 'debuggable') : null
  const cleartext = parseCleartext(xmltree.output, combined)
  const exportedIssues = parseExportedIssues(xmltree.output, targetSdkVersion)
  const signatureInfo = buildSignatureInfo(apksignerOutput, unzip.output)
  const iconInfo = buildIconInfo(badging.output, combined)
  const sizeAnalysis = buildSizeAnalysis(entries, stat.size)

  const checks = {
    hasArm64: abiScanOk ? Boolean(abiInfo['arm64-v8a']) : null,
    targetSdkOk: targetSdkVersion === null ? null : targetSdkVersion >= targetSdkMin,
    isPure32Bit: abiScanOk ? Boolean((abiInfo.armeabi || abiInfo['armeabi-v7a'] || abiInfo.x86) && !(abiInfo['arm64-v8a'] || abiInfo.x86_64)) : null,
    isOnly64Bit: abiScanOk ? Boolean((abiInfo['arm64-v8a'] || abiInfo.x86_64) && !(abiInfo.armeabi || abiInfo['armeabi-v7a'] || abiInfo.x86)) : null,
    hasArmv7: abiScanOk ? Boolean(abiInfo['armeabi-v7a']) : null,
    hasHttp: httpScanOk ? httpUrls.length > 0 : null,
    usesCleartextTraffic: cleartext.value,
    cleartextMode: cleartext.mode,
    hasDebugRisk: debuggable,
    debuggable,
    hasSensitivePermissions: permissionsDump.ok ? sensitivePermissions.length > 0 : null,
    hasSignature: signatureOk,
    hasCleartextRisk: cleartext.value === true || cleartext.mode === 'domain' || httpUrls.length > 0,
    hasAllowBackupRisk: xmltree.ok || stringsOutput.ok ? xmltree.output.includes('allowBackup') || combined.includes('allowBackup="true"') || combined.includes('android:allowBackup') : null
  }

  const abiDetails = buildAbiDetails(entries, abiInfo)
  const hardChecks = buildHardChecks(targetSdkVersion, abiInfo, abiScanOk, targetSdkMin)
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
      appLabel: appName,
      versionCode,
      versionName,
      minSdkVersion,
      targetSdkVersion,
      compileSdkVersion,
      hasSignature: signatureOk,
      parseSuccess: parseErrorReasons.length === 0
    },
    abiInfo,
    abiDetails,
    signatureInfo,
    iconInfo,
    sizeAnalysis,
    checks,
    permissions,
    sensitivePermissions,
    httpUrls,
    debugKeywords,
    hardChecks,
    privacyChecks,
    currentChannelRules: currentChannelRules(selectedRules)
  }

  const detectionItems = buildDetectionItems({
    parseFailed: parseErrorReasons.length > 0,
    parseErrorReasons,
    fileName: originalName,
    statSize: stat.size,
    packageName,
    appName,
    versionCode,
    versionName,
    minSdkVersion,
    targetSdkVersion,
    compileSdkVersion,
    apkHash,
    abiInfo,
    abiDetails,
    targetSdkMin,
    selectedRules,
    debuggable,
    cleartext,
    httpUrls,
    permissions,
    signatureInfo,
    iconInfo,
    sizeAnalysis,
    exportedIssues
  })

  if (parseErrorReasons.length > 0) {
    const scoreResult = scoreFromItems(detectionItems)
    const parseRisks = [{ level: 'info', title: '解析失败', detail: parseErrorReasons.join('；'), currentValue: '未解析', expectedValue: 'APK 可被 unzip/aapt 正常解析', fix: '请将检测后端部署到支持 unzip、aapt、apksigner、strings 的服务器后重新检测。', operationNote: '当前报告不能作为渠道通过或不通过依据，需要人工确认。' }]
    const base = {
      status: 'parse_error',
      submissionConclusion: buildSubmissionConclusion('parse_error', hardChecks, privacyChecks, parseRisks),
      grade: null,
      score: null,
      summary: 'APK 解析失败，当前环境无法完整解析该 APK',
      ...common,
      detectionItems,
      scoreBreakdown: scoreResult.breakdown,
      risks: parseRisks,
      channelChecks: selectedRules.map(rule => ({ id: rule.id, name: rule.name, logo: rule.logo, passed: null, score: null, messages: ['解析失败，渠道结论不可用'] })),
      failReasons: parseErrorReasons
    }
    const developerMessage = buildDeveloperMessage(base)
    const operationMessage = buildOperationMessage(base)
    const markdownReport = buildMarkdownReport({ ...base, developerMessage, operationMessage })
    const fullReportText = markdownReport
    const htmlReport = buildHtmlReport({ ...base, developerMessage, operationMessage, markdownReport, fullReportText })
    return { ...base, developerMessage, operationMessage, markdownReport, fullReportText, htmlReport }
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
      fix: '请研发重新输出 64 位包体，并确保最终 APK 至少包含 lib/arm64-v8a/；如需兼容 32 位设备，建议同时保留 lib/armeabi-v7a/。',
      operationNote: '缺少 64 位包体通常会导致渠道审核阻断，暂不建议提交。'
    })
  }
  if (targetSdkVersion !== null && targetSdkVersion < targetSdkMin) {
    failReasons.push(`targetSdkVersion 低于 ${targetSdkMin}，不符合当前渠道规则要求。`)
    risks.push({
      level: 'blocker',
      title: 'targetSdkVersion 低于要求',
      detail: `当前 targetSdkVersion=${targetSdkVersion}，低于当前渠道规则要求 ${targetSdkMin}。`,
      currentValue: targetSdkVersion,
      expectedValue: `>= ${targetSdkMin}`,
      fix: `请研发将 targetSdkVersion / Unity Target API Level 升级到 ${targetSdkMin} 或以上，并完成 Android 高版本适配。Unity 路径：File > Build Settings > Player Settings > Other Settings > Target API Level`,
      operationNote: 'targetSdkVersion 低于渠道要求时，通常需要重新出包后再提交。'
    })
  }
  if (checks.hasArm64 && abiInfo['armeabi-v7a'] === false) {
    risks.push({
      level: 'medium',
      title: '只有 64 位 ABI',
      detail: 'APK 已包含 arm64-v8a，满足 64 位基础要求，但未检测到 armeabi-v7a，不是 32/64 兼容包。',
      currentValue: abiListText(abiInfo),
      expectedValue: '同时包含 armeabi-v7a + arm64-v8a',
      fix: '如果渠道或业务仍需兼容 32 位设备，请研发同时输出 lib/armeabi-v7a/ 与 lib/arm64-v8a/。',
      operationNote: '已满足 64 位基础要求，但可能影响仍需 32 位兼容的设备覆盖。'
    })
  }
  if (cleartext.value === true) risks.push({ level: 'high', title: 'HTTP 明文全局开启', detail: 'Manifest 配置 android:usesCleartextTraffic=true，当前 APK 全局允许 HTTP 明文。', currentValue: 'usesCleartextTraffic=true', expectedValue: '不要全局放开 HTTP 明文；如必须使用 HTTP，请限定必要域名。', fix: '请移除全局 cleartext 配置，正式环境地址尽量改为 HTTPS。', operationNote: '全局 HTTP 明文可能触发渠道隐私与网络安全审核。' })
  else if (checks.hasHttp) risks.push({ level: 'medium', title: '存在 HTTP 明文地址', detail: `检测到 ${httpUrls.length} 个 HTTP 明文地址。`, currentValue: httpUrls.slice(0, 10).join('；'), expectedValue: '正式环境接口和资源应使用 HTTPS', fix: '将正式环境地址升级为 HTTPS。', operationNote: 'HTTP 明文地址可能触发隐私与网络安全审核关注。' })
  if (checks.hasSensitivePermissions) risks.push({ level: 'medium', title: '存在敏感权限', detail: sensitivePermissions.join('；'), currentValue: sensitivePermissions.join('；'), expectedValue: '最小权限、按需申请、隐私政策披露', fix: '删除无用敏感权限并同步隐私政策。', operationNote: '敏感权限需要确认业务必要性和授权时机。' })
  if (checks.hasDebugRisk) risks.push({ level: 'blocker', title: 'Debug 包风险', detail: 'Manifest 检测到 android:debuggable=true。', currentValue: 'android:debuggable=true', expectedValue: '正式提审包必须关闭 Debug。', fix: '关闭 Debug 配置，确认使用 release 构建和正式签名。' })
  if (exportedIssues.length > 0) risks.push({ level: 'high', title: 'Android 12+ exported 缺失', detail: `发现 ${exportedIssues.length} 个带 intent-filter 的组件疑似未声明 android:exported。`, currentValue: exportedIssues.map(item => `${item.type} ${item.name}`).join('；'), expectedValue: 'targetSdkVersion >= 31 时，带 intent-filter 的组件必须明确 android:exported。', fix: '请为相关 activity / service / receiver 补充 android:exported=true/false。' })
  for (const item of privacyChecks) {
    if (item.status === 'warning') {
      risks.push({
        level: 'medium',
        title: item.title,
        detail: item.description,
        currentValue: item.findings.length ? item.findings.map(f => f.label).join('；') : '未发现',
        expectedValue: item.key === 'privacyResources' ? '应存在明确同意/拒绝隐私弹窗' : '最小权限、按需申请、授权后初始化',
        fix: item.suggestion,
        operationNote: '隐私合规项需要研发整改后，由运营或合规同事复核隐私政策和弹窗流程。'
      })
    }
    if (item.status === 'high_risk') {
      risks.push({
        level: 'high',
        title: item.title,
        detail: item.description,
        currentValue: item.findings.map(f => f.label).join('；'),
        expectedValue: '用户同意隐私政策后再初始化和采集',
        fix: item.suggestion,
        operationNote: '授权前采集能力属于渠道重点关注项，建议完成真机抓包验证后再提交。'
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
    const ruleTarget = rule.minTargetSdkVersion || rule.targetSdkMin
    if (targetSdkVersion !== null && targetSdkVersion < ruleTarget) {
      channelScore -= 35
      messages.push(`targetSdkVersion 低于 ${ruleTarget}`)
    }
    if (targetSdkVersion === null) messages.push('targetSdkVersion 未解析，不参与达标判定')
    if (cleartext.value === true && !rule.allowCleartextTraffic) {
      channelScore -= 15
      messages.push('全局允许 HTTP 明文')
    } else if (checks.hasHttp && rule.strictHttp) {
      channelScore -= 10
      messages.push('存在 HTTP 明文地址')
    }
    if (debuggable === true && !rule.allowDebuggable) {
      channelScore -= 35
      messages.push('debuggable=true')
    }
    channelScore = Math.max(0, channelScore)
    return {
      id: rule.id,
      name: rule.name,
      logo: rule.logo,
      passed: channelScore >= 80
        && !(rule.requireArm64 && checks.hasArm64 === false)
        && !(targetSdkVersion !== null && targetSdkVersion < ruleTarget)
        && !(debuggable === true && !rule.allowDebuggable)
        && !(cleartext.value === true && !rule.allowCleartextTraffic),
      score: channelScore,
      messages: messages.length ? messages : ['通过']
    }
  })

  for (const item of detectionItems.filter(item => item.status === 'fail')) {
    if (!failReasons.some(reason => reason.includes(item.title))) failReasons.push(`${item.title}：${item.risk}`)
  }
  const scoreResult = scoreFromItems(detectionItems)
  const score = scoreResult.score
  detectionLogs.push({ key: 'scoring', label: '评分明细', status: 'success', message: `APKFlow Score=${score}/100`, detail: { score, scoreBreakdown: scoreResult.breakdown } })

  const base = {
    status: failReasons.length === 0 ? 'passed' : 'failed',
    submissionConclusion: buildSubmissionConclusion(failReasons.length === 0 ? 'passed' : 'failed', hardChecks, privacyChecks, risks),
    grade: gradeFromScore(score),
    score,
    summary: failReasons.length === 0 ? '渠道提审检测通过' : '渠道提审检测不通过',
    ...common,
    detectionItems,
    scoreBreakdown: scoreResult.breakdown,
    risks,
    channelChecks,
    failReasons
  }
  const developerMessage = buildDeveloperMessage(base)
  const operationMessage = buildOperationMessage(base)
  const markdownReport = buildMarkdownReport({ ...base, developerMessage, operationMessage })
  const fullReportText = markdownReport
  const htmlReport = buildHtmlReport({ ...base, developerMessage, operationMessage, markdownReport, fullReportText })
  return { ...base, developerMessage, operationMessage, markdownReport, fullReportText, htmlReport }
}

module.exports = { analyzeApk, getEngineHealth }
