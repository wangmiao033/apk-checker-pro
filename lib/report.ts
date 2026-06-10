import type { AnalyzeResult } from './types'

type BaseResult = Omit<AnalyzeResult, 'developerMessage' | 'operationMessage' | 'htmlReport'>

export function buildDeveloperMessage(result: BaseResult): string {
  if (result.failReasons.length === 0) {
    return [
      '当前 APK 渠道提交前检测通过。',
      '',
      `包名：${result.apkInfo.packageName || '-'}`,
      `版本：${result.apkInfo.versionName || '-'} / ${result.apkInfo.versionCode || '-'}`,
      `targetSdkVersion：${result.apkInfo.targetSdkVersion ?? '-'}`,
      '',
      '检测结论：',
      '1. 已检测到 lib/arm64-v8a/，满足 64 位包体要求；',
      '2. targetSdkVersion 达标；',
      '3. 未发现阻断型提交问题。',
      '',
      '请在渠道后台提交前再次核对渠道专属规则。'
    ].join('\n')
  }

  const reasons = result.failReasons.map((item, index) => `${index + 1}. ${item}`).join('\n')
  const riskFixes = result.risks
    .filter(r => r.fix)
    .map((r, index) => `${index + 1}. ${r.fix}`)
    .join('\n')

  return [
    '当前 APK 不符合渠道提交前要求，请研发重新出包或修复后再提交渠道。',
    '',
    '阻断 / 重点问题：',
    reasons,
    '',
    '整改要求：',
    riskFixes || [
      '1. APK 必须包含 lib/arm64-v8a/；',
      '2. targetSdkVersion 必须达到渠道要求；',
      '3. 不得保留明显 Debug / 测试配置；',
      '4. 正式包需确认签名、权限、HTTP 明文地址等风险。'
    ].join('\n'),
    '',
    '处理完成后，请重新上传本检测平台复测，检测通过后再提交渠道后台。'
  ].join('\n')
}

export function buildOperationMessage(result: BaseResult): string {
  if (result.failReasons.length === 0) {
    return `APK 提交前检测通过：包体支持 64 位，targetSdkVersion 达标，未发现阻断型问题。可以进入渠道提交流程。`
  }

  return [
    'APK 提交前检测不通过，暂不建议提交渠道。',
    `评分：${result.score} / 100，等级：${result.grade}`,
    `主要问题：${result.failReasons.join('；')}`,
    '已生成研发整改说明，请研发修复后重新出包。'
  ].join('\n')
}

function esc(input: unknown) {
  return String(input ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s] as string))
}

export function buildHtmlReport(result: Omit<AnalyzeResult, 'htmlReport'>): string {
  const riskHtml = result.risks.length
    ? result.risks.map(r => `<tr><td>${esc(r.level)}</td><td>${esc(r.title)}</td><td>${esc(r.detail)}</td><td>${esc(r.fix || '-')}</td></tr>`).join('')
    : '<tr><td colspan="4">未发现明显风险</td></tr>'

  const channelHtml = result.channelChecks.map(c => `<tr><td>${esc(c.name)}</td><td>${c.passed ? '通过' : '不通过'}</td><td>${c.score}</td><td>${esc(c.messages.join('；'))}</td></tr>`).join('')

  const abiHtml = Object.entries(result.abiInfo).map(([abi, exists]) => `<tr><td>${esc(abi)}</td><td>${abi.includes('64') ? '64 位' : '32 位'}</td><td>${exists ? '存在' : '不存在'}</td></tr>`).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>APK 渠道提交前报告</title>
<style>
body{margin:0;background:#f6f8fb;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
.header{background:#07111f;color:#fff;padding:36px 44px}
.container{max-width:1100px;margin:0 auto;padding:32px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:24px;margin:18px 0;box-shadow:0 12px 36px rgba(15,23,42,.06)}
.score{font-size:52px;font-weight:800}
.pass{color:#059669}.fail{color:#dc2626}.muted{color:#64748b}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #e5e7eb;padding:12px;text-align:left;font-size:14px;vertical-align:top}
th{background:#f8fafc;color:#475569}
pre{white-space:pre-wrap;background:#f8fafc;border-radius:14px;padding:16px;line-height:1.7}
</style>
</head>
<body>
<div class="header"><h1>APK 渠道提交前报告</h1><p>${esc(result.generatedAt)}</p></div>
<div class="container">
<div class="card"><div class="score ${result.status === 'passed' ? 'pass' : 'fail'}">${result.score}</div><h2>${esc(result.summary)} / 等级 ${esc(result.grade)}</h2></div>
<div class="card"><h2>APK 基础信息</h2><p>文件：${esc(result.apkInfo.fileName)}（${esc(result.apkInfo.fileSize)}）</p><p>包名：${esc(result.apkInfo.packageName)}</p><p>版本：${esc(result.apkInfo.versionName)} / ${esc(result.apkInfo.versionCode)}</p><p>minSdkVersion：${esc(result.apkInfo.minSdkVersion)}，targetSdkVersion：${esc(result.apkInfo.targetSdkVersion)}</p></div>
<div class="card"><h2>CPU 架构</h2><table><tr><th>ABI</th><th>类型</th><th>结果</th></tr>${abiHtml}</table></div>
<div class="card"><h2>渠道规则</h2><table><tr><th>渠道</th><th>结果</th><th>分数</th><th>说明</th></tr>${channelHtml}</table></div>
<div class="card"><h2>风险项</h2><table><tr><th>级别</th><th>问题</th><th>说明</th><th>整改</th></tr>${riskHtml}</table></div>
<div class="card"><h2>研发整改说明</h2><pre>${esc(result.developerMessage)}</pre></div>
<div class="card"><h2>运营话术</h2><pre>${esc(result.operationMessage)}</pre></div>
</div>
</body>
</html>`
}
