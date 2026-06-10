'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { channelRules } from '@/lib/channelRules'
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
  const [selectedChannels, setSelectedChannels] = useState(channelRules.map(rule => rule.id))
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [engineMode, setEngineMode] = useState<EngineMode>('unavailable')
  const [engineMessage, setEngineMessage] = useState('检测服务状态检查中')
  const [engineHealth, setEngineHealth] = useState<EngineHealth | null>(null)
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
        setHealthError('')
      })
      .catch((err: any) => {
        if (!alive) return
        setEngineMode('unavailable')
        setEngineMessage('检测服务暂不可用，请稍后重试')
        setEngineHealth(null)
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
          <div>检测模式：{engineText(engineMode)}</div>
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

    return (
      <aside className="glass-card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-950">辅助信息</div>
          <div className="mt-1 text-xs text-slate-500">默认收起非主流程内容</div>
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
          <p className="px-4 pb-4 text-sm leading-6 text-slate-500">部署到 HTTPS 后，可添加到桌面使用。</p>
        </details>
      </aside>
    )
  }

  function renderContent() {
    if (activeView === 'history') {
      return (
        <section className="glass-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">检测历史</h2>
              <p className="mt-1 text-sm text-slate-500">历史记录保存在当前浏览器本地，最多保留 50 条。</p>
            </div>
            <button onClick={() => { setHistory([]); localStorage.removeItem('apkflow-history') }} className="btn-secondary">清空历史</button>
          </div>
          <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="p-4">APK</th><th className="p-4">状态</th><th className="p-4">评分</th><th className="p-4">时间</th><th className="p-4">操作</th></tr>
              </thead>
              <tbody>
                {history.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">暂无历史记录</td></tr>}
                {history.map(item => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="max-w-[360px] truncate p-4 font-semibold">{item.fileName}</td>
                    <td className="p-4"><span className={item.status === 'passed' ? 'status-pass' : item.status === 'parse_error' ? 'status-warn' : 'status-fail'}>{item.summary}</span></td>
                    <td className="p-4 font-bold">{item.score === null ? '不可用' : item.score}</td>
                    <td className="p-4 text-slate-500">{item.generatedAt}</td>
                    <td className="p-4"><button onClick={() => { setResult(item.result); setActiveView('dashboard') }} className="btn-primary btn-sm">查看报告</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )
    }

    if (activeView === 'rules') {
      return (
        <section className="glass-card p-5">
          <h2 className="text-lg font-semibold text-slate-950">渠道规则中心</h2>
          <p className="mt-1 text-sm text-slate-500">当前规则版本以静态配置维护，后续可升级为数据库或后台配置。</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {channelRules.map(rule => (
              <div key={rule.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">{rule.logo}</div>
                  <div><div className="font-semibold text-slate-950">{rule.name}</div><div className="text-xs text-slate-500">{rule.id}</div></div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>arm64-v8a</span><b>{rule.requireArm64 ? '必须' : '可选'}</b></div>
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>targetSdk</span><b>≥ {rule.targetSdkMin}</b></div>
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>纯 32 位</span><b>{rule.allowPure32Bit ? '允许' : '不允许'}</b></div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-500">{rule.description}</p>
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (activeView === 'reports') {
      return (
        <section className="glass-card p-5">
          <h2 className="text-lg font-semibold text-slate-950">报告中心</h2>
          <p className="mt-1 text-sm text-slate-500">检测完成后可复制完整报告、研发整改说明、运营话术，也可下载报告文件。</p>
          {!result ? (
            <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">暂无可下载报告，请先上传 APK 完成检测。</div>
          ) : (
            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap gap-2">
                <CopyButton text={result.fullReportText || result.markdownReport || JSON.stringify(result, null, 2)} label="复制完整报告" variant="light" />
                <CopyButton text={result.developerMessage || ''} label="复制研发整改说明" variant="light" />
                <CopyButton text={result.operationMessage || ''} label="复制运营话术" variant="light" />
                <button onClick={() => downloadText('apkflow-channel-report.html', result.htmlReport || result.fullReportText || '', 'text/html;charset=utf-8')} className="btn-secondary">下载报告</button>
                <button onClick={() => downloadText('apkflow-report.md', result.markdownReport || result.fullReportText || '', 'text/markdown;charset=utf-8')} className="btn-secondary">下载 Markdown</button>
                <button onClick={() => downloadText('apkflow-report.json', JSON.stringify(result, null, 2))} className="btn-secondary">下载 JSON</button>
              </div>
              <p className="mt-3 text-sm text-slate-500">报告导出入口也会在检测工作台报告底部保留。</p>
            </div>
          )}
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
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">当前模式：{engineText(engineMode)}</span>
        </div>
        <div className="mt-5">{renderUploadPanel()}</div>
        {error && <div className="mt-4 whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium leading-6 text-rose-700">{error}</div>}
      </div>
    )

    return (
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
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
      <div className="mx-auto grid max-w-[1360px] gap-5 lg:grid-cols-[208px_1fr]">
        <aside className="sticky top-7 hidden h-[calc(100vh-56px)] rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">A</div>
            <div><div className="text-sm font-semibold text-slate-950">APKFlow</div><div className="text-[11px] text-slate-500">Channel QA</div></div>
          </div>
          <nav className="mt-6 space-y-1">
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
              <div className={classNames('h-2.5 w-2.5 rounded-full', engineMode === 'full' ? 'bg-emerald-500' : engineMode === 'degraded' ? 'bg-amber-500' : 'bg-rose-500')} />
              <div>
                <div className="text-xs text-slate-500">检测服务</div>
                <div className="text-sm font-semibold text-slate-900">{engineMessage}</div>
                <div className="mt-0.5 text-xs text-slate-500">{engineText(engineMode)}</div>
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
