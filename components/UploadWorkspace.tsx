'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { channelRules } from '@/lib/channelRules'
import { ResultDashboard } from './ResultDashboard'

type EngineMode = 'full' | 'degraded' | 'unavailable'
type ViewKey = 'dashboard' | 'history' | 'rules' | 'reports' | 'settings'

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

function engineText(mode: EngineMode) {
  if (mode === 'full') return '完整检测模式'
  if (mode === 'degraded') return '降级检测模式'
  return '检测引擎异常'
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
  const [engineMessage, setEngineMessage] = useState('检测引擎异常')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    const raw = localStorage.getItem('apkflow-history')
    if (raw) {
      try { setHistory(JSON.parse(raw)) } catch {}
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch(healthApiUrl())
      .then(res => res.json())
      .then(json => {
        if (!alive) return
        const mode = (json.mode || 'unavailable') as EngineMode
        setEngineMode(mode)
        setEngineMessage(json.message || engineText(mode))
      })
      .catch(() => {
        if (!alive) return
        setEngineMode('unavailable')
        setEngineMessage('检测引擎异常')
      })
    return () => { alive = false }
  }, [])

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
    setFile(nextFile)
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

    const form = new FormData()
    form.append('file', file)
    form.append('channels', JSON.stringify(selectedChannels))

    try {
      const response = await fetch(analyzeApiUrl(), { method: 'POST', body: form })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '检测失败')

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
    }
  }

  function renderUploadPanel() {
    if (result && file) {
      return (
        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">当前 APK</div>
              <div className="mt-1 max-w-[520px] truncate text-lg font-black">{file.name}</div>
              <div className="mt-1 text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>重新上传</button>
              <button type="button" className="btn-primary" onClick={analyze} disabled={loading}>{loading ? '检测中...' : '重新检测'}</button>
              <button type="button" className="btn-secondary" onClick={() => downloadText('apkflow-report.json', JSON.stringify(result, null, 2))}>下载报告</button>
            </div>
          </div>
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
          'mt-6 cursor-pointer rounded-[2rem] border-2 border-dashed p-10 text-center transition',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white'
        )}
      >
        <input ref={inputRef} type="file" accept=".apk" className="hidden" onChange={event => chooseFile(event.target.files?.[0] || null)} />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-3xl text-white">APK</div>
        <div className="mt-5 text-lg font-black">{file ? file.name : '点击或拖拽 APK 到这里'}</div>
        <div className="mt-2 text-sm text-slate-500">
          {process.env.NEXT_PUBLIC_ANALYZE_API_URL ? '独立检测后端最大支持 500MB' : '当前演示环境最大支持 4MB'}
        </div>
      </div>
    )
  }

  function renderContent() {
    if (activeView === 'history') {
      return (
        <section className="glass-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">检测历史</h2>
              <p className="mt-1 text-sm text-slate-500">历史记录保存在当前浏览器本地，最多保留 50 条。</p>
            </div>
            <button onClick={() => { setHistory([]); localStorage.removeItem('apkflow-history') }} className="btn-secondary">清空历史</button>
          </div>
          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
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
                    <td className="p-4"><button onClick={() => { setResult(item.result); setActiveView('dashboard') }} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">查看报告</button></td>
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
        <section className="glass-card p-6">
          <h2 className="text-2xl font-black">渠道规则中心</h2>
          <p className="mt-1 text-sm text-slate-500">当前规则版本以静态配置维护，后续可升级为数据库或后台配置。</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {channelRules.map(rule => (
              <div key={rule.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white">{rule.logo}</div>
                  <div><div className="font-black">{rule.name}</div><div className="text-xs text-slate-500">{rule.id}</div></div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2"><span>arm64-v8a</span><b>{rule.requireArm64 ? '必须' : '可选'}</b></div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2"><span>targetSdk</span><b>≥ {rule.targetSdkMin}</b></div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-3 py-2"><span>纯 32 位</span><b>{rule.allowPure32Bit ? '允许' : '不允许'}</b></div>
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
        <section className="glass-card p-6">
          <h2 className="text-2xl font-black">报告中心</h2>
          <p className="mt-1 text-sm text-slate-500">检测完成后可下载 JSON 或 HTML 检测报告。</p>
          {!result ? (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">暂无可下载报告，请先上传 APK 完成检测。</div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <button onClick={() => downloadText('apkflow-report.json', JSON.stringify(result, null, 2))} className="rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-glass">
                <div className="text-lg font-black">JSON 检测报告</div>
                <div className="mt-2 text-sm text-slate-500">适合研发系统、CI/CD 或二次解析。</div>
              </button>
              <button onClick={() => downloadText('apkflow-channel-report.html', result.htmlReport, 'text/html;charset=utf-8')} className="rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-glass">
                <div className="text-lg font-black">HTML 检测报告</div>
                <div className="mt-2 text-sm text-slate-500">适合发送给研发、运营、管理层查看。</div>
              </button>
            </div>
          )}
        </section>
      )
    }

    if (activeView === 'settings') {
      return (
        <section className="glass-card p-6">
          <h2 className="text-2xl font-black">系统设置</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="font-black">部署模式</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Vercel 只部署前端和 PWA。大 APK 检测必须走支持系统命令和大文件上传的独立后端。</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="font-black">上传限制</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{process.env.NEXT_PUBLIC_ANALYZE_API_URL ? '独立检测后端默认限制 500MB。' : '当前 Vercel 演示环境最大支持 4MB。'}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="font-black">检测引擎</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">当前状态：{engineMessage}。完整模式需要 unzip、aapt、apksigner、strings 均可用。</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h3 className="font-black">安全边界</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">只做静态分析，不安装 APK，不启动游戏，不执行 APK 内代码。</p>
            </div>
          </div>
        </section>
      )
    }

    return (
      <>
        <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
          <div className="glass-card overflow-hidden p-6">
            <div className="status-info">APK 静态机审分析</div>
            <h2 className="mt-4 text-3xl font-black tracking-tight">上传 APK，自动生成多渠道提交前检测报告</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">优先保证检测可信度：当当前环境无法完整解析 APK 时，系统会返回解析失败，而不是输出误导性的渠道不通过结论。</p>
            {renderUploadPanel()}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {!result && <button onClick={analyze} disabled={loading} className="btn-primary">{loading ? '检测中，请稍候...' : '开始检测'}</button>}
              <button onClick={() => { setFile(null); setResult(null); setError('') }} className="btn-secondary">重置</button>
              {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}
            </div>
          </div>

          <div className="dark-card relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-radial-blue opacity-70" />
            <div className="relative">
              <div className="text-sm text-slate-300">Workspace Overview</div>
              <h3 className="mt-3 text-2xl font-black">渠道包质量工作台</h3>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-3xl bg-white/10 p-4 backdrop-blur"><div className="text-sm text-slate-300">历史检测</div><div className="mt-2 text-3xl font-black">{stats.total}</div></div>
                <div className="rounded-3xl bg-white/10 p-4 backdrop-blur"><div className="text-sm text-slate-300">通过</div><div className="mt-2 text-3xl font-black text-emerald-300">{stats.passed}</div></div>
                <div className="rounded-3xl bg-white/10 p-4 backdrop-blur"><div className="text-sm text-slate-300">不通过</div><div className="mt-2 text-3xl font-black text-rose-300">{stats.failed}</div></div>
                <div className="rounded-3xl bg-white/10 p-4 backdrop-blur"><div className="text-sm text-slate-300">解析失败</div><div className="mt-2 text-3xl font-black text-amber-200">{stats.parseErrors}</div></div>
              </div>
              <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-4">
                <div className="text-sm font-semibold">当前检测重点</div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <div>arm64-v8a 64 位包体</div>
                  <div>targetSdkVersion 达标判定</div>
                  <div>签名、HTTP、权限、Debug 风险</div>
                  <div>解析失败时不输出误导性结论</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {result ? <div className="mt-6"><ResultDashboard result={result} /></div> : null}
      </>
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
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto grid max-w-[1580px] gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="sticky top-6 hidden h-[calc(100vh-48px)] rounded-[2rem] bg-slate-950 p-5 text-white shadow-glow lg:block">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-emerald-400 text-lg font-black">A</div>
            <div><div className="text-lg font-black">APKFlow</div><div className="text-xs text-slate-400">Channel QA Platform</div></div>
          </div>
          <nav className="mt-8 space-y-2">
            {nav.map(([key, label]) => (
              <button key={key} onClick={() => setActiveView(key)} className={classNames('nav-item w-full', activeView === key && 'nav-item-active')}>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="absolute bottom-5 left-5 right-5 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold">PWA Ready</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">部署到 HTTPS 后，可添加到桌面使用。</p>
          </div>
        </aside>

        <section>
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-blue-700">APK CHANNEL PRECHECK</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">APKFlow 渠道提审检测平台</h1>
            </div>
            <div className="flex items-center gap-3 rounded-3xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
              <div className={classNames('h-2.5 w-2.5 rounded-full', engineMode === 'full' ? 'bg-emerald-500' : engineMode === 'degraded' ? 'bg-amber-500' : 'bg-rose-500')} />
              <div className="text-sm font-semibold">{engineMessage}</div>
            </div>
          </header>

          <div className="mb-6 flex gap-2 overflow-auto lg:hidden">
            {nav.map(([key, label]) => (
              <button key={key} onClick={() => setActiveView(key)} className={classNames('rounded-2xl px-4 py-2 text-sm font-semibold', activeView === key ? 'bg-slate-950 text-white' : 'bg-white text-slate-600')}>
                {label}
              </button>
            ))}
          </div>

          {renderContent()}
        </section>
      </div>
    </main>
  )
}
