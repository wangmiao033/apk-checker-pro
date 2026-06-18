'use client'

import { useMemo, useState } from 'react'
import { CopyButton } from './CopyButton'
import {
  TEST_RELEASE_UPLOAD_ACCEPT,
  defaultTestReleaseInfo,
  normalizeTestReleaseInfo,
  testReleasePagePath,
  testReleaseShareText,
  testSubmissionApiUrl,
  uploadTestReleaseFile,
  type TestReleaseInfo
} from '@/lib/testRelease'

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  required = false
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-400"
      />
    </label>
  )
}

export function TestSubmissionPage() {
  const [form, setForm] = useState<TestReleaseInfo>(() => normalizeTestReleaseInfo({
    ...defaultTestReleaseInfo,
    source: 'submission',
    status: '待处理',
    testType: '外部提测登记',
    notice: '本提测信息由提交方登记，请运营确认 APK 下载地址、版本和测试范围后再同步测试人员。'
  }))
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadMessage, setUploadMessage] = useState('')
  const [error, setError] = useState('')
  const [created, setCreated] = useState<TestReleaseInfo | null>(null)

  const pageUrl = useMemo(() => {
    if (!created?.id) return ''
    if (typeof window === 'undefined') return testReleasePagePath(created)
    return new URL(testReleasePagePath(created), window.location.origin).toString()
  }, [created])

  function update<K extends keyof TestReleaseInfo>(key: K, value: TestReleaseInfo[K]) {
    setForm(prev => normalizeTestReleaseInfo({ ...prev, [key]: value }))
  }

  async function uploadApk(file: File | null) {
    if (!file) return
    setError('')
    setUploadMessage('')
    setUploading(true)
    setUploadProgress(0)
    try {
      const uploaded = await uploadTestReleaseFile(file, setUploadProgress)
      setForm(prev => normalizeTestReleaseInfo({
        ...prev,
        apkUrl: uploaded.apkUrl,
        apkSize: uploaded.apkSize,
        updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        productName: prev.productName || uploaded.fileName.replace(/\.apk$/i, '')
      }))
      setUploadMessage(`APK 已上传：${uploaded.fileName}，下载地址已自动填入。`)
    } catch (err: any) {
      setError(err?.message || 'APK 上传失败，请稍后重试。')
    } finally {
      setUploading(false)
      window.setTimeout(() => setUploadProgress(0), 800)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!form.productName.trim()) {
      setError('请填写游戏或产品名称。')
      return
    }
    if (!form.apkUrl.trim()) {
      setError('请先上传 APK，或手动填写 APK 下载地址。')
      return
    }
    if (!form.submitterName.trim() || !form.submitterContact.trim()) {
      setError('请填写提交人和联系方式，方便运营回访确认。')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(testSubmissionApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(json?.error || '提交失败，请稍后重试。')
      setCreated(normalizeTestReleaseInfo(json.item || json))
    } catch (err: any) {
      setError(err?.message || '提交失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  if (created) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <span className="status-pass">提交成功</span>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">已进入 APKFlow 提测存档</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">运营可在后台“提测”页面查看、编辑、归档，并同步给测试人员下载。</p>
          <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">提测编号：</span><b>{created.id}</b></div>
            <div><span className="text-slate-500">状态：</span><b>{created.status}</b></div>
            <div><span className="text-slate-500">产品：</span><b>{created.productName}</b></div>
            <div><span className="text-slate-500">下载次数：</span><b>{created.downloadCount || 0}</b></div>
          </div>
          <div className="mt-5 break-all rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">{pageUrl}</div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={pageUrl} className="btn-primary">打开提测页</a>
            <CopyButton text={pageUrl} label="复制提测链接" variant="light" />
            <CopyButton text={testReleaseShareText(created, pageUrl)} label="复制提测说明" variant="light" />
            <a href="/" className="btn-secondary">返回 APKFlow</a>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 lg:py-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">APKFLOW TEST SUBMISSION</div>
              <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950 md:text-[28px]">游戏提测登记</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">填写产品介绍、APK 下载地址和测试范围，生成可给测试方打开的提测下载页。</p>
            </div>
            <a href="/" className="btn-secondary">返回检测平台</a>
          </div>
        </header>

        <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">上传 APK 生成下载地址</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">直接上传提测包，系统会自动生成 APK 下载地址并填入下方。也可以不上传，手动填写已有网盘/CDN/对象存储链接。</p>
                </div>
                <label className={classNames('btn-primary cursor-pointer', uploading && 'pointer-events-none opacity-60')}>
                  {uploading ? `上传中 ${uploadProgress}%` : '选择 APK 上传'}
                  <input
                    type="file"
                    accept={TEST_RELEASE_UPLOAD_ACCEPT}
                    className="hidden"
                    onChange={event => uploadApk(event.target.files?.[0] || null)}
                  />
                </label>
              </div>
              {uploading && (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
              {uploadMessage && <div className="mt-3 break-all rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{uploadMessage}</div>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="游戏 / 产品名称" value={form.productName} onChange={value => update('productName', value)} required />
              <Field label="版本号" value={form.versionName} onChange={value => update('versionName', value)} placeholder="例如 v1.0.3" />
              <Field label="包名" value={form.packageName} onChange={value => update('packageName', value)} placeholder="com.example.game" />
              <Field label="Build" value={form.buildNo} onChange={value => update('buildNo', value)} />
              <Field label="APK 下载地址" value={form.apkUrl} onChange={value => update('apkUrl', value)} placeholder="上传 APK 后自动生成，也可手动填写 https://..." required />
              <Field label="APK 大小" value={form.apkSize} onChange={value => update('apkSize', value)} placeholder="例如 312 MB" />
              <Field label="提交人" value={form.submitterName} onChange={value => update('submitterName', value)} required />
              <Field label="联系方式" value={form.submitterContact} onChange={value => update('submitterContact', value)} placeholder="微信 / 手机 / 邮箱" required />
            </div>

            <div className="mt-5 grid gap-4">
              <TextArea label="游戏产品介绍" value={form.intro} onChange={value => update('intro', value)} placeholder="一句话说明游戏类型、题材、核心玩法和测试背景。" required />
              <TextArea label="本轮测试重点" value={form.testScope} onChange={value => update('testScope', value)} placeholder="例如安装、登录、支付、渠道 SDK、核心关卡、兼容性。" />
              <TextArea label="更新内容" value={form.changelog} onChange={value => update('changelog', value)} rows={3} />
              <TextArea label="安装说明 / 测试备注" value={form.installGuide} onChange={value => update('installGuide', value)} rows={3} />
              <TextArea
                label="产品截图 URL"
                value={form.screenshots.join('\n')}
                onChange={value => update('screenshots', value.split('\n').map(item => item.trim()).filter(Boolean))}
                placeholder="每行一个图片 URL，可不填。"
                rows={3}
              />
            </div>
          </section>

          <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
            <h2 className="text-base font-semibold text-slate-950">提交说明</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>推荐直接在左侧上传 APK，系统会生成下载地址。已有对象存储、CDN、企业网盘直链时，也可以手动填写。</p>
              <p>下载次数只统计通过 APKFlow 提测页下载按钮或复制的下载链接产生的访问。</p>
              <p>登记后会进入后台提测存档，运营可继续编辑信息或归档。</p>
            </div>
            {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}
            <button type="submit" disabled={submitting || uploading} className={classNames('btn-primary mt-5 w-full', (submitting || uploading) && 'opacity-60')}>
              {uploading ? 'APK 上传中...' : submitting ? '提交中...' : '提交提测登记'}
            </button>
          </aside>
        </form>
      </div>
    </main>
  )
}
