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

function summaryRows(result: BaseResult) {
  if (result.reviewSummary?.length) return result.reviewSummary
  const items = result.detectionItems || []
  const rows = [
    { key: 'fail', label: '严重问题', count: items.filter(item => item.status === 'fail').length, ratio: 0 },
    { key: 'warning', label: '一般风险', count: items.filter(item => item.status === 'warning').length, ratio: 0 },
    { key: 'pass', label: '通过项', count: items.filter(item => item.status === 'pass').length, ratio: 0 },
    { key: 'parse_failed', label: '解析失败', count: items.filter(item => item.status === 'parse_failed').length, ratio: 0 },
    { key: 'unknown', label: '无法确认', count: items.filter(item => !['fail', 'warning', 'pass', 'parse_failed'].includes(item.status)).length, ratio: 0 }
  ]
  const total = Math.max(items.length, 1)
  return rows.map(row => ({ ...row, ratio: Number(((row.count / total) * 100).toFixed(1)) }))
}

function summaryMarkdown(result: BaseResult) {
  const rows = summaryRows(result)
  return [
    '| 统计项 | ' + rows.map(row => row.label).join(' | ') + ' |',
    '| --- | ' + rows.map(() => '---:').join(' | ') + ' |',
    '| 数量 | ' + rows.map(row => String(row.count)).join(' | ') + ' |',
    '| 占比 | ' + rows.map(row => `${row.ratio}%`).join(' | ') + ' |'
  ].join('\n')
}

function coverageStatusText(status: string) {
  if (status === 'covered') return '已覆盖'
  if (status === 'partial') return '部分覆盖'
  return '人工复核'
}

function coverageMarkdown(result: BaseResult) {
  if (!result.coverageItems?.length) return '暂无覆盖范围说明。'
  return [
    '| 检测范围 | 状态 | 覆盖内容 | 判断边界 |',
    '| --- | --- | --- | --- |',
    ...result.coverageItems.map(item => `| ${item.label} | ${coverageStatusText(item.status)} | ${item.scope} | ${item.limitation} |`)
  ].join('\n')
}

