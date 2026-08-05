'use client'

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import { uploadTestReleaseFile, type TestReleaseFileUploadResult } from '@/lib/testRelease'

type MultipartInit = {
  key: string
  uploadId: string
  partSize: number
  concurrency: number
}

type UploadMode = 'checking' | 'multipart' | 'legacy'

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

function formatSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
  return `${formatBytes(bytesPerSecond)}/s`
}

function isApk(file: File | null) {
  return Boolean(file && file.name.toLowerCase().endsWith('.apk'))
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function requestJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const raw = await response.text()
  let json: any = null
  try { json = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok) throw new Error(json?.error || raw || `请求失败：HTTP ${response.status}`)
  return json as T
}

function uploadPart(url: string, data: Blob, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.timeout = 30 * 60 * 1000
    xhr.upload.onprogress = event => onProgress(event.loaded)
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`分片上传失败：HTTP ${xhr.status}`))
        return
      }
      const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag')
      if (!etag) {
        reject(new Error('R2 未向浏览器暴露 ETag，请在存储桶 CORS 中加入 ExposeHeaders: ETag。'))
        return
      }
      onProgress(data.size)
      resolve(etag)
    }
    xhr.onerror = () => reject(new Error('分片上传网络中断。'))
    xhr.ontimeout = () => reject(new Error('分片上传超时。'))
    xhr.send(data)
  })
}

async function multipartUpload(
  file: File,
  onProgress: (percent: number, uploadedBytes: number) => void
): Promise<TestReleaseFileUploadResult> {
  const init = await requestJson<MultipartInit>('/api/r2-multipart/init', {
    fileName: file.name,
    size: file.size,
    contentType: file.type || 'application/vnd.android.package-archive'
  })

  const totalParts = Math.ceil(file.size / init.partSize)
  const loadedByPart = new Array(totalParts).fill(0)
  const completed: Array<{ partNumber: number; etag: string }> = []
  let cursor = 0

  const updateOverall = () => {
    const uploadedBytes = loadedByPart.reduce((sum, value) => sum + value, 0)
    const percent = Math.min(99, Math.round((uploadedBytes / file.size) * 100))
    onProgress(percent, uploadedBytes)
  }

  async function worker() {
    while (true) {
      const partIndex = cursor
      cursor += 1
      if (partIndex >= totalParts) return

      const partNumber = partIndex + 1
      const start = partIndex * init.partSize
      const end = Math.min(file.size, start + init.partSize)
      const blob = file.slice(start, end)
      const signed = await requestJson<{ url: string }>('/api/r2-multipart/sign-part', {
        key: init.key,
        uploadId: init.uploadId,
        partNumber
      })
      const etag = await uploadPart(signed.url, blob, loaded => {
        loadedByPart[partIndex] = loaded
        updateOverall()
      })
      completed.push({ partNumber, etag })
    }
  }

  try {
    const concurrency = Math.max(1, Math.min(init.concurrency || 6, totalParts))
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    const result = await requestJson<{ apkUrl: string }>('/api/r2-multipart/complete', {
      key: init.key,
      uploadId: init.uploadId,
      parts: completed
    })
    onProgress(100, file.size)
    return {
      fileName: file.name,
      apkUrl: result.apkUrl,
      apkSize: formatBytes(file.size),
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString()
    }
  } catch (error) {
    requestJson('/api/r2-multipart/abort', { key: init.key, uploadId: init.uploadId }).catch(() => {})
    throw error
  }
}

