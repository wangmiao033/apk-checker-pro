import type { AnalyzeResult } from './types'

type BaseResult = Omit<AnalyzeResult, 'developerMessage' | 'operationMessage' | 'htmlReport' | 'markdownReport' | 'fullReportText'>

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '未解析'
  return String(value)
}

function abiList(result: BaseResult) {
  const found = Object.entries(result.abiInfo).filter(([, exists]) => exists === true).map(([abi]) => abi)
  if (Object.values(result.abiInfo).some(value => value === null)) return 'ABI 扫描失败'
  return found.length ? found.join('、') : '未检测到 lib/ ABI 目录'
}

function permissionList(result: BaseResult) {
  const permissionCheck = result.privacyChecks.find(item => item.key === 'permissions')
  return permissionCheck?.findings.map(item => item.label).join('、') || '未命中重点权限'
}

function collectionList(result: BaseResult) {
  const collectionCheck = result.privacyChecks.find(item => item.key === 'preConsentCollection')
  return collectionCheck?.findings.map(item => item.label).join('、') || '未命中设备标识采集关键词'
}

function actionableItems(result: BaseResult) {
  return (result.detectionItems || []).filter(item => item.status === 'fail' || item.status === 'warning')
}

function statusText(status: string) {
  if (status === 'fail') return '不通过'
  if (status === 'warning') return '一般风险'
  if (status === 'pass') return '通过'
  if (status === 'parse_failed') return '解析失败'
  if (status === 'unsupported') return '当前工具不支持检测'
  if (status === 'error') return '系统错误'
  return '无法确认'
}

function itemMarkdown(item: NonNullable<BaseResult['detectionItems']>[number], index?: number) {
  const prefix = typeof index === 'number' ? `${index}. ` : ''
  return [
    `${prefix}**${item.title}**`,
    `   - 状态：${statusText(item.status)}`,
    `   - 当前检测值：${item.currentValue}`,
    `   - 规则要求：${item.expectedValue}`,
    `   - 证据：${item.evidence}`,
    `   - 风险说明：${item.risk}`,
    `   - 研发整改建议：${item.devInstruction || item.suggestion}`
  ].join('\n')
}

function scoreMarkdown(result: BaseResult) {
  if (!result.scoreBreakdown?.length) return '暂无评分明细。'
  return result.scoreBreakdown
    .filter(item => item.includedInScore || item.status === 'unknown' || item.status === 'unsupported')
    .map(item => item.includedInScore
      ? `- ${item.title}：-${item.deduction}（${item.reason}）`
      : `- ${item.title}：未纳入评分（${item.reason}）`)
    .join('\n') || '未发现扣分项。'
}

function sectionItems(result: BaseResult, category: string) {
  return (result.detectionItems || []).filter(item => item.category === category)
}

function sectionMarkdown(result: BaseResult, title: string, categories: string[]) {
  const items = (result.detectionItems || []).filter(item => categories.includes(item.category))
  return [
    `## ${title}`,
    '',
    items.length ? items.map(item => itemMarkdown(item)).join('\n\n') : '暂无检测项。'
  ].join('\n')
}

