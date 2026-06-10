'use client'

import { CopyButton } from './CopyButton'
import { MetricCard } from './MetricCard'

type IssueStatus = 'fail' | 'risk' | 'pass' | 'parse_error' | 'info'

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

function buildIssueGroups(result: any): IssueGroup[] {
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
    <article className={classNames('rounded-lg border border-l-4 border-slate-200 bg-white p-4 shadow-sm', issueBorderClass(issue.status))}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={statusClass(issue.status)}>{statusLabel(issue.status)}</span>
          <h4 className="mt-3 text-base font-semibold text-slate-950">{issue.title}</h4>
        </div>
        <CopyButton text={issueCopyText(issue)} label="复制本段" variant="light" size="sm" />
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
        <div>
          <div className="text-xs font-semibold text-slate-500">影响说明</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{issue.impact}</p>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500">研发整改建议</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{issue.suggestion}</p>
        </div>
      </div>
    </article>
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
  if (!result) return null

  const groups = buildIssueGroups(result)
  const allIssues = groups.flatMap(group => group.issues)
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

  return (
    <div className="space-y-6">
      <section className={classNames('rounded-xl border border-l-4 bg-white p-5 shadow-sm', issueBorderClass(conclusionStatus))}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={statusClass(conclusionStatus)}>检测结论：{conclusionLabel}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">报告编号：{display(result.reportMeta?.reportId)}</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{conclusion.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{conclusion.summary}</p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
              建议动作：{actionText}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">APKFlow Score</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{scoreText}</div>
            <div className="mt-1 text-xs text-slate-500">{gradeText}</div>
            <div className="mt-3 text-xs leading-5 text-slate-500">
              检测模式：{display(result.reportMeta?.detectionMode)}<br />
              生成时间：{display(result.generatedAt)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="严重问题" value={parseError ? '不可用' : failCount} detail={parseError ? '解析失败不做阻断判定' : '不建议带问题提审'} tone={parseError ? 'amber' : failCount > 0 ? 'red' : 'green'} />
          <MetricCard label="一般风险" value={parseError ? '不可用' : riskCount} detail={parseError ? '需先恢复解析' : '需要研发或运营确认'} tone={riskCount > 0 ? 'amber' : 'green'} />
          <MetricCard label="通过项" value={parseError ? '不可用' : passCount} detail={parseError ? '无可靠通过项' : '已完成检测的通过项'} tone={parseError ? 'amber' : 'green'} />
          <MetricCard label="解析失败" value={parseErrorCount} detail={parseError ? '请重新上传或检查 APK' : '未解析项数量'} tone={parseErrorCount > 0 ? 'amber' : 'blue'} />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">问题清单与分段报告</h3>
            <p className="mt-1 text-sm text-slate-500">严重问题默认展开；一般风险和通过项可按模块展开查看。每张卡片可单独复制给研发。</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">共 {allIssues.length} 个分段</span>
        </div>

        {groups.map(group => (
          <details key={group.id} open={group.defaultOpen} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

      <section className="glass-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">报告导出</h3>
            <p className="mt-1 text-sm text-slate-500">完整报告和角色话术统一放在这里，避免操作入口散落。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result.fullReportText || result.markdownReport || JSON.stringify(result, null, 2)} label="复制完整报告" variant="light" />
            <CopyButton text={result.developerMessage || ''} label="复制研发整改说明" variant="light" />
            <CopyButton text={result.operationMessage || ''} label="复制运营话术" variant="light" />
            <button type="button" onClick={() => downloadText('apkflow-channel-report.html', result.htmlReport || result.fullReportText || '', 'text/html;charset=utf-8')} className="btn-secondary">下载报告</button>
            <button type="button" onClick={() => downloadText('apkflow-report.md', result.markdownReport || result.fullReportText || '', 'text/markdown;charset=utf-8')} className="btn-secondary">下载 Markdown</button>
            <button type="button" onClick={() => downloadText('apkflow-report.json', JSON.stringify(result, null, 2))} className="btn-secondary">下载 JSON</button>
          </div>
        </div>
      </section>
    </div>
  )
}