export function FileShareUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<TestReleaseFileUploadResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [mode, setMode] = useState<UploadMode>('checking')

  function captureFile(nextFile: File | null) {
    if (!nextFile || !isApk(nextFile)) return
    setFile(nextFile)
    setResult(null)
    setProgress(0)
    setUploadedBytes(0)
    setSpeed(0)
    setError('')
    setCopied(false)
  }

  useEffect(() => {
    fetch('/api/r2-multipart/status', { cache: 'no-store' })
      .then(response => response.json())
      .then(json => setMode(json?.configured ? 'multipart' : 'legacy'))
      .catch(() => setMode('legacy'))

    function captureChange(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) || target.type !== 'file') return
      captureFile(target.files?.[0] || null)
    }
    function captureDrop(event: Event) {
      const dragEvent = event as globalThis.DragEvent
      captureFile(dragEvent.dataTransfer?.files?.[0] || null)
    }
    document.addEventListener('change', captureChange, true)
    document.addEventListener('drop', captureDrop, true)
    return () => {
      document.removeEventListener('change', captureChange, true)
      document.removeEventListener('drop', captureDrop, true)
    }
  }, [])

  async function upload() {
    if (!file || uploading) return
    setUploading(true)
    setError('')
    setResult(null)
    setProgress(0)
    setUploadedBytes(0)
    setSpeed(0)
    const startedAt = Date.now()

    try {
      const item = mode === 'multipart'
        ? await multipartUpload(file, (percent, bytes) => {
            setProgress(percent)
            setUploadedBytes(bytes)
            const seconds = Math.max(0.2, (Date.now() - startedAt) / 1000)
            setSpeed(bytes / seconds)
          })
        : await uploadTestReleaseFile(file, percent => {
            setProgress(percent)
            const bytes = Math.round(file.size * percent / 100)
            setUploadedBytes(bytes)
            const seconds = Math.max(0.2, (Date.now() - startedAt) / 1000)
            setSpeed(bytes / seconds)
          })
      setResult(item)
    } catch (uploadError: any) {
      setError(uploadError?.message || '上传失败，请稍后重试。')
    } finally {
      setUploading(false)
    }
  }

  async function copyLink() {
    if (!result?.apkUrl) return
    try {
      await copyText(result.apkUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('复制失败，请手动选中链接复制。')
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    captureFile(event.target.files?.[0] || null)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    captureFile(event.dataTransfer.files?.[0] || null)
  }

  const remainingSeconds = speed > 0 && file ? Math.max(0, (file.size - uploadedBytes) / speed) : 0
  const etaText = remainingSeconds > 0 ? `预计剩余 ${Math.ceil(remainingSeconds / 60)} 分钟` : ''

  return (
    <aside className="fixed bottom-5 right-5 z-[70] w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">URL</div>
          <div>
            <div className="text-sm font-semibold text-slate-950">APK 下载链接</div>
            <div className="text-xs text-slate-500">{mode === 'multipart' ? 'R2 6 路分片并发上传' : mode === 'checking' ? '正在检查高速上传能力' : '普通单路上传'}</div>
          </div>
        </div>
        <span className="text-sm font-semibold text-slate-500">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="p-4">
          <div onDragOver={event => event.preventDefault()} onDrop={onDrop} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            {file ? (
              <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-950">{file.name}</div><div className="mt-1 text-xs text-slate-500">{formatBytes(file.size)}</div></div>
            ) : (
              <div className="text-sm leading-6 text-slate-600">先在页面选择 APK，系统会自动捕获；也可以在这里重新选择。</div>
            )}
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50">
              {file ? '重新选择 APK' : '选择 APK'}
            </button>
            <input ref={inputRef} type="file" accept=".apk,application/vnd.android.package-archive" className="hidden" onChange={onInputChange} />
          </div>

          {uploading && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-500"><span>正在上传 · {formatBytes(uploadedBytes)} / {formatBytes(file?.size || 0)}</span><b>{progress}%</b></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} /></div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{formatSpeed(speed)}</span><span>{etaText}</span></div>
              <p className="mt-2 text-xs leading-5 text-slate-500">大 APK 请保持页面打开，上传完成前不要刷新。</p>
            </div>
          )}

          {error && <div className="mt-3 whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium leading-5 text-rose-700">{error}</div>}

          {result?.apkUrl && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs font-semibold text-emerald-900">下载链接已生成</div>
              <div className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-5 text-slate-700">{result.apkUrl}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">{copied ? '已复制' : '复制链接'}</button>
                <a href={result.apkUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800">打开下载</a>
              </div>
            </div>
          )}

          {!result && (
            <button type="button" onClick={upload} disabled={!file || uploading || mode === 'checking'} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              {uploading ? `上传中 ${progress}%` : mode === 'multipart' ? '高速上传并生成下载链接' : '上传并生成下载链接'}
            </button>
          )}

          <p className="mt-3 text-xs leading-5 text-slate-500">本地快检不会上传文件；只有点击按钮后，APK 才会上传并生成链接。</p>
        </div>
      )}
    </aside>
  )
}
