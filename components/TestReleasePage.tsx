'use client'

import { useEffect, useMemo, useState } from 'react'
import { CopyButton } from './CopyButton'
import {
  absoluteUrl,
  decodeTestReleaseInfo,
  normalizeTestReleaseInfo,
  testReleaseApiBase,
  testReleaseDownloadUrl,
  testReleaseShareText,
  type TestReleaseInfo
} from '@/lib/testRelease'

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '未填写'
  return String(value)
}

function statusClass(status: string) {
  if (status.includes('完成') || status.includes('通过')) return 'status-pass'
  if (status.includes('暂停') || status.includes('废弃')) return 'status-fail'
  if (status.includes('测试中')) return 'status-warn'
  return 'status-info'
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-900">{display(value)}</div>
    </div>
  )
}

function TextBlock({ title, children }: { title: string; children: string }) {
  if (!children) return null
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{children}</p>
    </section>
  )
}

export function TestReleasePage() {
  const [info, setInfo] = useState<TestReleaseInfo | null>(null)
  const [pageUrl, setPageUrl] = useState('')
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setPageUrl(window.location.href)
    setOrigin(window.location.origin)
    const parts = window.location.pathname.split('/').filter(Boolean)
    const pathId = parts[0] === 'test' && parts[1] ? decodeURIComponent(parts[1]) : ''
    const queryId = params.get('id') || ''
    const releaseId = pathId || queryId

    if (releaseId) {
      fetch(`${testReleaseApiBase()}/${encodeURIComponent(releaseId)}`, { cache: 'no-store' })
        .then(async res => {
          const json = await res.json().catch(() => null)
          if (!res.ok) throw new Error(json?.error || '提测信息加载失败')
          return json
        })
        .then(json => {
          setInfo(normalizeTestReleaseInfo(json.item || json))
          setLoadError('')
        })
        .catch((error: any) => {
          setInfo(null)
          setLoadError(error?.message || '提测信息加载失败')
        })
        .finally(() => setLoading(false))
      return
    }

    setInfo(decodeTestReleaseInfo(params.get('data')))
    setLoading(false)
  }, [])

  const shareText = useMemo(() => info ? testReleaseShareText(info, pageUrl) : '', [info, pageUrl])
  const downloadUrl = useMemo(() => info ? absoluteUrl(testReleaseDownloadUrl(info), origin) : '', [info, origin])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="status-info mx-auto w-fit">加载中</div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">正在读取提测信息</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">请稍候，系统正在加载产品介绍和 APK 下载入口。</p>
        </section>
      </main>
    )
  }

  if (!info) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="status-warn mx-auto w-fit">提测信息不可用</div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">未找到有效的提测页面</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{loadError || '请确认分享链接完整，或联系提测负责人重新生成链接。'}</p>
          <a href="/" className="btn-secondary mt-6">返回 APKFlow</a>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 lg:py-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">APKFlow Test Release</div>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-950 md:text-[28px]">{info.productName || '未命名产品'}</h1>
                <p className="mt-2 text-sm text-slate-500">内部提测下载页</p>
              </div>
              <span className={statusClass(info.status)}>{info.status || '待测试'}</span>
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
                {info.intro || '暂无产品介绍。'}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="版本" value={info.versionName} />
                <Field label="Build" value={info.buildNo} />
                <Field label="包名" value={info.packageName} />
                <Field label="APK 大小" value={info.apkSize} />
                <Field label="测试类型" value={info.testType} />
                <Field label="更新时间" value={info.updatedAt} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-950">APK 下载</div>
              <p className="mt-2 text-xs leading-5 text-slate-500">请使用 Android 设备打开，或复制链接到测试设备下载。</p>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900">
                已下载 {Number(info.downloadCount || 0)} 次
              </div>
              {downloadUrl ? (
                <a href={downloadUrl} target="_blank" rel="noreferrer" className="btn-primary mt-4 w-full">下载 APK</a>
              ) : (
                <button type="button" disabled className="btn-primary mt-4 w-full">未配置下载地址</button>
              )}
              <CopyButton text={downloadUrl || pageUrl} label="复制下载链接" variant="light" className="mt-3 w-full" />
              <CopyButton text={shareText} label="复制提测说明" variant="light" className="mt-3 w-full" />
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500">
                负责人：{display(info.owner)}{info.ownerContact ? ` / ${info.ownerContact}` : ''}
                <div className="mt-2">统计说明：仅统计通过本页下载按钮或复制的下载链接产生的访问。</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <TextBlock title="测试重点" >{info.testScope}</TextBlock>
          <TextBlock title="更新内容" >{info.changelog}</TextBlock>
          <TextBlock title="安装说明" >{info.installGuide}</TextBlock>
          <TextBlock title="注意事项" >{info.notice}</TextBlock>
        </div>

        {info.screenshots.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">产品截图</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {info.screenshots.map(src => (
                <div key={src} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img src={src} alt={`${info.productName} 截图`} className="aspect-video w-full object-cover" />
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="pb-4 text-center text-xs text-slate-500">APKFlow 提测分发 · 仅供内部测试</footer>
      </div>
    </main>
  )
}
