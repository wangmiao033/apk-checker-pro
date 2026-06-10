'use client'

import { useState } from 'react'
import { CopyButton } from './CopyButton'
import { MetricCard } from './MetricCard'

type IssueStatus = 'fail' | 'risk' | 'pass' | 'parse_error' | 'info'
type IssueFilter = 'all' | 'fail' | 'risk' | 'pass' | 'parse_error'

type ReportIssue = {
  id: string
  status: IssueStatus
  title: string
  currentValue: string
  expectedValue: string
  impact: string
  suggestion: string
  operationNote?: string
}

type IssueGroup = {
  id: string
  title: string
  description: string
  issues: ReportIssue[]
  defaultOpen: boolean
}

function downloadText(filename: string, content: string, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '未解析'
  return String(value)
}

function safeName(value: unknown) {
  return display(value).replace(/[^\w\u4e00-\u9fa5.-]+/g, '_')
}

function exportFileName(result: any, ext: 'html' | 'md' | 'json') {
  const pkg = safeName(result.apkInfo?.packageName || 'unknown_package')
  const version = safeName(result.apkInfo?.versionName || result.apkInfo?.versionCode || 'unknown_version')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `APKFlow_${pkg}_${version}_${date}.${ext}`
}

function statusLabel(status: IssueStatus) {
  if (status === 'fail') return '不通过'
  if (status === 'risk') return '风险'
  if (status === 'parse_error') return '解析失败'
  if (status === 'pass') return '通过'
  return '信息'
}

function statusClass(status: IssueStatus) {
  if (status === 'fail') return 'status-fail'
  if (status === 'risk') return 'status-warn'
  if (status === 'parse_error') return 'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600'
  if (status === 'pass') return 'status-pass'
  return 'status-info'
}

function issueBorderClass(status: IssueStatus) {
  if (status === 'fail') return 'border-l-rose-500'
  if (status === 'risk') return 'border-l-amber-500'
  if (status === 'parse_error') return 'border-l-slate-400'
  if (status === 'pass') return 'border-l-emerald-500'
  return 'border-l-sky-500'
}

const issueFilters: Array<{ key: IssueFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'fail', label: '严重问题' },
  { key: 'risk', label: '一般风险' },
  { key: 'pass', label: '通过项' },
  { key: 'parse_error', label: '解析失败' }
]

function filterCount(issues: ReportIssue[], filter: IssueFilter) {
  if (filter === 'all') return issues.length
  return issues.filter(issue => issue.status === filter).length
}

function filterIssues(groups: IssueGroup[], filter: IssueFilter) {
  if (filter === 'all') return groups
  return groups
    .map(group => ({
      ...group,
      issues: group.issues.filter(issue => issue.status === filter)
    }))
    .filter(group => group.issues.length > 0)
}

function shouldOpenGroup(group: IssueGroup, filter: IssueFilter) {
  if (filter !== 'all') return true
  return group.issues.some(issue => issue.status === 'fail' || issue.status === 'risk' || issue.status === 'parse_error')
}

function issueStatusFromLevel(level?: string): IssueStatus {
  if (level === 'blocker' || level === 'high') return 'fail'
  if (level === 'medium') return 'risk'
  if (level === 'low' || level === 'info') return 'info'
  return 'pass'
}

function issueStatusFromHardStatus(status?: string): IssueStatus {
  if (status === 'blocker') return 'fail'
  if (status === 'warning') return 'risk'
  if (status === 'unknown') return 'parse_error'
  if (status === 'pass') return 'pass'
  return 'info'
}

function issueStatusFromPrivacy(item: any): IssueStatus {
  if (item.status === 'high_risk') return 'fail'
  if (item.status === 'warning') return 'risk'
  if (item.status === 'unknown') return 'parse_error'
  return issueStatusFromLevel(item.level) === 'info' ? 'pass' : issueStatusFromLevel(item.level)
}

