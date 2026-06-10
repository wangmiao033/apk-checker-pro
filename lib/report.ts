import type { AnalyzeResult } from './types'

type BaseResult = Omit<AnalyzeResult, 'developerMessage' | 'operationMessage' | 'htmlReport'>

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '未解析'
  return String(value)
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

  if (result.status === 'passed') {
    return [
      '当前 APK 渠道提审检测通过。',
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
  const riskFixes = result.risks
    .filter(r => r.fix)
    .map((r, index) => `${index + 1}. ${r.fix}`)
    .join('\n')

  return [
    '该 APK 不符合渠道提审要求，请研发修复后重新出包。',
    '',
    '失败原因：',
    reasons,
    '',
    '整改说明：',
    riskFixes || '1. 请重新输出 64 位包体，并确保 targetSdkVersion >= 30。',
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
  return `APK 提交前检测不通过，暂不建议提交渠道。主要问题：${result.failReasons.join('；')}`
}

function esc(input: unknown) {
  return String(input ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s] as string))
}

export function buildHtmlReport(result: Omit<AnalyzeResult, 'htmlReport'>): string {
  const scoreText = result.score === null ? '评分不可用' : `${result.score} / 100`
  const gradeText = result.grade === null ? '不可用' : result.grade
  const statusText = result.status === 'passed' ? '通过' : result.status === 'failed' ? '不通过' : '解析失败'
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
<div class="card"><div class="score">${esc(scoreText)}</div><h2>${esc(statusText)} / 等级 ${esc(gradeText)}</h2><p>${esc(result.summary)}</p></div>
<div class="card"><h2>报告信息</h2><p>报告编号：${esc(result.reportMeta.reportId)}</p><p>检测规则版本：${esc(result.reportMeta.ruleVersion)}</p><p>当前检测模式：${esc(result.reportMeta.detectionMode)}</p></div>
<div class="card"><h2>APK 基础信息</h2><p>文件：${esc(result.apkInfo.fileName)}，${esc(result.apkInfo.fileSize)}</p><p>包名：${esc(display(result.apkInfo.packageName))}</p><p>版本：${esc(display(result.apkInfo.versionName))} / ${esc(display(result.apkInfo.versionCode))}</p><p>minSdkVersion：${esc(display(result.apkInfo.minSdkVersion))}，targetSdkVersion：${esc(display(result.apkInfo.targetSdkVersion))}</p></div>
<div class="card"><h2>APK Hash</h2><p>MD5：${esc(result.apkHash.md5)}</p><p>SHA1：${esc(result.apkHash.sha1)}</p><p>SHA256：${esc(result.apkHash.sha256)}</p></div>
<div class="card"><h2>检测日志</h2><table><tr><th>项目</th><th>状态</th><th>说明</th></tr>${logHtml}</table></div>
<div class="card"><h2>CPU 架构</h2><table><tr><th>ABI</th><th>类型</th><th>结果</th></tr>${abiHtml}</table></div>
<div class="card"><h2>渠道规则</h2><table><tr><th>渠道</th><th>结论</th><th>分数</th><th>说明</th></tr>${channelHtml}</table></div>
<div class="card"><h2>风险项</h2><table><tr><th>级别</th><th>问题</th><th>说明</th><th>整改</th></tr>${riskHtml}</table></div>
<div class="card"><h2>研发整改说明</h2><pre>${esc(result.developerMessage)}</pre></div>
<div class="card"><h2>运营同步话术</h2><pre>${esc(result.operationMessage)}</pre></div>
</div>
</body>
</html>`
}
