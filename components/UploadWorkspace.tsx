'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { channelRules, type ChannelRule } from '@/lib/channelRules'
import { ResultDashboard } from './ResultDashboard'
import { CopyButton } from './CopyButton'

type EngineMode = 'full' | 'degraded' | 'unavailable'
type ViewKey = 'dashboard' | 'history' | 'rules' | 'reports' | 'settings'
type ToolHealth = Record<'unzip' | 'aapt' | 'apksigner' | 'strings', boolean>

type EngineHealth = {
  service?: string
  maxUploadMB?: number
  mode: EngineMode
  tools?: Partial<ToolHealth>
  message?: string
  checkedAt?: string
  version?: string
}

type HistoryItem = {
  id: string
  fileName: string
  status: string
  summary: string
  score: number | null
  generatedAt: string
  result: any
  reportId?: string
  originalFileName?: string
  packageName?: string | null
  versionName?: string | null
  versionCode?: string | null
  fileSize?: string
  sha256?: string
  finalStatus?: string
  criticalCount?: number
  warningCount?: number
  passCount?: number
  unknownCount?: number
  channelRuleName?: string
}

type ReportRecord = {
  id: string
  source: 'current' | 'history'
  fileName: string
  packageName: string | null
  versionName: string | null
  versionCode: string | null
  status: string
  conclusion: string
  score: number | null
  generatedAt: string
  reportId?: string
  criticalCount: number
  warningCount: number
  passCount: number
  result: any
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
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

function analyzeApiUrl() {
  return process.env.NEXT_PUBLIC_ANALYZE_API_URL || '/api/analyze'
}

function healthApiUrl() {
  const analyzeUrl = process.env.NEXT_PUBLIC_ANALYZE_API_URL
  if (!analyzeUrl) return '/api/health'
  try {
    return new URL('/api/health', analyzeUrl).toString()
  } catch {
    return '/api/health'
  }
}

const MB = 1024 * 1024

function maxUploadMB() {
  return process.env.NEXT_PUBLIC_ANALYZE_API_URL ? 500 : 4
}

function engineText(mode: EngineMode) {
  if (mode === 'full') return '完整检测模式'
  if (mode === 'degraded') return '降级检测模式'
  return '暂不可用'
}

function serviceStatusText(mode: EngineMode) {
  if (mode === 'full' || mode === 'degraded') return '检测服务状态：正常'
  return '检测服务暂不可用，请稍后重试'
}

function statusText(status?: string) {
  if (status === 'passed') return '通过'
  if (status === 'failed') return '不通过'
  if (status === 'parse_error') return '解析失败'
  return '待检测'
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '未解析'
  return String(value)
}

function boolText(value: boolean | null | undefined) {
  if (value === true) return '是'
  if (value === false) return '否'
  return '未解析'
}

function safeExportPart(value: unknown) {
  return display(value).replace(/[^\w\u4e00-\u9fa5.-]+/g, '_')
}

function reportDownloadName(result: any, ext: 'html' | 'md' | 'json') {
  const pkg = safeExportPart(result?.apkInfo?.packageName || 'unknown_package')
  const version = safeExportPart(result?.apkInfo?.versionName || result?.apkInfo?.versionCode || 'unknown_version')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `APKFlow_${pkg}_${version}_${date}.${ext}`
}

function resultIssueCounts(result: any) {
  const items = Array.isArray(result?.detectionItems) ? result.detectionItems : []
  return {
    criticalCount: items.filter((item: any) => item.status === 'fail').length,
    warningCount: items.filter((item: any) => item.status === 'warning').length,
    passCount: items.filter((item: any) => item.status === 'pass').length
  }
}

function toReportRecord(input: { result: any; source: ReportRecord['source']; id?: string }): ReportRecord | null {
  const result = input.result
  if (!result) return null
  const counts = resultIssueCounts(result)
  return {
    id: input.id || result.reportMeta?.reportId || result.apkHash?.sha256 || `${input.source}-${result.generatedAt || Date.now()}`,
    source: input.source,
    fileName: result.apkInfo?.fileName || '未知 APK',
    packageName: result.apkInfo?.packageName || null,
    versionName: result.apkInfo?.versionName || null,
    versionCode: result.apkInfo?.versionCode || null,
    status: result.status || 'unknown',
    conclusion: result.submissionConclusion?.title || result.summary || statusText(result.status),
    score: typeof result.score === 'number' ? result.score : null,
    generatedAt: result.generatedAt || result.reportMeta?.detectedAt || '未记录',
    reportId: result.reportMeta?.reportId,
    ...counts,
    result
  }
}

function issueMap(result: any) {
  const items = Array.isArray(result?.detectionItems) ? result.detectionItems : []
  return new Map(items
    .filter((item: any) => item.status === 'fail' || item.status === 'warning')
    .map((item: any) => [item.id || item.title, item.title]))
}

function compareReports(current: any, previous: any) {
  const currentIssues = issueMap(current)
  const previousIssues = issueMap(previous)
  const added = Array.from(currentIssues.entries()).filter(([id]) => !previousIssues.has(id)).map(([, title]) => title)
  const fixed = Array.from(previousIssues.entries()).filter(([id]) => !currentIssues.has(id)).map(([, title]) => title)
  const remaining = Array.from(currentIssues.entries()).filter(([id]) => previousIssues.has(id)).map(([, title]) => title)
  return { added, fixed, remaining }
}

function defaultSelectedRuleIds(ruleList: ChannelRule[]) {
  const defaults = ruleList.filter(rule => rule.id !== 'google_play').map(rule => rule.id)
  return defaults.length ? defaults : ruleList.map(rule => rule.id)
}

function statusClass(status?: string) {
  if (status === 'passed') return 'status-pass'
  if (status === 'failed') return 'status-fail'
  if (status === 'parse_error') return 'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600'
  return 'status-info'
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * MB) return `${(bytes / 1024 / MB).toFixed(2)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

function networkErrorMessage(apiUrl: string, reason: string) {
  return [
    '浏览器无法连接检测后端，请先确认后端域名可以直接访问。',
    `请求地址：${apiUrl}`,
    `原始错误：${reason}`,
    '如果本机启用了代理、VPN、杀毒软件或浏览器代理插件，请把 apk-api.hnchpower.cn 加入直连/绕过列表后重试。'
  ].join('\n')
}

function postAnalyze(form: FormData, onProgress: (progress: number) => void) {
  const apiUrl = analyzeApiUrl()

  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl)
    xhr.responseType = 'text'
    xhr.timeout = 15 * 60 * 1000

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }

    xhr.onload = () => {
      const raw = xhr.responseText || ''
      let json: any = null
      try {
        json = raw ? JSON.parse(raw) : null
      } catch {
        json = null
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        if (!json) reject(new Error('检测接口返回了非 JSON 内容，请检查后端服务是否正常。'))
        else resolve(json)
        return
      }

      if (xhr.status === 413) {
        reject(new Error(process.env.NEXT_PUBLIC_ANALYZE_API_URL
          ? 'APK 文件超过检测后端上传限制，请检查后端 500MB 限制和网关 body size 配置。'
          : '当前请求仍在使用 Vercel 演示接口，最大只支持 4MB。请配置 NEXT_PUBLIC_ANALYZE_API_URL 指向独立检测后端。'))
        return
      }

      reject(new Error(json?.error || raw || `检测失败，HTTP 状态码：${xhr.status}`))
    }

    xhr.onerror = () => reject(new Error(networkErrorMessage(apiUrl, 'ERR_CONNECTION_RESET / Failed to fetch')))
    xhr.ontimeout = () => reject(new Error(networkErrorMessage(apiUrl, '请求超时')))
    xhr.onabort = () => reject(new Error('检测请求已取消。'))
    xhr.send(form)
  })
}

function ToolBadge({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span className={classNames(
      'rounded-full px-3 py-1 text-xs font-semibold',
      ok ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
    )}>
      {label}: {ok ? '可用' : '异常'}
    </span>
  )
}

export function UploadWorkspace() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<any>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [rules, setRules] = useState<ChannelRule[]>(channelRules)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all')
  const [historyRuleFilter, setHistoryRuleFilter] = useState('all')
  const [reportQuery, setReportQuery] = useState('')
  const [reportStatusFilter, setReportStatusFilter] = useState('all')
  const [reportPackageFilter, setReportPackageFilter] = useState('all')
  const [selectedChannels, setSelectedChannels] = useState(defaultSelectedRuleIds(channelRules))
  const [rulesJson, setRulesJson] = useState('')
  const [ruleEditMessage, setRuleEditMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [engineMode, setEngineMode] = useState<EngineMode>('unavailable')
  const [engineMessage, setEngineMessage] = useState('检测服务状态检查中')
  const [engineHealth, setEngineHealth] = useState<EngineHealth | null>(null)
  const [healthChecked, setHealthChecked] = useState(false)
  const [healthError, setHealthError] = useState('')
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadTime, setUploadTime] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    const raw = localStorage.getItem('apkflow-history')
    if (raw) {
      try { setHistory(JSON.parse(raw)) } catch {}
    }
    const rawRules = localStorage.getItem('apkflow-channel-rules')
    if (rawRules) {
      try {
        const parsed = JSON.parse(rawRules)
        if (Array.isArray(parsed) && parsed.length) {
          setRules(parsed)
          setSelectedChannels(defaultSelectedRuleIds(parsed))
          setRulesJson(JSON.stringify(parsed, null, 2))
        }
      } catch {}
    } else {
      setRulesJson(JSON.stringify(channelRules, null, 2))
    }
  }, [])

  const refreshHealth = useCallback(() => {
    let alive = true
    fetch(healthApiUrl())
      .then(async res => {
        const raw = await res.text()
        let json: any = null
        try { json = raw ? JSON.parse(raw) : null } catch {}
        if (!res.ok) throw new Error(json?.error || raw || `HTTP ${res.status}`)
        if (!json) throw new Error('健康检查返回了非 JSON 内容')
        return json
      })
      .then(json => {
        if (!alive) return
        const mode = (json.mode || 'unavailable') as EngineMode
        setEngineMode(mode)
        setEngineMessage(serviceStatusText(mode))
        setEngineHealth(json)
        setHealthChecked(true)
        setHealthError('')
      })
      .catch((err: any) => {
        if (!alive) return
        setEngineMode('unavailable')
        setEngineMessage('检测服务暂不可用，请稍后重试')
        setEngineHealth(null)
        setHealthChecked(true)
        setHealthError(err?.message || '健康检查失败')
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    return refreshHealth()
  }, [refreshHealth])

  const stats = useMemo(() => {
    const total = history.length
    const passed = history.filter(item => item.status === 'passed').length
    const failed = history.filter(item => item.status === 'failed').length
    const parseErrors = history.filter(item => item.status === 'parse_error').length
    const scored = history.filter(item => typeof item.score === 'number')
    const avg = scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.score || 0), 0) / scored.length) : null
    return { total, passed, failed, parseErrors, avg }
  }, [history])

  const reportRecords = useMemo(() => {
    const records: ReportRecord[] = []
    const current = toReportRecord({ result, source: 'current' })
    if (current) records.push(current)
    for (const item of history) {
      const record = toReportRecord({ result: item.result, source: 'history', id: item.reportId || item.id })
      if (!record) continue
      if (records.some(existing => existing.reportId && existing.reportId === record.reportId)) continue
      records.push(record)
    }
    return records
  }, [result, history])

  function saveHistory(nextItem: HistoryItem) {
    const next = [nextItem, ...history].slice(0, 50)
    setHistory(next)
    localStorage.setItem('apkflow-history', JSON.stringify(next))
  }

  function chooseFile(nextFile: File | null) {
    setError('')
    if (!nextFile) return
    if (!nextFile.name.toLowerCase().endsWith('.apk')) {
      setError('只允许上传 .apk 文件')
      return
    }
    const limitMB = maxUploadMB()
    if (nextFile.size > limitMB * MB) {
      setError(`文件大小为 ${formatBytes(nextFile.size)}，超过当前环境 ${limitMB}MB 上传限制。`)
      return
    }
    setFile(nextFile)
    setResult(null)
    setUploadTime(new Date().toLocaleString('zh-CN', { hour12: false }))
  }

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files?.[0] || null)
  }, [])

  function toggleChannel(id: string) {
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  async function analyze() {
    if (!file) {
      setError('请先选择 APK 文件')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setUploadProgress(0)

    const form = new FormData()
    form.append('file', file)
    form.append('channels', JSON.stringify(selectedChannels))
    form.append('channelRules', JSON.stringify(rules))

    try {
      const json = await postAnalyze(form, setUploadProgress)
      setUploadProgress(100)

      setResult(json)
      setActiveView('dashboard')
      saveHistory({
        id: `${Date.now()}`,
        fileName: json.apkInfo?.fileName || file.name,
        status: json.status,
        summary: json.summary,
        score: typeof json.score === 'number' ? json.score : null,
        generatedAt: json.generatedAt,
        reportId: json.reportMeta?.reportId,
        originalFileName: file.name,
        packageName: json.apkInfo?.packageName,
        versionName: json.apkInfo?.versionName,
        versionCode: json.apkInfo?.versionCode,
        fileSize: json.apkInfo?.fileSize,
        sha256: json.apkHash?.sha256,
        finalStatus: json.submissionConclusion?.title || json.status,
        criticalCount: json.detectionItems?.filter((item: any) => item.status === 'fail').length || 0,
        warningCount: json.detectionItems?.filter((item: any) => item.status === 'warning').length || 0,
        passCount: json.detectionItems?.filter((item: any) => item.status === 'pass').length || 0,
        unknownCount: json.detectionItems?.filter((item: any) => item.status === 'unknown' || item.status === 'unsupported' || item.status === 'parse_failed').length || 0,
        channelRuleName: json.currentChannelRules?.map((rule: any) => rule.name).join('、') || selectedChannels.join('、'),
        result: json
      })
    } catch (err: any) {
      setError(err.message || '检测失败')
    } finally {
      setLoading(false)
      setTimeout(() => setUploadProgress(0), 800)
    }
  }

  function renderUploadPanel() {
    if (file || result) {
      const displayName = file?.name || result?.apkInfo?.fileName || '历史检测 APK'
      const displaySize = file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : result?.apkInfo?.fileSize || '未记录'
      const displayTime = uploadTime || result?.generatedAt || result?.reportMeta?.detectedAt || '未记录'
      const canAnalyze = Boolean(file)
      const apkInfo = result?.apkInfo || {}

      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-semibold uppercase text-slate-500">当前 APK</div>
                <span className={loading ? 'status-warn' : statusClass(result?.status)}>{loading ? '检测中' : statusText(result?.status)}</span>
              </div>
              <div className="mt-1 max-w-[620px] truncate text-sm font-semibold text-slate-950">{displayName}</div>
              <div className="mt-1 grid gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-3">
                <span>文件大小：{displaySize}</span>
                <span>上传时间：{displayTime}</span>
                <span>检测状态：{loading ? '检测中' : statusText(result?.status)}</span>
                <span>包名：{display(apkInfo.packageName)}</span>
                <span>应用名：{display(apkInfo.appLabel || apkInfo.appName)}</span>
                <span>版本：{display(apkInfo.versionName)} / {display(apkInfo.versionCode)}</span>
                <span>minSdkVersion：{display(apkInfo.minSdkVersion)}</span>
                <span>targetSdkVersion：{display(apkInfo.targetSdkVersion)}</span>
                <span>检测模式：{result?.reportMeta?.detectionMode ? engineText(result.reportMeta.detectionMode) : healthChecked ? engineText(engineMode) : '状态检查中'}</span>
                <span className="min-w-0 truncate lg:col-span-3">APK SHA256：{display(result?.apkHash?.sha256)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>重新上传</button>
              <button type="button" className="btn-primary btn-sm" onClick={analyze} disabled={loading || !canAnalyze}>{loading ? '检测中...' : result ? '重新检测' : '开始检测'}</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setFile(null); setResult(null); setError(''); setUploadTime('') }}>重置</button>
            </div>
          </div>
          {loading && (
            <div className="mt-3">
              <div className="flex justify-between text-xs font-semibold text-slate-500"><span>上传与检测中</span><span>{uploadProgress}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          <input ref={inputRef} type="file" accept=".apk" className="hidden" onChange={event => chooseFile(event.target.files?.[0] || null)} />
        </div>
      )
    }

    return (
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={classNames(
          'cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white'
        )}
      >
        <input ref={inputRef} type="file" accept=".apk" className="hidden" onChange={event => chooseFile(event.target.files?.[0] || null)} />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">APK</div>
        <div className="mt-5 text-base font-semibold text-slate-950">点击或拖拽 APK 到这里</div>
        <div className="mt-2 text-sm text-slate-500">
          最大支持 {maxUploadMB()}MB
        </div>
        {loading && (
          <div className="mx-auto mt-6 max-w-md">
            <div className="flex justify-between text-xs font-semibold text-slate-500"><span>上传与检测中</span><span>{uploadProgress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderDiagnostics() {
    return (
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">检测后端诊断</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">用于排查 Failed to fetch、连接重置、代理拦截和工具缺失。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={refreshHealth}>重新检测后端</button>
            <a className="btn-secondary" href={healthApiUrl()} target="_blank" rel="noreferrer">打开 health</a>
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase text-slate-400">Analyze API</div>
            <div className="mt-2 break-all font-semibold text-slate-800">{analyzeApiUrl()}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase text-slate-400">Health API</div>
            <div className="mt-2 break-all font-semibold text-slate-800">{healthApiUrl()}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ToolBadge label="unzip" ok={engineHealth?.tools?.unzip} />
          <ToolBadge label="aapt" ok={engineHealth?.tools?.aapt} />
          <ToolBadge label="apksigner" ok={engineHealth?.tools?.apksigner} />
          <ToolBadge label="strings" ok={engineHealth?.tools?.strings} />
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <div>检测服务：{engineMessage}</div>
          <div>检测模式：{healthChecked ? engineText(engineMode) : '状态检查中'}</div>
          <div>上传限制：{engineHealth?.maxUploadMB || maxUploadMB()}MB</div>
          <div>检查时间：{engineHealth?.checkedAt || '未完成'}</div>
          {engineHealth?.version && <div>后端版本：{engineHealth.version}</div>}
          {healthError && <div className="mt-2 text-rose-600">健康检查错误：{healthError}</div>}
          <div className="mt-2 text-slate-500">如果 Chrome 仍提示连接失败，请检查代理/VPN/安全软件是否拦截 apk-api.hnchpower.cn。</div>
        </div>
      </div>
    )
  }

  function renderAuxiliaryRail() {
    const scoreText = result?.score === null || result?.score === undefined ? '不可用' : `${result.score}/100`
    const detectionItems = result?.detectionItems || []
    const failCount = detectionItems.filter((item: any) => item.status === 'fail').length
    const warningCount = detectionItems.filter((item: any) => item.status === 'warning').length
    const passCount = detectionItems.filter((item: any) => item.status === 'pass').length
    const unknownCount = detectionItems.filter((item: any) => item.status === 'unknown' || item.status === 'unsupported' || item.status === 'parse_failed').length
    const summaryRows = [
      ['当前检测结论', result?.submissionConclusion?.title || '待检测'],
      ['APKFlow Score', scoreText],
      ['严重问题数量', result ? failCount : '待检测'],
      ['一般风险数量', result ? warningCount : '待检测'],
      ['通过项数量', result ? passCount : '待检测'],
      ['targetSdkVersion', display(result?.apkInfo?.targetSdkVersion)],
      ['包含 arm64-v8a', boolText(result?.checks?.hasArm64)],
      ['debuggable', boolText(result?.checks?.debuggable ?? result?.checks?.hasDebugRisk)],
      ['允许 HTTP 明文', result?.checks?.cleartextMode === 'global' ? '是' : result?.checks?.cleartextMode === 'domain' ? '域名级放开' : boolText(result?.checks?.usesCleartextTraffic)],
      ['签名状态', result?.signatureInfo?.status || (result?.checks?.hasSignature === true ? '已签名' : result?.checks?.hasSignature === false ? '未确认' : '未解析')]
    ]

    return (
      <aside className="glass-card overflow-hidden xl:sticky xl:top-7">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-950">辅助信息</div>
          <div className="mt-1 text-xs text-slate-500">当前报告摘要与低权重辅助模块</div>
        </div>

        <div className="border-b border-slate-200 p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Review Summary</div>
            <div className="mt-3 space-y-2">
              {summaryRows.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-slate-500">{label}</span>
                  <span className="max-w-[150px] break-words text-right font-semibold text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <details open className="border-b border-slate-200">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">当前检测重点</summary>
          <div className="space-y-2 px-4 pb-4 text-sm leading-6 text-slate-600">
            <div>arm64-v8a 64 位包体</div>
            <div>targetSdkVersion 达标判定</div>
            <div>权限、HTTP、Debug、签名风险</div>
            <div>解析失败时不输出误导性结论</div>
          </div>
        </details>

        <details className="border-b border-slate-200">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">工作台概览</summary>
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-500">历史检测</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{stats.total}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs text-emerald-700">通过</div>
              <div className="mt-1 text-lg font-semibold text-emerald-700">{stats.passed}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs text-rose-700">不通过</div>
              <div className="mt-1 text-lg font-semibold text-rose-700">{stats.failed}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
              <div className="text-xs text-slate-600">解析失败</div>
              <div className="mt-1 text-lg font-semibold text-slate-700">{stats.parseErrors}</div>
            </div>
          </div>
        </details>

        <details className="border-b border-slate-200">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">历史检测统计</summary>
          <div className="space-y-2 px-4 pb-4 text-sm text-slate-600">
            <div className="flex justify-between"><span>通过 / 不通过</span><b>{stats.passed} / {stats.failed}</b></div>
            <div className="flex justify-between"><span>解析失败</span><b>{stats.parseErrors}</b></div>
            <div className="flex justify-between"><span>平均评分</span><b>{stats.avg === null ? '不可用' : stats.avg}</b></div>
          </div>
        </details>

        <details className="border-b border-slate-200">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">APKFlow Score</summary>
          <div className="px-4 pb-4 text-sm leading-6 text-slate-600">
            <div>辅助评分：{scoreText}</div>
            <div className="text-xs text-slate-500">说明：仅用于内部参考，不替代渠道审核结论。</div>
          </div>
        </details>

        <details>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">PWA Ready</summary>
          <p className="px-4 pb-4 text-sm leading-6 text-slate-500">PWA Ready：已部署 HTTPS，可添加到桌面使用。</p>
        </details>
      </aside>
    )
  }

  function renderContent() {
    if (activeView === 'history') {
      const ruleOptions = Array.from(new Set(history.map(item => item.channelRuleName).filter(Boolean))) as string[]
      const filteredHistory = history.filter(item => {
        const query = historyQuery.trim().toLowerCase()
        const matchesQuery = !query
          || item.fileName.toLowerCase().includes(query)
          || (item.packageName || '').toLowerCase().includes(query)
          || (item.versionName || '').toLowerCase().includes(query)
        const matchesStatus = historyStatusFilter === 'all' || item.status === historyStatusFilter
        const matchesRule = historyRuleFilter === 'all' || item.channelRuleName === historyRuleFilter
        return matchesQuery && matchesStatus && matchesRule
      })

      return (
        <section className="glass-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">检测历史</h2>
              <p className="mt-1 text-sm text-slate-500">历史记录保存在当前浏览器本地，最多保留 50 条。</p>
            </div>
            <button onClick={() => { setHistory([]); localStorage.removeItem('apkflow-history') }} className="btn-secondary">清空历史</button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <input
              value={historyQuery}
              onChange={event => setHistoryQuery(event.target.value)}
              placeholder="按包名、文件名、版本搜索"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
            <select
              value={historyStatusFilter}
              onChange={event => setHistoryStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="all">全部结论</option>
              <option value="passed">通过</option>
              <option value="failed">不通过</option>
              <option value="parse_error">解析失败</option>
            </select>
            <select
              value={historyRuleFilter}
              onChange={event => setHistoryRuleFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="all">全部渠道规则</option>
              {ruleOptions.map(rule => <option key={rule} value={rule}>{rule}</option>)}
            </select>
          </div>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="p-4">APK</th><th className="p-4">包名 / 版本</th><th className="p-4">渠道规则</th><th className="p-4">状态</th><th className="p-4">统计</th><th className="p-4">评分</th><th className="p-4">时间</th><th className="p-4">操作</th></tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">暂无历史记录</td></tr>}
                {filteredHistory.map(item => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="max-w-[260px] p-4">
                      <div className="truncate font-semibold">{item.fileName}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">SHA256：{display(item.sha256)}</div>
                      <div className="mt-1 text-xs text-slate-500">报告：{display(item.reportId)}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold">{display(item.packageName)}</div>
                      <div className="mt-1 text-xs text-slate-500">{display(item.versionName)} / {display(item.versionCode)}</div>
                    </td>
                    <td className="max-w-[180px] truncate p-4 text-slate-500">{display(item.channelRuleName)}</td>
                    <td className="p-4"><span className={item.status === 'passed' ? 'status-pass' : item.status === 'parse_error' ? 'status-warn' : 'status-fail'}>{item.summary}</span></td>
                    <td className="p-4 text-xs leading-5 text-slate-500">
                      严重 {item.criticalCount ?? 0}<br />
                      风险 {item.warningCount ?? 0}<br />
                      通过 {item.passCount ?? 0}<br />
                      未确认 {item.unknownCount ?? 0}
                    </td>
                    <td className="p-4 font-bold">{item.score === null ? '不可用' : item.score}</td>
                    <td className="p-4 text-slate-500">{item.generatedAt}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => { setResult(item.result); setActiveView('dashboard') }} className="btn-primary btn-sm">查看报告</button>
                        <button onClick={() => downloadText(`${item.reportId || 'APKFlow'}_report.md`, item.result?.markdownReport || item.result?.fullReportText || '', 'text/markdown;charset=utf-8')} className="btn-secondary btn-sm">下载 Markdown</button>
                        <button onClick={() => downloadText(`${item.reportId || 'APKFlow'}_report.json`, JSON.stringify(item.result, null, 2))} className="btn-secondary btn-sm">下载 JSON</button>
                        <CopyButton text={item.result?.developerMessage || ''} label="复制研发整改说明" variant="light" size="sm" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )
    }

    if (activeView === 'rules') {
      function applyRulesFromJson() {
        try {
          const parsed = JSON.parse(rulesJson)
          if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('规则 JSON 必须是非空数组')
          for (const rule of parsed) {
            if (!rule.id || !rule.name) throw new Error('每条规则必须包含 id 和 name')
            if (typeof (rule.minTargetSdkVersion ?? rule.targetSdkMin) !== 'number') throw new Error(`${rule.name} 缺少 minTargetSdkVersion / targetSdkMin`)
          }
          const normalized = parsed.map((rule: any) => ({
            ...rule,
            channelName: rule.channelName || rule.name,
            targetSdkMin: rule.targetSdkMin ?? rule.minTargetSdkVersion,
            minTargetSdkVersion: rule.minTargetSdkVersion ?? rule.targetSdkMin,
            logo: rule.logo || rule.name.slice(0, 2),
            requireArm64: rule.requireArm64 !== false,
            allowPure32Bit: Boolean(rule.allowPure32Bit),
            allowDebuggable: Boolean(rule.allowDebuggable),
            allowCleartextTraffic: Boolean(rule.allowCleartextTraffic),
            strictHttp: rule.strictHttp !== false,
            maxApkSizeMB: rule.maxApkSizeMB || 2048,
            requiredSignatureSchemes: rule.requiredSignatureSchemes || ['v2'],
            sensitivePermissionPolicy: rule.sensitivePermissionPolicy || {},
            description: rule.description || '自定义渠道规则'
          })) as ChannelRule[]
          setRules(normalized)
          setSelectedChannels(prev => {
            const next = normalized.filter(rule => prev.includes(rule.id)).map(rule => rule.id)
            return next.length ? next : defaultSelectedRuleIds(normalized)
          })
          localStorage.setItem('apkflow-channel-rules', JSON.stringify(normalized))
          setRuleEditMessage('规则已保存，重新检测会使用当前选择的规则。')
        } catch (err: any) {
          setRuleEditMessage(err?.message || '规则 JSON 解析失败')
        }
      }

      function resetRules() {
        setRules(channelRules)
        setSelectedChannels(defaultSelectedRuleIds(channelRules))
        setRulesJson(JSON.stringify(channelRules, null, 2))
        localStorage.removeItem('apkflow-channel-rules')
        setRuleEditMessage('已恢复默认规则。')
      }

      return (
        <section className="glass-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">渠道规则中心</h2>
              <p className="mt-1 text-sm text-slate-500">规则来自 JSON 配置；勾选规则后重新检测，报告会显示当前使用的渠道规则。</p>
            </div>
            <button type="button" onClick={analyze} disabled={loading || !file} className="btn-primary">使用当前规则重新检测</button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rules.map(rule => (
              <label key={rule.id} className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(rule.id)}
                    onChange={() => toggleChannel(rule.id)}
                    className="mt-3 h-4 w-4"
                  />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">{rule.logo}</div>
                  <div className="min-w-0"><div className="font-semibold text-slate-950">{rule.name}</div><div className="text-xs text-slate-500">{rule.id}</div></div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>arm64-v8a</span><b>{rule.requireArm64 ? '必须' : '可选'}</b></div>
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>targetSdk</span><b>≥ {rule.minTargetSdkVersion || rule.targetSdkMin}</b></div>
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>纯 32 位</span><b>{rule.allowPure32Bit ? '允许' : '不允许'}</b></div>
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>Debug</span><b>{rule.allowDebuggable ? '允许' : '不允许'}</b></div>
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>HTTP 明文</span><b>{rule.allowCleartextTraffic ? '可按需' : '不允许全局'}</b></div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-500">{rule.description}</p>
              </label>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-950">JSON 配置编辑</h3>
                <p className="mt-1 text-sm text-slate-500">支持新增或编辑规则；保存后本浏览器生效，并随重新检测提交给后端。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={applyRulesFromJson} className="btn-secondary">保存规则</button>
                <button type="button" onClick={resetRules} className="btn-secondary">恢复默认</button>
              </div>
            </div>
            <textarea
              value={rulesJson}
              onChange={event => setRulesJson(event.target.value)}
              className="mt-4 h-72 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-700 outline-none transition focus:border-slate-400"
              spellCheck={false}
            />
            {ruleEditMessage && <div className="mt-3 text-sm font-medium text-slate-600">{ruleEditMessage}</div>}
          </div>
        </section>
      )
    }

    if (activeView === 'reports') {
      const packageOptions = Array.from(new Set(reportRecords.map(item => item.packageName).filter(Boolean))) as string[]
      const filteredReports = reportRecords.filter(item => {
        const query = reportQuery.trim().toLowerCase()
        const matchesQuery = !query
          || item.fileName.toLowerCase().includes(query)
          || (item.packageName || '').toLowerCase().includes(query)
          || (item.versionName || '').toLowerCase().includes(query)
          || (item.reportId || '').toLowerCase().includes(query)
        const matchesStatus = reportStatusFilter === 'all' || item.status === reportStatusFilter
        const matchesPackage = reportPackageFilter === 'all' || item.packageName === reportPackageFilter
        return matchesQuery && matchesStatus && matchesPackage
      })
      const currentRecord = result ? toReportRecord({ result, source: 'current' }) : null
      const previousSamePackage = currentRecord
        ? reportRecords
          .filter(item => item.source === 'history' && item.packageName && item.packageName === currentRecord.packageName && item.reportId !== currentRecord.reportId)
          .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))[0]
        : null
      const reportDiff = currentRecord && previousSamePackage ? compareReports(currentRecord.result, previousSamePackage.result) : null

      return (
        <section className="glass-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">报告中心</h2>
              <p className="mt-1 text-sm text-slate-500">集中查看当前报告和本地历史报告，支持筛选、重新打开、复制和下载。</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">共 {reportRecords.length} 份报告</span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_220px]">
            <input
              value={reportQuery}
              onChange={event => setReportQuery(event.target.value)}
              placeholder="搜索包名、文件名、版本、报告编号"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            />
            <select
              value={reportStatusFilter}
              onChange={event => setReportStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="all">全部结论</option>
              <option value="passed">通过</option>
              <option value="failed">不通过</option>
              <option value="parse_error">解析失败</option>
            </select>
            <select
              value={reportPackageFilter}
              onChange={event => setReportPackageFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="all">全部包名</option>
              {packageOptions.map(pkg => <option key={pkg} value={pkg}>{pkg}</option>)}
            </select>
          </div>

          {reportDiff && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">同包名报告对比</h3>
                  <p className="mt-1 text-sm text-slate-500">当前报告与上一份同包名历史报告对比，只统计 fail / warning 问题。</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700">新增 {reportDiff.added.length}</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">已修复 {reportDiff.fixed.length}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">仍存在 {reportDiff.remaining.length}</span>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  ['新增问题', reportDiff.added],
                  ['已修复问题', reportDiff.fixed],
                  ['仍存在问题', reportDiff.remaining]
                ].map(([label, items]) => (
                  <div key={label as string} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-sm font-semibold text-slate-950">{label as string}</div>
                    <div className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
                      {(items as string[]).slice(0, 5).map(item => <div key={item}>- {item}</div>)}
                      {(items as string[]).length === 0 && <div>无</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-3">
            {filteredReports.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">当前筛选下暂无报告。</div>
            )}
            {filteredReports.map(item => (
              <article key={`${item.source}-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={statusClass(item.status)}>{item.conclusion}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{item.source === 'current' ? '当前报告' : '历史报告'}</span>
                    </div>
                    <h3 className="mt-3 truncate text-base font-semibold text-slate-950">{item.fileName}</h3>
                    <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                      <span>包名：{display(item.packageName)}</span>
                      <span>版本：{display(item.versionName)} / {display(item.versionCode)}</span>
                      <span>评分：{item.score === null ? '不可用' : item.score}</span>
                      <span>时间：{item.generatedAt}</span>
                      <span className="sm:col-span-2 lg:col-span-4">报告编号：{display(item.reportId)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700">严重 {item.criticalCount}</span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">风险 {item.warningCount}</span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">通过 {item.passCount}</span>
                    </div>
                  </div>
                  <div className="flex max-w-full flex-wrap gap-2">
                    <button onClick={() => { setResult(item.result); setActiveView('dashboard') }} className="btn-primary btn-sm">打开报告</button>
                    <button onClick={() => downloadText(reportDownloadName(item.result, 'html'), item.result.htmlReport || item.result.fullReportText || '', 'text/html;charset=utf-8')} className="btn-secondary btn-sm">下载报告</button>
                    <button onClick={() => downloadText(reportDownloadName(item.result, 'md'), item.result.markdownReport || item.result.fullReportText || '', 'text/markdown;charset=utf-8')} className="btn-secondary btn-sm">下载 Markdown</button>
                    <button onClick={() => downloadText(reportDownloadName(item.result, 'json'), JSON.stringify(item.result, null, 2))} className="btn-secondary btn-sm">下载 JSON</button>
                    <CopyButton text={item.result.developerMessage || ''} label="复制研发整改说明" variant="light" size="sm" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )
    }

    if (activeView === 'settings') {
      return (
        <section className="glass-card p-5">
          <h2 className="text-lg font-semibold text-slate-950">系统设置</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-950">部署模式</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Vercel 只部署前端和 PWA。大 APK 检测必须走支持系统命令和大文件上传的独立后端。</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-950">上传限制</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{process.env.NEXT_PUBLIC_ANALYZE_API_URL ? '独立检测后端默认限制 500MB。' : '当前 Vercel 演示环境最大支持 4MB。'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-950">检测引擎</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">当前状态：{engineMessage}。完整模式需要 unzip、aapt、apksigner、strings 均可用。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ToolBadge label="unzip" ok={engineHealth?.tools?.unzip} />
                <ToolBadge label="aapt" ok={engineHealth?.tools?.aapt} />
                <ToolBadge label="apksigner" ok={engineHealth?.tools?.apksigner} />
                <ToolBadge label="strings" ok={engineHealth?.tools?.strings} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-950">安全边界</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">只做静态分析，不安装 APK，不启动游戏，不执行 APK 内代码。</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 md:col-span-2">
              <h3 className="font-semibold text-slate-950">接口诊断</h3>
              <p className="mt-2 break-all text-sm leading-6 text-slate-500">Analyze API：{analyzeApiUrl()}</p>
              <p className="mt-1 break-all text-sm leading-6 text-slate-500">Health API：{healthApiUrl()}</p>
              {healthError && <p className="mt-2 text-sm font-semibold text-rose-600">健康检查错误：{healthError}</p>}
            </div>
          </div>
        </section>
      )
    }

    const uploadShell = file || result ? (
      <div className="glass-card p-3">
        {renderUploadPanel()}
        {error && <div className="mt-3 whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium leading-6 text-rose-700">{error}</div>}
      </div>
    ) : (
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="status-info">APK 上传</div>
            <h2 className="mt-3 break-words text-xl font-semibold tracking-tight text-slate-950">检测工作台</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">上传 APK 后自动生成多渠道提交前检测报告；解析失败时只显示失败原因和重新上传建议。</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">当前模式：{healthChecked ? engineText(engineMode) : '状态检查中'}</span>
        </div>
        <div className="mt-5">{renderUploadPanel()}</div>
        {error && <div className="mt-4 whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium leading-6 text-rose-700">{error}</div>}
      </div>
    )

    return (
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          {uploadShell}

          {result ? (
            <ResultDashboard result={result} />
          ) : (
            <div className="glass-card p-5">
              <h3 className="text-lg font-semibold text-slate-950">检测完成后将优先展示结论总览</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">结果页会按严重问题、一般风险、通过项和解析失败项分组，并支持单个问题复制给研发。</p>
            </div>
          )}
        </div>

        <div className="min-w-0">{renderAuxiliaryRail()}</div>
      </section>
    )
  }

  const nav = [
    ['dashboard', '检测工作台'],
    ['history', '历史记录'],
    ['rules', '渠道规则'],
    ['reports', '报告中心'],
    ['settings', '系统设置']
  ] as const

  return (
    <main className="min-h-screen px-4 pb-4 pt-6 lg:px-6 lg:pb-6 lg:pt-7">
      <div className="mx-auto grid max-w-[1420px] gap-4 lg:grid-cols-[184px_1fr]">
        <aside className="sticky top-7 hidden self-start rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">A</div>
            <div><div className="text-sm font-semibold text-slate-950">APKFlow</div><div className="text-[11px] text-slate-500">Channel QA</div></div>
          </div>
          <nav className="mt-5 space-y-1">
            {nav.map(([key, label]) => (
              <button key={key} onClick={() => setActiveView(key)} className={classNames('nav-item w-full', activeView === key && 'nav-item-active')}>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">APK CHANNEL PRECHECK</div>
              <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950 md:text-[28px]">APKFlow 渠道提审检测平台</h1>
              <p className="mt-2 text-sm text-slate-500">上传 APK 后自动生成多渠道提交前检测报告</p>
            </div>
            <button type="button" onClick={() => setDiagnosticsOpen(open => !open)} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-white sm:w-auto">
              <div className={classNames('h-2.5 w-2.5 rounded-full', !healthChecked ? 'bg-amber-500' : engineMode === 'full' ? 'bg-emerald-500' : engineMode === 'degraded' ? 'bg-amber-500' : 'bg-rose-500')} />
              <div>
                <div className="text-xs text-slate-500">检测服务</div>
                <div className="text-sm font-semibold text-slate-900">{engineMessage}</div>
                <div className="mt-0.5 text-xs text-slate-500">{healthChecked ? engineText(engineMode) : '状态检查中'}</div>
              </div>
            </button>
            </div>
          </header>

          <div className="mb-6 flex gap-2 overflow-auto lg:hidden">
            {nav.map(([key, label]) => (
              <button key={key} onClick={() => setActiveView(key)} className={classNames('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold shadow-sm', activeView === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600')}>
                {label}
              </button>
            ))}
          </div>

          {diagnosticsOpen && renderDiagnostics()}

          {renderContent()}
        </section>
      </div>
    </main>
  )
}