function issueStatusFromStandard(status?: string): IssueStatus {
  if (status === 'fail') return 'fail'
  if (status === 'warning') return 'risk'
  if (status === 'pass') return 'pass'
  if (status === 'parse_failed' || status === 'unknown' || status === 'error') return 'parse_error'
  if (status === 'unsupported') return 'info'
  return 'info'
}

function issueCopyText(issue: ReportIssue) {
  return [
    `【问题】${issue.title}`,
    '',
    '【当前检测值】',
    issue.currentValue,
    '',
    '【渠道要求】',
    issue.expectedValue,
    '',
    '【影响】',
    issue.impact,
    '',
    '【研发整改建议】',
    issue.suggestion,
    issue.operationNote ? ['', '【运营备注】', issue.operationNote].join('\n') : ''
  ].filter(Boolean).join('\n')
}

function privacyExpected(key: string) {
  if (key === 'permissions') return '权限最小化，敏感权限需要业务必要性和隐私政策说明'
  if (key === 'privacyResources') return '首次启动应有清晰隐私弹窗，并提供同意与拒绝入口'
  if (key === 'preConsentCollection') return '用户同意隐私政策后再初始化 SDK 和采集个人信息'
  return '满足渠道隐私合规要求'
}

function findingsText(findings: any[]) {
  if (!findings?.length) return '未命中本项重点关键词'
  return findings.map(finding => finding.label || finding.key).join('；')
}

function summaryRows(result: any, issues: ReportIssue[]) {
  if (Array.isArray(result.reviewSummary) && result.reviewSummary.length > 0) return result.reviewSummary
  const rows = [
    { key: 'fail', label: '严重问题', count: issues.filter(issue => issue.status === 'fail').length, ratio: 0 },
    { key: 'warning', label: '一般风险', count: issues.filter(issue => issue.status === 'risk').length, ratio: 0 },
    { key: 'pass', label: '通过项', count: issues.filter(issue => issue.status === 'pass').length, ratio: 0 },
    { key: 'parse_failed', label: '解析失败', count: issues.filter(issue => issue.status === 'parse_error').length, ratio: 0 },
    { key: 'unknown', label: '无法确认', count: issues.filter(issue => issue.status === 'info').length, ratio: 0 }
  ]
  const total = Math.max(rows.reduce((sum, row) => sum + row.count, 0), 1)
  return rows.map(row => ({ ...row, ratio: Number(((row.count / total) * 100).toFixed(1)) }))
}

function coverageStatusLabel(status?: string) {
  if (status === 'covered') return '已覆盖'
  if (status === 'partial') return '部分覆盖'
  return '人工复核'
}

function coverageStatusClass(status?: string) {
  if (status === 'covered') return 'status-pass'
  if (status === 'partial') return 'status-warn'
  return 'status-info'
}