function sdkMarkdown(result: BaseResult) {
  const findings = result.sdkFindings || []
  if (!findings.length) {
    return '未命中本轮广告、支付、推送、统计、OAID 重点 SDK 关键词。该结论仅代表静态识别结果，混淆或动态加载可能导致遗漏。'
  }
  return [
    '| 类型 | SDK | 命中证据 | 披露说明 | 建议 |',
    '| --- | --- | --- | --- | --- |',
    ...findings.map(item => `| ${item.categoryLabel} | ${item.name} | ${item.evidence.join('、')} | ${item.disclosureNote} | ${item.suggestion} |`)
  ].join('\n')
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
      '## 测试报告概述',
      '',
      summaryMarkdown(result),
      '',
      '## 检测覆盖范围说明',
      '',
      coverageMarkdown(result),
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
      '## SDK 静态识别',
      '',
      sdkMarkdown(result),
      '',
      sectionMarkdown(result, 'SDK 识别分段', ['sdk']),
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
    const summary = summaryRows(result)
    const summaryHead = summary.map(item => `<th>${esc(item.label)}</th>`).join('')
    const summaryCounts = summary.map(item => `<td>${esc(item.count)}</td>`).join('')
    const summaryRatios = summary.map(item => `<td>${esc(item.ratio)}%</td>`).join('')
    const coverageRows = (result.coverageItems || []).map(item => `<tr><td>${esc(item.label)}</td><td>${esc(coverageStatusText(item.status))}</td><td>${esc(item.scope)}</td><td>${esc(item.limitation)}</td></tr>`).join('')
    const sdkRows = (result.sdkFindings || []).length
      ? (result.sdkFindings || []).map(item => `<tr><td>${esc(item.categoryLabel)}</td><td>${esc(item.name)}</td><td>${esc(item.evidence.join('、'))}</td><td>${esc(item.disclosureNote)}</td><td>${esc(item.suggestion)}</td></tr>`).join('')
      : '<tr><td colspan="5">未命中本轮广告、支付、推送、统计、OAID 重点 SDK 关键词。该结论仅代表静态识别结果，混淆或动态加载可能导致遗漏。</td></tr>'
    const channelRuleRows = (result.currentChannelRules || []).map(rule => `<tr><td>${esc(rule.name)}</td><td>${esc(rule.targetSdkMin)}</td><td>${rule.requireArm64 ? '是' : '否'}</td><td>${rule.allowDebuggable ? '允许' : '不允许'}</td><td>${rule.allowCleartextTraffic ? '允许' : '不允许'}</td></tr>`).join('')

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>APKFlow 检测报告</title>
<style>
@page{size:A4;margin:16mm}
*{box-sizing:border-box}
body{margin:0;background:#e5e7eb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif;font-size:13px;line-height:1.6}
.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:18mm 16mm}
.report-head{border-bottom:2px solid #111827;padding-bottom:14px;margin-bottom:16px}
.eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700}
h1{margin:4px 0 8px;font-size:24px;line-height:1.25}
h2{margin:0;font-size:16px}
.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 18px;color:#475569}
.conclusion{border:1px solid #d1d5db;background:#f8fafc;padding:14px;margin:14px 0}
.conclusion-title{font-size:18px;font-weight:800;color:#111827}
.score{font-size:20px;font-weight:800}
.section{margin-top:18px;break-inside:avoid}
.section-title{background:#d9d9d9;color:#111827;font-size:15px;font-weight:800;padding:7px 10px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #d6d9de;padding:7px 8px;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word}
th{background:#f3f4f6;font-weight:800;color:#111827}
.summary-table th,.summary-table td{text-align:center}
.summary-table th:first-child,.summary-table td:first-child{text-align:left;width:22%}
.muted{color:#64748b}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.box{border:1px solid #d6d9de;padding:10px;break-inside:avoid}
pre{margin:0;white-space:pre-wrap;font-family:inherit;line-height:1.7}
.footer{margin-top:22px;border-top:1px solid #111827;padding-top:8px;text-align:right;color:#475569;font-size:12px}
@media screen{.page{margin:24px auto;box-shadow:0 8px 28px rgba(15,23,42,.12)}}
@media print{body{background:#fff}.page{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}.section{page-break-inside:avoid}}
</style>
</head>
<body>
<div class="page">
<header class="report-head">
  <div class="eyebrow">APK CHANNEL PRECHECK</div>
  <h1>APKFlow 渠道上架前 APK 风险检测报告</h1>
  <div class="meta">
    <div>报告编号：${esc(result.reportMeta.reportId)}</div>
    <div>检测时间：${esc(result.reportMeta.detectedAt)}</div>
    <div>规则版本：${esc(result.reportMeta.ruleVersion)}</div>
    <div>检测模式：${esc(result.reportMeta.detectionMode)}</div>
  </div>
</header>

<section class="conclusion">
  <div class="conclusion-title">检测结论：${esc(result.submissionConclusion.title)}</div>
  <p>${esc(result.submissionConclusion.summary)}</p>
  <div class="score">辅助评分：${esc(result.score === null ? '不可用' : `${result.score}/100`)}</div>
  <p class="muted">说明：辅助评分仅用于内部参考，不替代渠道审核结论。</p>
</section>

<section class="section">
  <div class="section-title">测试报告概述</div>
  <table class="summary-table"><tr><th>统计项</th>${summaryHead}</tr><tr><td>数量</td>${summaryCounts}</tr><tr><td>占比</td>${summaryRatios}</tr></table>
</section>

<section class="section">
  <div class="section-title">APK 基础信息</div>
  <table>
    <tr><th>文件名</th><td>${esc(result.apkInfo.fileName)}</td><th>文件大小</th><td>${esc(result.apkInfo.fileSize)}</td></tr>
    <tr><th>应用名</th><td>${esc(display(result.apkInfo.appLabel || result.apkInfo.appName))}</td><th>包名</th><td>${esc(display(result.apkInfo.packageName))}</td></tr>
    <tr><th>版本号</th><td>${esc(display(result.apkInfo.versionName))} / ${esc(display(result.apkInfo.versionCode))}</td><th>targetSdkVersion</th><td>${esc(display(result.apkInfo.targetSdkVersion))}</td></tr>
    <tr><th>minSdkVersion</th><td>${esc(display(result.apkInfo.minSdkVersion))}</td><th>compileSdkVersion</th><td>${esc(display(result.apkInfo.compileSdkVersion))}</td></tr>
    <tr><th>SHA256</th><td colspan="3">${esc(result.apkHash.sha256)}</td></tr>
  </table>
</section>

<section class="section">
  <div class="section-title">当前使用的渠道规则</div>
  <table><tr><th>渠道</th><th>targetSdk 要求</th><th>要求 64 位</th><th>Debug</th><th>HTTP 明文</th></tr>${channelRuleRows || '<tr><td colspan="5">未记录</td></tr>'}</table>
</section>

<section class="section">
  <div class="section-title">检测覆盖范围说明</div>
  <table><tr><th>检测范围</th><th>状态</th><th>覆盖内容</th><th>判断边界</th></tr>${coverageRows || '<tr><td colspan="4">暂无覆盖范围说明</td></tr>'}</table>
</section>

<section class="section">
  <div class="section-title">SDK 静态识别</div>
  <table><tr><th>类型</th><th>SDK</th><th>命中证据</th><th>披露说明</th><th>建议</th></tr>${sdkRows}</table>
</section>

<section class="section">
  <div class="section-title">评分明细</div>
  <table><tr><th>检测项</th><th>状态</th><th>扣分</th><th>原因</th></tr>${scoreRows || '<tr><td colspan="4">暂无评分明细</td></tr>'}</table>
</section>

<section class="section">
  <div class="section-title">分段检测详情</div>
  <table><tr><th>状态</th><th>等级</th><th>模块</th><th>问题</th><th>当前检测值</th><th>规则要求</th><th>风险</th><th>整改建议</th></tr>${itemRows}</table>
</section>

<section class="section">
  <div class="section-title">包体 Top 文件</div>
  <table><tr><th>文件</th><th>大小</th></tr>${topFiles || '<tr><td colspan="2">暂无包体文件统计</td></tr>'}</table>
</section>

<section class="section two-col">
  <div class="box"><h2>研发整改说明</h2><pre>${esc(result.developerMessage)}</pre></div>
  <div class="box"><h2>运营同步话术</h2><pre>${esc(result.operationMessage)}</pre></div>
</section>

<div class="footer">APKFlow 渠道提审检测平台 · 静态检测报告</div>
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