export function buildDeveloperMessage(result: BaseResult): string {
  if (result.status === 'parse_error') {
    return [
      'APK 解析失败，当前环境无法完整解析该 APK。',
      '',
      '请研发或运维优先确认检测后端环境，而不是直接按渠道不通过处理。',
      '',
      '解析失败原因：',
      ...result.failReasons.map(item => `- ${item}`),
      '',
      '整改建议：',
      '- 将检测后端部署到支持 unzip / aapt / apksigner / strings 的服务器；',
      '- 确认 Android SDK Build Tools 已加入 PATH；',
      '- 确认上传的文件是完整 APK，且 Zip 结构未损坏；',
      '- 环境修复后重新上传检测。'
    ].join('\n')
  }

  const items = actionableItems(result)
  if (result.detectionItems?.length) {
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

  if (result.status === 'passed') {
    return [
      `当前 APK 检测结论：${result.submissionConclusion.title}。`,
      '',
      `包名：${display(result.apkInfo.packageName)}`,
      `版本：${display(result.apkInfo.versionName)} / ${display(result.apkInfo.versionCode)}`,
      `targetSdkVersion：${display(result.apkInfo.targetSdkVersion)}`,
      '',
      '检测结论：',
      '1. 已检测到 lib/arm64-v8a/，满足 64 位包体要求；',
      '2. targetSdkVersion 达标或未发现阻断性 targetSdk 问题；',
      '3. 未发现阻断型提交问题。',
      '',
      '请在渠道后台提交前再核对渠道专属规则。'
    ].join('\n')
  }

  const reasons = result.failReasons.map((item, index) => `${index + 1}. ${item}`).join('\n')
  const hardCheckFixes = result.hardChecks
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
  const privacyFixes = result.privacyChecks
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

export function buildOperationMessage(result: BaseResult): string {
  if (result.status === 'parse_error') {
    return `APK 解析失败，当前环境无法完整解析该 APK。评分不可用，渠道结论不可用。原因：${result.failReasons.join('；')}`
  }
  if (result.status === 'passed') {
    return 'APK 提交前检测通过：包体支持 64 位，未发现阻断型渠道提审问题。'
  }
  const items = actionableItems(result)
  if (items.length) {
    const failTitles = items.filter(item => item.status === 'fail').map(item => item.title)
    const warningTitles = items.filter(item => item.status === 'warning').map(item => item.title)
    return `当前 APK 检测结果为${result.submissionConclusion.title}，主要原因是 ${failTitles.concat(warningTitles).slice(0, 4).join('、')}。建议先交由研发处理上述问题，重新打包并通过 APKFlow 复测后再提交渠道。`
  }
  const blockers = result.hardChecks.filter(item => item.status === 'blocker').map(item => item.title)
  const warnings = result.hardChecks.filter(item => item.status === 'warning' || item.status === 'unknown').map(item => item.title)
  return `该 APK 当前存在上架风险，${result.submissionConclusion.status === 'blocked' ? '需要重新出包' : '暂不建议直接提交'}。主要原因是 ${blockers.join('；') || result.failReasons.join('；') || '存在隐私合规高风险项'}。需要研发重新打包，并确认首次启动隐私授权、SDK 初始化时机、权限申请和第三方 SDK 披露情况。${warnings.length ? `需关注：${warnings.join('；')}。` : ''}`
}

export function buildMarkdownReport(result: Omit<AnalyzeResult, 'htmlReport' | 'markdownReport' | 'fullReportText'>): string {
  if (result.detectionItems?.length) {
    return [
      '# APKFlow 渠道上架前 APK 风险检测报告',
      '',
      '## 检测结论',
      '',
      `- 总体结论：${result.submissionConclusion.title}`,
      `- 结论说明：${result.submissionConclusion.summary}`,
      `- APKFlow Score：${result.score === null ? '不可用' : `${result.score}/100`}`,
      `- 报告编号：${result.reportMeta.reportId}`,
      `- 检测时间：${result.reportMeta.detectedAt}`,
      `- 检测模式：${result.reportMeta.detectionMode}`,
      `- 当前使用的渠道规则：${result.currentChannelRules?.map(rule => `${rule.name}(targetSdk>=${rule.targetSdkMin})`).join('、') || '未记录'}`,
      '',
      '## 评分明细',
      '',
      scoreMarkdown(result),
      '',
      sectionMarkdown(result, 'APK 基础信息', ['basic']),
      '',
      sectionMarkdown(result, '渠道提审关键项', ['target_sdk', 'abi', 'debug', 'http', 'signature']),
      '',
      sectionMarkdown(result, 'ABI / 64 位兼容性', ['abi']),
      '',
      sectionMarkdown(result, 'targetSdkVersion 与安卓版本适配', ['target_sdk']),
      '',
      sectionMarkdown(result, '权限与隐私风险', ['permissions']),
      '',
      sectionMarkdown(result, 'Debug / 测试包风险', ['debug']),
      '',
      sectionMarkdown(result, 'HTTP 明文与网络安全', ['http']),
      '',
      sectionMarkdown(result, '签名信息', ['signature']),
      '',
      sectionMarkdown(result, '图标与资源', ['icon']),
      '',
      sectionMarkdown(result, '包体大小分析', ['size']),
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

export function buildFullReportText(result: Omit<AnalyzeResult, 'htmlReport' | 'fullReportText'>): string {
  return buildMarkdownReport(result)
}

function esc(input: unknown) {
  return String(input ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s] as string))
}

export function buildHtmlReport(result: Omit<AnalyzeResult, 'htmlReport'>): string {
  if (result.detectionItems?.length) {
    const itemRows = result.detectionItems.map(item => `<tr><td>${esc(statusText(item.status))}</td><td>${esc(item.severity)}</td><td>${esc(item.category)}</td><td>${esc(item.title)}</td><td>${esc(item.currentValue)}</td><td>${esc(item.expectedValue)}</td><td>${esc(item.risk)}</td><td>${esc(item.devInstruction || item.suggestion)}</td></tr>`).join('')
    const scoreRows = (result.scoreBreakdown || []).map(item => `<tr><td>${esc(item.title)}</td><td>${esc(statusText(item.status))}</td><td>${item.includedInScore ? `-${item.deduction}` : '未纳入评分'}</td><td>${esc(item.reason)}</td></tr>`).join('')
    const topFiles = result.sizeAnalysis?.topFiles.map(file => `<tr><td>${esc(file.path)}</td><td>${esc(file.size)}</td></tr>`).join('') || ''

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>APKFlow 检测报告</title>
<style>
body{margin:0;background:#f6f7f9;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
.header{background:#fff;border-bottom:1px solid #e5e7eb;padding:28px 40px}
.container{max-width:1180px;margin:0 auto;padding:28px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.score{font-size:36px;font-weight:800}.muted{color:#64748b}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top;white-space:pre-wrap}
th{background:#f8fafc;color:#475569}pre{white-space:pre-wrap;background:#f8fafc;border-radius:10px;padding:14px;line-height:1.7}
</style>
</head>
<body>
<div class="header"><h1>APKFlow 检测报告</h1><p class="muted">${esc(result.reportMeta.detectedAt)} · ${esc(result.reportMeta.reportId)}</p></div>
<div class="container">
<div class="card"><div class="score">${esc(result.score === null ? '不可用' : `${result.score}/100`)}</div><h2>${esc(result.submissionConclusion.title)}</h2><p>${esc(result.submissionConclusion.summary)}</p></div>
<div class="card"><h2>APK 基础信息</h2><p>文件：${esc(result.apkInfo.fileName)}，${esc(result.apkInfo.fileSize)}</p><p>应用名：${esc(display(result.apkInfo.appLabel || result.apkInfo.appName))}</p><p>包名：${esc(display(result.apkInfo.packageName))}</p><p>版本：${esc(display(result.apkInfo.versionName))} / ${esc(display(result.apkInfo.versionCode))}</p><p>minSdkVersion：${esc(display(result.apkInfo.minSdkVersion))}，targetSdkVersion：${esc(display(result.apkInfo.targetSdkVersion))}，compileSdkVersion：${esc(display(result.apkInfo.compileSdkVersion))}</p><p>SHA256：${esc(result.apkHash.sha256)}</p></div>
<div class="card"><h2>当前使用的渠道规则</h2><pre>${esc(JSON.stringify(result.currentChannelRules || [], null, 2))}</pre></div>
<div class="card"><h2>评分明细</h2><table><tr><th>检测项</th><th>状态</th><th>扣分</th><th>原因</th></tr>${scoreRows}</table></div>
<div class="card"><h2>分段检测项</h2><table><tr><th>状态</th><th>等级</th><th>模块</th><th>问题</th><th>当前检测值</th><th>规则要求</th><th>风险</th><th>整改建议</th></tr>${itemRows}</table></div>
<div class="card"><h2>包体 Top 文件</h2><table><tr><th>文件</th><th>大小</th></tr>${topFiles}</table></div>
<div class="card"><h2>研发整改说明</h2><pre>${esc(result.developerMessage)}</pre></div>
<div class="card"><h2>运营同步话术</h2><pre>${esc(result.operationMessage)}</pre></div>
</div>
</body>
</html>`
  }

  const scoreText = result.score === null ? '评分不可用' : `${result.score} / 100`
  const gradeText = result.grade === null ? '不可用' : result.grade
  const legacyStatusText = result.status === 'passed' ? '通过' : result.status === 'failed' ? '不通过' : '解析失败'
  const riskHtml = result.risks.length
    ? result.risks.map(r => `<tr><td>${esc(r.level)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td><td>${esc(r.fix || '-')}</td></tr>`).join('')
    : '<tr><td colspan="4">未发现明显风险</td></tr>'
  const channelHtml = result.channelChecks.map(c => {
    const state = c.passed === null ? '不可用' : c.passed ? '通过' : '不通过'
    const score = c.score === null ? '不可用' : c.score
    return `<tr><td>${esc(c.name)}</td><td>${state}</td><td>${score}</td><td>${esc(c.messages.join('；'))}</td></tr>`
  }).join('')
  const abiHtml = Object.entries(result.abiInfo).map(([abi, exists]) => {
    const state = exists === null ? 'ABI 扫描失败' : exists ? '存在' : '不存在'
    return `<tr><td>${esc(abi)}</td><td>${abi.includes('64') ? '64 位' : '32 位'}</td><td>${state}</td></tr>`
  }).join('')
  const logHtml = result.detectionLogs.map(log => `<tr><td>${esc(log.label)}</td><td>${log.status === 'success' ? '成功' : log.status === 'failed' ? '失败' : '跳过'}</td><td>${esc(log.message)}</td></tr>`).join('')
  const hardCheckHtml = result.hardChecks.map(item => `<tr><td>${esc(item.status)}</td><td>${esc(item.title)}</td><td>${esc(item.currentValue)}</td><td>${esc(item.expectedValue)}</td><td>${esc(item.description)}</td><td>${esc(item.suggestion)}</td></tr>`).join('')
  const privacyHtml = result.privacyChecks.map(item => `<tr><td>${esc(item.status)}</td><td>${esc(item.title)}</td><td>${esc(item.level)}</td><td>${esc(item.description)}</td><td>${esc(item.findings.map(f => f.label).join('；') || '未命中')}</td><td>${esc(item.suggestion)}</td></tr>`).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>APKFlow 检测报告</title>
<style>
body{margin:0;background:#f6f8fb;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
.header{background:#07111f;color:#fff;padding:36px 44px}
.container{max-width:1100px;margin:0 auto;padding:32px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:24px;margin:18px 0;box-shadow:0 12px 36px rgba(15,23,42,.06)}
.score{font-size:42px;font-weight:800}.muted{color:#64748b}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e5e7eb;padding:12px;text-align:left;font-size:14px;vertical-align:top}
th{background:#f8fafc;color:#475569}pre{white-space:pre-wrap;background:#f8fafc;border-radius:14px;padding:16px;line-height:1.7}
</style>
</head>
<body>
<div class="header"><h1>APKFlow 检测报告</h1><p>${esc(result.reportMeta.detectedAt)}</p></div>
<div class="container">
<div class="card"><div class="score">${esc(scoreText)}</div><h2>${esc(result.submissionConclusion.title)} / 等级 ${esc(gradeText)}</h2><p>${esc(result.submissionConclusion.summary)}</p></div>
<div class="card"><h2>报告信息</h2><p>报告编号：${esc(result.reportMeta.reportId)}</p><p>检测规则版本：${esc(result.reportMeta.ruleVersion)}</p><p>当前检测模式：${esc(result.reportMeta.detectionMode)}</p></div>
<div class="card"><h2>APK 基础信息</h2><p>文件：${esc(result.apkInfo.fileName)}，${esc(result.apkInfo.fileSize)}</p><p>应用名：${esc(display(result.apkInfo.appName))}</p><p>包名：${esc(display(result.apkInfo.packageName))}</p><p>版本：${esc(display(result.apkInfo.versionName))} / ${esc(display(result.apkInfo.versionCode))}</p><p>minSdkVersion：${esc(display(result.apkInfo.minSdkVersion))}，targetSdkVersion：${esc(display(result.apkInfo.targetSdkVersion))}</p></div>
<div class="card"><h2>APK Hash</h2><p>MD5：${esc(result.apkHash.md5)}</p><p>SHA1：${esc(result.apkHash.sha1)}</p><p>SHA256：${esc(result.apkHash.sha256)}</p></div>
<div class="card"><h2>检测日志</h2><table><tr><th>项目</th><th>状态</th><th>说明</th></tr>${logHtml}</table></div>
<div class="card"><h2>CPU 架构</h2><table><tr><th>ABI</th><th>类型</th><th>结果</th></tr>${abiHtml}</table></div>
<div class="card"><h2>硬性检测项</h2><table><tr><th>状态</th><th>标题</th><th>当前值</th><th>要求值</th><th>说明</th><th>整改建议</th></tr>${hardCheckHtml}</table></div>
<div class="card"><h2>隐私合规风险</h2><table><tr><th>状态</th><th>检测项</th><th>等级</th><th>说明</th><th>命中项</th><th>整改建议</th></tr>${privacyHtml}</table></div>
<div class="card"><h2>渠道规则</h2><table><tr><th>渠道</th><th>结论</th><th>分数</th><th>说明</th></tr>${channelHtml}</table></div>
<div class="card"><h2>风险项</h2><table><tr><th>级别</th><th>问题</th><th>说明</th><th>整改</th></tr>${riskHtml}</table></div>
<div class="card"><h2>研发整改说明</h2><pre>${esc(result.developerMessage)}</pre></div>
<div class="card"><h2>运营同步话术</h2><pre>${esc(result.operationMessage)}</pre></div>
</div>
</body>
</html>`
}