function ReviewSummaryTable({ result, issues }: { result: any; issues: ReportIssue[] }) {
  const rows = summaryRows(result, issues)
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-950">审核报告式摘要</h3>
        <p className="mt-1 text-xs text-slate-500">按当前静态检测分段统计数量和占比，便于运营归档。</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-white text-xs text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">统计项</th>
              {rows.map((row: any) => <th key={row.key} className="whitespace-nowrap px-4 py-3 text-center font-semibold">{row.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-900">
            <tr>
              <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500">数量</td>
              {rows.map((row: any) => <td key={row.key} className="px-4 py-3 text-center font-semibold">{row.count}</td>)}
            </tr>
            <tr>
              <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500">占比</td>
              {rows.map((row: any) => <td key={row.key} className="px-4 py-3 text-center text-slate-600">{row.ratio}%</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CoverageScope({ result }: { result: any }) {
  const items = Array.isArray(result.coverageItems) ? result.coverageItems : []
  if (!items.length) return null
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-950">检测覆盖范围说明</h3>
        <p className="mt-1 text-sm text-slate-500">说明本次静态检测覆盖内容和判断边界，避免把静态命中误读成最终审核结论。</p>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {items.map((item: any) => (
          <div key={item.key} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-950">{item.label}</h4>
              <span className={coverageStatusClass(item.status)}>{coverageStatusLabel(item.status)}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{item.scope}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{item.limitation}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function buildIssueGroups(result: any): IssueGroup[] {
  if (Array.isArray(result.detectionItems) && result.detectionItems.length > 0) {
    const groupDefs = [
      { id: 'basic', title: 'APK 基础信息', description: '包名、应用名、版本、Hash、Manifest 解析状态。', categories: ['basic'] },
      { id: 'key', title: '渠道提审关键项', description: '影响是否建议提审的核心阻断项。', categories: ['abi', 'target_sdk', 'debug', 'http', 'signature'] },
      { id: 'abi', title: 'ABI / 64 位检测', description: 'arm64-v8a、32/64 位兼容性和 so 文件分布。', categories: ['abi'] },
      { id: 'target', title: 'targetSdkVersion 与安卓版本适配', description: '渠道 targetSdkVersion 规则和 Android 12+ exported 适配。', categories: ['target_sdk'] },
      { id: 'privacy', title: '权限与隐私风险', description: '敏感权限、隐私政策披露和权限最小化建议。', categories: ['permissions'] },
      { id: 'debug', title: 'Debug / 测试包风险', description: 'debuggable、测试配置和正式包风险。', categories: ['debug'] },
      { id: 'http', title: 'HTTP 明文与网络安全', description: 'usesCleartextTraffic、networkSecurityConfig 和 http:// 地址。', categories: ['http'] },
      { id: 'sdk', title: 'SDK 识别', description: '广告、支付、推送、统计、OAID 静态识别和披露核对建议。', categories: ['sdk'] },
      { id: 'signature', title: '签名信息', description: '签名状态、签名方案、证书摘要和 Debug 签名。', categories: ['signature'] },
      { id: 'icon', title: '图标与资源', description: '应用名、图标、roundIcon、adaptive icon 和默认图标风险。', categories: ['icon'] },
      { id: 'size', title: '包体大小分析', description: 'assets、lib、dex、res 和 Top 大文件。', categories: ['size'] },
      { id: 'developer', title: '研发整改清单', description: '只聚合 fail / warning，适合直接转给研发。', categories: ['developer'] }
    ]

    const items = result.detectionItems.map((item: any): ReportIssue => ({
      id: item.id,
      status: issueStatusFromStandard(item.status),
      title: item.title,
      currentValue: display(item.currentValue),
      expectedValue: display(item.expectedValue),
      impact: display(item.risk || item.evidence),
      suggestion: display(item.devInstruction || item.suggestion),
      operationNote: item.evidence
    }))
    const developerItems = result.detectionItems.filter((item: any) => item.status === 'fail' || item.status === 'warning')
    const developerIssue: ReportIssue = {
      id: 'developer-fix-list',
      status: developerItems.some((item: any) => item.status === 'fail') ? 'fail' : developerItems.length ? 'risk' : 'pass',
      title: '研发整改清单',
      currentValue: developerItems.length ? `需处理 ${developerItems.length} 项 fail / warning` : '当前无 fail / warning 整改项',
      expectedValue: '研发完成整改、重新打包，并回到 APKFlow 复测',
      impact: '该段内容可以直接复制给研发，用于工单、飞书或企业微信沟通。',
      suggestion: display(result.developerMessage || result.summary)
    }

    return groupDefs
      .map(def => {
        const issues: ReportIssue[] = def.id === 'developer'
          ? [developerIssue]
          : items.filter((issue: ReportIssue) => {
            const source = result.detectionItems.find((item: any) => item.id === issue.id)
            return source && def.categories.includes(source.category)
          })
        return {
          id: def.id,
          title: def.title,
          description: def.description,
          issues,
          defaultOpen: issues.some(issue => issue.status === 'fail' || issue.status === 'risk' || issue.status === 'parse_error')
        }
      })
      .filter(group => group.issues.length > 0)
  }

  const parseError = result.status === 'parse_error'
  const apkInfo = result.apkInfo || {}
  const hardChecks = result.hardChecks || []
  const privacyChecks = result.privacyChecks || []
  const risks = result.risks || []
  const channelChecks = result.channelChecks || []

  const basicIssue: ReportIssue = {
    id: 'apk-basic-info',
    status: parseError || apkInfo.parseSuccess === false ? 'parse_error' : 'pass',
    title: parseError ? 'APK 基础信息解析失败' : 'APK 基础信息解析完成',
    currentValue: [
      `文件名：${display(apkInfo.fileName)}`,
      `文件大小：${display(apkInfo.fileSize)}`,
      `包名：${display(apkInfo.packageName)}`,
      `版本：${display(apkInfo.versionName)} / ${display(apkInfo.versionCode)}`,
      `targetSdkVersion：${display(apkInfo.targetSdkVersion)}`
    ].join('\n'),
    expectedValue: 'APK 可被 unzip / aapt 正常解析，基础包名、版本和 Manifest 信息可读取',
    impact: parseError
      ? '当前 APK 没有被完整解析，不能生成可靠的渠道通过或不通过结论。'
      : '基础信息已完成读取，可继续结合 ABI、targetSdkVersion、权限和渠道规则判断提审风险。',
    suggestion: parseError
      ? '请重新上传 APK，或检查文件是否完整、是否为有效 APK；必要时确认检测后端 unzip / aapt / apksigner / strings 是否可用。'
      : '提交渠道前请确认包名、版本号、应用名与本次提审版本一致。'
  }

  const abiIssues: ReportIssue[] = hardChecks
    .filter((item: any) => item.key === 'abiCompatibility')
    .map((item: any): ReportIssue => ({
      id: `hard-${item.key}`,
      status: issueStatusFromHardStatus(item.status),
      title: item.title,
      currentValue: display(item.currentValue),
      expectedValue: display(item.expectedValue),
      impact: item.description,
      suggestion: [item.suggestion, item.unityTip].filter(Boolean).join('\n')
    }))

  const targetIssues: ReportIssue[] = hardChecks
    .filter((item: any) => item.key === 'targetSdkVersion')
    .map((item: any): ReportIssue => ({
      id: `hard-${item.key}`,
      status: issueStatusFromHardStatus(item.status),
      title: item.title,
      currentValue: `当前 targetSdkVersion：${display(item.currentValue)}`,
      expectedValue: display(item.expectedValue),
      impact: item.description,
      suggestion: [item.suggestion, item.unityTip].filter(Boolean).join('\n')
    }))

  const privacyIssues: ReportIssue[] = privacyChecks.map((item: any): ReportIssue => ({
    id: `privacy-${item.key}`,
    status: issueStatusFromPrivacy(item),
    title: item.title,
    currentValue: findingsText(item.findings),
    expectedValue: privacyExpected(item.key),
    impact: item.description,
    suggestion: item.suggestion
  }))

  const privacyTitles = new Set(privacyChecks.map((item: any) => item.title))
  const securityRiskIssues: ReportIssue[] = risks
    .filter((risk: any) => !privacyTitles.has(risk.title))
    .filter((risk: any) => !/targetSdk|ABI|arm64|64 位|32 位|纯 32/.test(risk.title))
    .map((risk: any, index: number): ReportIssue => ({
      id: `security-risk-${index}`,
      status: issueStatusFromLevel(risk.level),
      title: risk.title,
      currentValue: display(risk.currentValue || risk.detail),
      expectedValue: display(risk.expectedValue || '满足渠道安全合规基础要求'),
      impact: risk.detail,
      suggestion: display(risk.fix || '请研发确认该风险是否存在，并按渠道安全合规要求完成整改。'),
      operationNote: risk.operationNote
    }))

  const securityTitles = new Set(securityRiskIssues.map((item: ReportIssue) => item.title))
  const securityPassIssues: ReportIssue[] = parseError ? [] : [
    result.checks?.hasHttp === false && !securityTitles.has('存在 HTTP 明文地址') ? {
      id: 'security-http-pass',
      status: 'pass' as const,
      title: 'HTTP 明文请求检测',
      currentValue: '未检测到 HTTP 明文地址',
      expectedValue: '正式环境接口、活动、公告和资源地址建议使用 HTTPS',
      impact: '未发现本项明显渠道安全风险。',
      suggestion: '继续保持正式包网络地址 HTTPS 化。'
    } : null,
    result.checks?.hasDebugRisk === false && !securityTitles.has('疑似 Debug / 测试配置残留') ? {
      id: 'security-debug-pass',
      status: 'pass' as const,
      title: 'Debug 状态检测',
      currentValue: '未检测到明显 Debug / 测试关键词',
      expectedValue: '正式提审包不应包含 Debug 开关、测试环境或调试配置',
      impact: '未发现本项明显渠道安全风险。',
      suggestion: '继续确认正式打包配置，避免测试环境和调试开关残留。'
    } : null,
    result.checks?.hasSignature === true && !securityTitles.has('签名检测失败') ? {
      id: 'security-signature-pass',
      status: 'pass' as const,
      title: '签名检测',
      currentValue: '已检测到签名信息',
      expectedValue: 'APK 使用正式签名并可被渠道正常校验',
      impact: '未发现本项明显渠道上传风险。',
      suggestion: '继续使用正式签名流程，提审前确认渠道包未被二次破坏。'
    } : null,
    result.checks?.hasAllowBackupRisk === false ? {
      id: 'security-backup-pass',
      status: 'pass' as const,
      title: 'allowBackup 风险检测',
      currentValue: '未检测到明显 allowBackup 风险',
      expectedValue: '正式包应避免暴露不必要的备份风险',
      impact: '未发现本项明显安全风险。',
      suggestion: '继续保持当前安全配置，并在发包前复核 Manifest。'
    } : null
  ].filter(Boolean) as ReportIssue[]

  const channelIssues: ReportIssue[] = channelChecks.map((channel: any): ReportIssue => ({
    id: `channel-${channel.id}`,
    status: channel.passed === null ? 'parse_error' : channel.passed ? 'pass' : 'fail',
    title: `${channel.name} 渠道规则适配`,
    currentValue: [
      `评分：${display(channel.score)}`,
      `说明：${channel.messages?.length ? channel.messages.join('；') : '未发现异常'}`
    ].join('\n'),
    expectedValue: '满足该渠道 targetSdkVersion、arm64-v8a、纯 32 位、HTTP 等提交前基础规则',
    impact: channel.passed === null
      ? 'APK 解析失败，当前不能生成可靠的渠道适配结论。'
      : channel.passed
        ? '当前规则下未发现该渠道阻断项。'
        : '该问题可能导致对应渠道审核不通过或被要求重新出包。',
    suggestion: channel.passed === null
      ? '请先解决解析失败问题，重新上传并复测。'
      : channel.passed
        ? '保持当前配置，提审前继续按渠道后台提示复核。'
        : '请按该渠道规则完成整改，重新打包后再次检测。'
  }))

  const developerIssue: ReportIssue = {
    id: 'developer-fix-list',
    status: parseError ? 'parse_error' : result.status === 'passed' ? 'pass' : 'risk',
    title: parseError ? '解析失败处理说明' : '研发整改清单',
    currentValue: parseError ? '当前报告不能作为渠道通过或不通过依据' : '已根据检测结果生成研发说明',
    expectedValue: parseError ? '重新上传或修复检测环境后再生成提审结论' : '研发完成整改、重新打包，并回到 APKFlow 复测',
    impact: '该段内容可以直接复制给研发，用于工单、飞书或企业微信沟通。',
    suggestion: display(result.developerMessage || result.summary)
  }

  const groups: IssueGroup[] = [
    {
      id: 'basic',
      title: 'APK 基础信息',
      description: '包名、版本、文件大小、Manifest 解析状态。',
      issues: [basicIssue],
      defaultOpen: parseError
    },
    {
      id: 'abi',
      title: 'ABI / 64 位检测',
      description: '检查 arm64-v8a、32/64 位兼容包和 ABI 扫描状态。',
      issues: abiIssues.length ? abiIssues : [{
        id: 'abi-empty',
        status: 'info',
        title: 'ABI 检测暂无独立条目',
        currentValue: '未返回 ABI 硬性检测项',
        expectedValue: '检测结果应包含 ABI 兼容性判断',
        impact: '请结合 APK 基础解析和检测日志人工确认。',
        suggestion: '重新检测或检查检测后端工具链状态。'
      }],
      defaultOpen: abiIssues.some(issue => issue.status === 'fail' || issue.status === 'parse_error')
    },
    {
      id: 'target',
      title: 'targetSdkVersion 检测',
      description: '检查 targetSdkVersion 是否满足渠道基础要求。',
      issues: targetIssues.length ? targetIssues : [{
        id: 'target-empty',
        status: 'info',
        title: 'targetSdkVersion 检测暂无独立条目',
        currentValue: '未返回 targetSdkVersion 硬性检测项',
        expectedValue: '检测结果应包含 targetSdkVersion 判断',
        impact: '请结合 APK 基础解析和检测日志人工确认。',
        suggestion: '重新检测或检查 Manifest 解析状态。'
      }],
      defaultOpen: targetIssues.some(issue => issue.status === 'fail' || issue.status === 'parse_error')
    },
    {
      id: 'privacy',
      title: '隐私权限检测',
      description: '敏感权限、隐私弹窗资源、授权前采集能力。',
      issues: privacyIssues,
      defaultOpen: privacyIssues.some(issue => issue.status === 'fail')
    },
    {
      id: 'security',
      title: '安全合规检测',
      description: 'HTTP、Debug、签名、allowBackup 等安全风险。',
      issues: [...securityRiskIssues, ...securityPassIssues],
      defaultOpen: securityRiskIssues.some(issue => issue.status === 'fail')
    },
    {
      id: 'channels',
      title: '渠道规则适配',
      description: '按已选渠道输出提审前规则适配结果。',
      issues: channelIssues,
      defaultOpen: channelIssues.some(issue => issue.status === 'fail' || issue.status === 'parse_error')
    },
    {
      id: 'developer',
      title: '研发整改清单',
      description: '适合直接复制给研发的整改说明。',
      issues: [developerIssue],
      defaultOpen: result.status !== 'passed'
    }
  ]

  return groups
}

function IssueCard({ issue }: { issue: ReportIssue }) {
  return (
    <article className={classNames('rounded-lg border border-l-4 border-slate-200 bg-white p-4 text-left shadow-sm', issueBorderClass(issue.status))}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={statusClass(issue.status)}>{statusLabel(issue.status)}</span>
          <h4 className="mt-3 break-words text-base font-semibold text-slate-950">{issue.title}</h4>
        </div>
        <CopyButton text={issueCopyText(issue)} label="复制本段" variant="light" size="sm" className="shrink-0" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">当前检测值</div>
          <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{issue.currentValue}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-500">渠道要求</div>
          <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">{issue.expectedValue}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-500">影响说明</div>
          <p className="mt-2 break-words text-sm leading-6 text-slate-600">{issue.impact}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold text-slate-500">研发整改建议</div>
          <p className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words pr-1 text-sm leading-7 text-slate-700">{issue.suggestion}</p>
        </div>
      </div>
    </article>
  )
}

function ExportActionButton({
  title,
  description,
  onClick
}: {
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[92px] w-full flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
    >
      <span className="text-sm font-semibold text-slate-950">{title}</span>
      <span className="mt-3 text-xs leading-5 text-slate-500">{description}</span>
    </button>
  )
}

function GroupSummary({ issues }: { issues: ReportIssue[] }) {
  const fail = issues.filter(issue => issue.status === 'fail').length
  const risk = issues.filter(issue => issue.status === 'risk').length
  const parseError = issues.filter(issue => issue.status === 'parse_error').length
  const pass = issues.filter(issue => issue.status === 'pass').length

  return (
    <div className="flex flex-wrap gap-2">
      {fail > 0 && <span className="status-fail">{fail} 不通过</span>}
      {risk > 0 && <span className="status-warn">{risk} 风险</span>}
      {parseError > 0 && <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{parseError} 解析失败</span>}
      {pass > 0 && <span className="status-pass">{pass} 通过</span>}
    </div>
  )
}

export function ResultDashboard({ result }: { result: any }) {
  const [activeFilter, setActiveFilter] = useState<IssueFilter>('all')

  if (!result) return null

  const groups = buildIssueGroups(result)
  const allIssues = groups.flatMap(group => group.issues)
  const filteredGroups = filterIssues(groups, activeFilter)
  const failCount = allIssues.filter(issue => issue.status === 'fail').length
  const riskCount = allIssues.filter(issue => issue.status === 'risk').length
  const passCount = allIssues.filter(issue => issue.status === 'pass').length
  const parseErrorCount = allIssues.filter(issue => issue.status === 'parse_error').length
  const parseError = result.status === 'parse_error'
  const conclusion = result.submissionConclusion || {
    title: result.status === 'passed' ? '通过' : parseError ? '解析失败' : '不建议提审',
    summary: result.summary,
    level: parseError ? 'info' : result.status === 'passed' ? 'info' : 'blocker'
  }
  const conclusionStatus: IssueStatus = parseError
    ? 'parse_error'
    : failCount > 0 || conclusion.level === 'blocker' || conclusion.level === 'high'
      ? 'fail'
      : riskCount > 0 || conclusion.level === 'medium'
        ? 'risk'
        : 'pass'
  const conclusionLabel = parseError
    ? '解析失败'
    : conclusion.status === 'passed' || result.status === 'passed'
      ? riskCount > 0 ? '有风险' : '通过'
      : '不建议提审'
  const actionText = parseError
    ? '建议重新上传或检查 APK 文件；解析失败时不输出渠道通过或不通过结论。'
    : conclusionStatus === 'pass'
      ? '当前未发现阻断项，建议完成渠道后台人工复核后提审。'
      : conclusionStatus === 'risk'
        ? '建议确认一般风险，必要时整改后再提交渠道。'
        : '建议整改后再提交渠道，并重新上传 APKFlow 复测。'
  const scoreText = result.score === null ? '不可用' : `${result.score}/100`
  const gradeText = result.grade === null ? '等级不可用' : `等级 ${result.grade}`
  const conclusionLine = parseError
    ? '检测结论：解析失败，建议重新上传或检查 APK 文件'
    : conclusionStatus === 'pass'
      ? '检测结论：通过，建议完成渠道后台复核后提交'
      : conclusionStatus === 'risk'
        ? '检测结论：有风险，建议整改后再提交渠道'
        : '检测结论：不建议提审，建议整改后再提交渠道'

  return (
    <div className="space-y-6">
      <section className={classNames('rounded-xl border border-l-4 bg-white p-5 shadow-sm', issueBorderClass(conclusionStatus))}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={statusClass(conclusionStatus)}>{conclusionLabel}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">报告编号：{display(result.reportMeta?.reportId)}</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{conclusionLine}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{conclusion.summary}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>辅助评分：{scoreText}</span>
              <span>{gradeText}</span>
              <span>仅用于内部参考，不替代渠道审核结论。</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.fullReportText || result.markdownReport || JSON.stringify(result, null, 2)} label="复制完整报告" variant="light" size="sm" />
            <CopyButton text={result.developerMessage || ''} label="复制研发整改说明" variant="light" size="sm" />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="严重问题" value={parseError ? '不可用' : failCount} detail={parseError ? '解析失败不做阻断判定' : '不建议带问题提审'} tone={parseError ? 'amber' : failCount > 0 ? 'red' : 'green'} />
          <MetricCard label="一般风险" value={parseError ? '不可用' : riskCount} detail={parseError ? '需先恢复解析' : '需要研发或运营确认'} tone={riskCount > 0 ? 'amber' : 'green'} />
          <MetricCard label="通过项" value={parseError ? '不可用' : passCount} detail={parseError ? '无可靠通过项' : '已完成检测的通过项'} tone={parseError ? 'amber' : 'green'} />
          <MetricCard label="解析失败" value={parseErrorCount} detail={parseError ? '请重新上传或检查 APK' : '未解析项数量'} tone={parseErrorCount > 0 ? 'amber' : 'blue'} />
        </div>

        <ReviewSummaryTable result={result} issues={allIssues} />

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
          建议动作：{actionText}
        </div>

        {Array.isArray(result.scoreBreakdown) && result.scoreBreakdown.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-950">评分明细</h3>
              <span className="text-xs text-slate-500">unknown / unsupported 不直接扣分</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {result.scoreBreakdown
                .filter((item: any) => item.includedInScore || item.status === 'unknown' || item.status === 'unsupported')
                .slice(0, 8)
                .map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.reason}</div>
                      </div>
                      <div className={item.includedInScore ? 'text-sm font-bold text-rose-600' : 'text-xs font-semibold text-slate-500'}>
                        {item.includedInScore ? `-${item.deduction}` : '未纳入'}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>

      <CoverageScope result={result} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">问题清单与分段报告</h3>
            <p className="mt-1 text-sm text-slate-500">严重问题默认展开；一般风险和通过项可按模块展开查看。每张卡片可单独复制给研发。</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">共 {allIssues.length} 个分段</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {issueFilters.map(filter => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              className={classNames(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                activeFilter === filter.key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              {filter.label} {filterCount(allIssues, filter.key)}
            </button>
          ))}
        </div>

        {filteredGroups.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">当前筛选下暂无问题项。</div>
        )}

        {filteredGroups.map(group => (
          <details key={`${group.id}-${activeFilter}`} open={shouldOpenGroup(group, activeFilter)} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-950">{group.title}</h4>
                  <p className="mt-1 text-sm text-slate-500">{group.description}</p>
                </div>
                <GroupSummary issues={group.issues} />
              </div>
            </summary>
            <div className="space-y-4 p-4">
              {group.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)}
            </div>
          </details>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-950">报告导出</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">下载文件和运营同步话术集中在这里，适合提交工单、归档或转发渠道运营。</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">导出与同步</span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <ExportActionButton
            title="下载报告"
            description="导出 A4 HTML 审核报告，可直接归档，也可用浏览器打印另存 PDF。"
            onClick={() => downloadText(exportFileName(result, 'html'), result.htmlReport || result.fullReportText || '', 'text/html;charset=utf-8')}
          />
          <ExportActionButton
            title="下载 Markdown"
            description="导出 Markdown 文本，适合复制到工单、知识库或飞书文档。"
            onClick={() => downloadText(exportFileName(result, 'md'), result.markdownReport || result.fullReportText || '', 'text/markdown;charset=utf-8')}
          />
          <ExportActionButton
            title="下载 JSON"
            description="导出原始检测数据，方便后续排查、归档或二次处理。"
            onClick={() => downloadText(exportFileName(result, 'json'), JSON.stringify(result, null, 2))}
          />
          <div className="flex min-h-[92px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-slate-950">复制运营话术</div>
              <p className="mt-3 text-xs leading-5 text-slate-500">复制面向运营沟通的简短结论和后续动作。</p>
            </div>
            <CopyButton text={result.operationMessage || ''} label="复制运营话术" variant="light" className="mt-4 w-full" />
          </div>
        </div>
      </section>
    </div>
  )
}
