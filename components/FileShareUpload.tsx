'use client'

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'
import { uploadTestReleaseFile, type TestReleaseFileUploadResult } from '@/lib/testRelease'

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
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

export function FileShareUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<TestReleaseFileUploadResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(true)

  function captureFile(nextFile: File | null) {
    if (!nextFile || !isApk(nextFile)) return
    setFile(nextFile)
    setResult(null)
    setProgress(0)
    setError('')
    setCopied(false)
  }

  useEffect(() => {
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
    try {
      const item = await uploadTestReleaseFile(file, setProgress)
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

  return (
    <aside className="fixed bottom-5 right-5 z-[70] w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">URL</div>
          <div>
            <div className="text-sm font-semibold text-slate-950">APK 下载链接</div>
            <div className="text-xs text-slate-500">上传后生成可复制的直链</div>
          </div>
        </div>
        <span className="text-sm font-semibold text-slate-500">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="p-4">
          <div
            onDragOver={event => event.preventDefault()}
            onDrop={onDrop}
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3"
          >
            {file ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">{file.name}</div>
                <div className="mt-1 text-xs text-slate-500">{formatBytes(file.size)}</div>
              </div>
            ) : (
              <div className="text-sm leading-6 text-slate-600">先在页面选择 APK，系统会自动捕获；也可以在这里重新选择。</div>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {file ? '重新选择 APK' : '选择 APK'}
            </button>
            <input ref={inputRef} type="file" accept=".apk,application/vnd.android.package-archive" className="hidden" onChange={onInputChange} />
          </div>

          {uploading && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-500"><span>正在上传</span><b>{progress}%</b></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} /></div>
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
            <button
              type="button"
              onClick={upload}
              disabled={!file || uploading}
              className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {uploading ? `上传中 ${progress}%` : '上传并生成下载链接'}
            </button>
          )}

          <p className="mt-3 text-xs leading-5 text-slate-500">本地快检不会上传文件；只有点击上方按钮后，APK 才会上传到现有文件存储并生成链接。</p>
        </div>
      )}
    </aside>
  )
}
