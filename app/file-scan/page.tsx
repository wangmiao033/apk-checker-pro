'use client'

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from 'react'

type ZipEntry = {
  name: string
  compressedSize: number
  uncompressedSize: number
  directory: boolean
}

type ScanReport = {
  file: {
    name: string
    extension: string
    type: string
    size: number
    sizeText: string
    lastModified: string
    sha256: string | null
    sha256Note?: string
  }
  category: string
  image?: { width: number; height: number }
  textPreview?: string
  pdf?: { estimatedPages: number; note: string }
  archive?: {
    entryCount: number
    totalUncompressedSize: number
    totalCompressedSize: number
    largestFiles: ZipEntry[]
    topLevelFolders: string[]
  }
  apk?: {
    hasManifest: boolean
    hasResourcesArsc: boolean
    dexCount: number
    nativeLibraryCount: number
    abis: string[]
    signatureFiles: string[]
    assetCount: number
    warnings: string[]
  }
  notes: string[]
  scannedAt: string
}

const HASH_LIMIT = 512 * 1024 * 1024
const TEXT_PREVIEW_LIMIT = 128 * 1024
const PDF_SCAN_LIMIT = 24 * 1024 * 1024

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return '未知'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

function extensionOf(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

function categoryOf(file: File) {
  const ext = extensionOf(file.name)
  if (ext === 'apk') return 'Android APK'
  if (['zip', 'docx', 'xlsx', 'pptx'].includes(ext)) return 'ZIP / Office 压缩容器'
  if (ext === 'pdf' || file.type === 'application/pdf') return 'PDF 文档'
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return '图片'
  if (file.type.startsWith('text/') || ['txt', 'json', 'xml', 'csv', 'md', 'log', 'js', 'ts', 'tsx', 'css', 'html'].includes(ext)) return '文本文件'
  return '通用文件'
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map(value => value.toString(16).padStart(2, '0')).join('')
}

async function calculateSha256(file: File) {
  if (file.size > HASH_LIMIT) {
    return {
      hash: null,
      note: `文件超过 ${formatBytes(HASH_LIMIT)}，浏览器本地模式跳过完整 SHA-256，避免占用过多内存。`
    }
  }
  const data = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', data)
  return { hash: toHex(digest), note: undefined }
}

async function readImageSize(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      reject(new Error('图片尺寸读取失败'))
      URL.revokeObjectURL(url)
    }
    image.src = url
  })
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) return index
  }
  return -1
}

async function readZipDirectory(file: File): Promise<ZipEntry[]> {
  const tailSize = Math.min(file.size, 65_557)
  const tailStart = file.size - tailSize
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer())
  const eocdIndex = findEndOfCentralDirectory(tail)
  if (eocdIndex < 0) throw new Error('未找到 ZIP 中央目录，文件可能损坏、被加密或不是标准 ZIP/APK。')

  const eocd = new DataView(tail.buffer, tail.byteOffset + eocdIndex)
  const totalEntries = eocd.getUint16(10, true)
  const centralDirectorySize = eocd.getUint32(12, true)
  const centralDirectoryOffset = eocd.getUint32(16, true)

  if (totalEntries === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error('该文件使用 ZIP64，当前浏览器快检暂不解析目录；可改用深度检测服务。')
  }

  if (centralDirectoryOffset + centralDirectorySize > file.size) {
    throw new Error('ZIP 中央目录位置异常，文件可能不完整。')
  }

  const central = new Uint8Array(await file.slice(centralDirectoryOffset, centralDirectoryOffset + centralDirectorySize).arrayBuffer())
  const view = new DataView(central.buffer, central.byteOffset, central.byteLength)
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const entries: ZipEntry[] = []
  let offset = 0

  while (offset + 46 <= central.byteLength && entries.length < totalEntries) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameStart = offset + 46
    const nameEnd = nameStart + fileNameLength
    if (nameEnd > central.byteLength) break
    const name = decoder.decode(central.slice(nameStart, nameEnd))
    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      directory: name.endsWith('/')
    })
    offset = nameEnd + extraLength + commentLength
  }

  if (!entries.length) throw new Error('ZIP 目录为空或无法解析。')
  return entries
}

async function estimatePdfPages(file: File) {
  const headSize = Math.min(file.size, PDF_SCAN_LIMIT)
  const tailSize = file.size > headSize ? Math.min(file.size - headSize, 4 * 1024 * 1024) : 0
  const parts = [await file.slice(0, headSize).text()]
  if (tailSize) parts.push(await file.slice(file.size - tailSize).text())
  const text = parts.join('\n')
  const matches = text.match(/\/Type\s*\/Page\b/g)
  return matches?.length || 0
}

function summarizeArchive(entries: ZipEntry[]) {
  const files = entries.filter(entry => !entry.directory)
  const folders = new Set<string>()
  files.forEach(entry => {
    const first = entry.name.split('/')[0]
    if (entry.name.includes('/') && first) folders.add(first)
  })
  return {
    entryCount: files.length,
    totalUncompressedSize: files.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
    totalCompressedSize: files.reduce((sum, entry) => sum + entry.compressedSize, 0),
    largestFiles: [...files].sort((a, b) => b.uncompressedSize - a.uncompressedSize).slice(0, 20),
    topLevelFolders: Array.from(folders).sort().slice(0, 30)
  }
}

function summarizeApk(entries: ZipEntry[]) {
  const names = entries.map(entry => entry.name)
  const abis = Array.from(new Set(names
    .map(name => name.match(/^lib\/([^/]+)\//)?.[1])
    .filter(Boolean) as string[])).sort()
  const signatureFiles = names.filter(name => /^META-INF\/.*\.(RSA|DSA|EC|SF)$/i.test(name)).slice(0, 30)
  const dexCount = names.filter(name => /^classes(?:\d+)?\.dex$/i.test(name)).length
  const nativeLibraryCount = names.filter(name => /\.so$/i.test(name)).length
  const warnings: string[] = []
  if (!names.includes('AndroidManifest.xml')) warnings.push('未发现 AndroidManifest.xml，可能不是完整 APK。')
  if (!abis.includes('arm64-v8a')) warnings.push('未发现 arm64-v8a 原生库；若应用含原生代码，可能存在 64 位兼容风险。')
  if (!signatureFiles.length) warnings.push('未在 META-INF 中发现传统签名文件；可能仅使用 APK Signature Scheme v2/v3/v4，需要深度检测确认。')
  if (!dexCount) warnings.push('未发现 classes.dex，可能是特殊结构包或文件不完整。')
  return {
    hasManifest: names.includes('AndroidManifest.xml'),
    hasResourcesArsc: names.includes('resources.arsc'),
    dexCount,
    nativeLibraryCount,
    abis,
    signatureFiles,
    assetCount: names.filter(name => name.startsWith('assets/') && !name.endsWith('/')).length,
    warnings
  }
}

async function scanFile(file: File, setProgress: (value: string) => void): Promise<ScanReport> {
  const extension = extensionOf(file.name)
  const category = categoryOf(file)
  const notes: string[] = ['文件仅在当前浏览器本地读取，默认不会上传。']

  setProgress('正在读取基础信息…')
  const hashResult = await calculateSha256(file)

  const report: ScanReport = {
    file: {
      name: file.name,
      extension: extension || '无扩展名',
      type: file.type || '浏览器未识别',
      size: file.size,
      sizeText: formatBytes(file.size),
      lastModified: file.lastModified ? new Date(file.lastModified).toLocaleString('zh-CN') : '未知',
      sha256: hashResult.hash,
      sha256Note: hashResult.note
    },
    category,
    notes,
    scannedAt: new Date().toLocaleString('zh-CN')
  }

  if (category === '图片') {
    setProgress('正在读取图片尺寸…')
    report.image = await readImageSize(file)
  }

  if (category === '文本文件') {
    setProgress('正在生成文本预览…')
    report.textPreview = await file.slice(0, TEXT_PREVIEW_LIMIT).text()
    if (file.size > TEXT_PREVIEW_LIMIT) notes.push(`文本预览仅显示前 ${formatBytes(TEXT_PREVIEW_LIMIT)}。`)
  }

  if (category === 'PDF 文档') {
    setProgress('正在估算 PDF 页数…')
    const estimatedPages = await estimatePdfPages(file)
    report.pdf = {
      estimatedPages,
      note: '页数来自 PDF 结构特征快速估算；复杂或压缩 PDF 可能低于真实页数。'
    }
  }

  if (category === 'Android APK' || category === 'ZIP / Office 压缩容器') {
    setProgress('正在读取压缩包中央目录…')
    const entries = await readZipDirectory(file)
    report.archive = summarizeArchive(entries)
    if (category === 'Android APK') {
      setProgress('正在识别 APK 结构…')
      report.apk = summarizeApk(entries)
      notes.push('当前为结构快检，不会执行 APK，也不会安装应用。包名、targetSdk、权限、证书链等需使用首页深度检测。')
    }
  }

  setProgress('分析完成')
  return report
}

function downloadReport(report: ScanReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${report.file.name.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_')}.quick-scan.json`
  link.click()
  URL.revokeObjectURL(url)
}

export default function FileScanPage() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ScanReport | null>(null)
  const [status, setStatus] = useState('等待选择文件')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const isApk = useMemo(() => extensionOf(file?.name || '') === 'apk', [file])

  async function acceptFile(nextFile: File | null) {
    if (!nextFile) return
    setFile(nextFile)
    setReport(null)
    setError('')
    setLoading(true)
    try {
      const nextReport = await scanFile(nextFile, setStatus)
      setReport(nextReport)
    } catch (scanError: any) {
      setError(scanError?.message || '文件读取失败。')
      setStatus('分析失败')
    } finally {
      setLoading(false)
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0] || null)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    acceptFile(event.dataTransfer.files?.[0] || null)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">LOCAL FILE QUICK SCAN</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">文件快检</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">快速读取 APK、ZIP、PDF、Office、图片和文本。基础分析在浏览器本地完成，不上传文件。</p>
            </div>
            <a href="/" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">返回 APKFlow</a>
          </div>
        </header>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div
                onDragOver={event => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-5 py-14 text-center transition ${dragging ? 'border-slate-900 bg-slate-100' : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white'}`}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white">FS</div>
                <h2 className="mt-5 text-lg font-semibold">点击或拖拽文件到这里</h2>
                <p className="mt-2 text-sm text-slate-500">支持 APK、ZIP、PDF、DOCX、XLSX、PPTX、TXT、JSON、PNG、JPG 等</p>
                <p className="mt-1 text-xs text-slate-400">超大 APK 会优先读取中央目录；超过 512MB 时跳过本地完整哈希，避免浏览器内存过高。</p>
                <input ref={inputRef} type="file" className="hidden" onChange={onInputChange} />
              </div>

              {file && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{file.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatBytes(file.size)} · {status}</div>
                  </div>
                  {loading && <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />}
                </div>
              )}

              {error && <div className="mt-4 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</div>}
            </div>

            {report && (
              <>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">检测概览</h2>
                      <p className="mt-1 text-sm text-slate-500">{report.category} · {report.scannedAt}</p>
                    </div>
                    <button onClick={() => downloadReport(report)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">下载 JSON 报告</button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ['文件名', report.file.name],
                      ['文件类型', report.category],
                      ['文件大小', report.file.sizeText],
                      ['扩展名', report.file.extension]
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">{label}</div>
                        <div className="mt-2 break-all text-sm font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs text-slate-500">SHA-256</div>
                    <div className="mt-2 break-all font-mono text-xs leading-5 text-slate-700">{report.file.sha256 || report.file.sha256Note || '未计算'}</div>
                  </div>
                </section>

                {report.apk && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">APK 结构快检</h2>
                        <p className="mt-1 text-sm text-slate-500">不安装、不执行，仅检查压缩包结构。</p>
                      </div>
                      <a href="/" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">进入深度 APK 检测</a>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        ['Manifest', report.apk.hasManifest ? '已发现' : '未发现'],
                        ['DEX 数量', String(report.apk.dexCount)],
                        ['原生 SO', String(report.apk.nativeLibraryCount)],
                        ['Assets 文件', String(report.apk.assetCount)]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-lg font-semibold">{value}</div></div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <div className="text-sm font-semibold">ABI</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {report.apk.abis.length ? report.apk.abis.map(abi => <span key={abi} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{abi}</span>) : <span className="text-sm text-slate-500">未发现 lib ABI 目录</span>}
                      </div>
                    </div>
                    {report.apk.warnings.length > 0 && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="text-sm font-semibold text-amber-900">需要进一步确认</div>
                        <div className="mt-2 space-y-2 text-sm leading-6 text-amber-800">{report.apk.warnings.map(item => <div key={item}>• {item}</div>)}</div>
                      </div>
                    )}
                  </section>
                )}

                {report.archive && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold">压缩包目录与体积</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">文件数量</div><div className="mt-2 text-xl font-semibold">{report.archive.entryCount}</div></div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">解压后合计</div><div className="mt-2 text-xl font-semibold">{formatBytes(report.archive.totalUncompressedSize)}</div></div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs text-slate-500">压缩数据合计</div><div className="mt-2 text-xl font-semibold">{formatBytes(report.archive.totalCompressedSize)}</div></div>
                    </div>
                    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-[720px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">体积最大的文件</th><th className="p-3">解压大小</th><th className="p-3">压缩大小</th></tr></thead>
                        <tbody>{report.archive.largestFiles.map(entry => <tr key={entry.name} className="border-t border-slate-100"><td className="max-w-[520px] break-all p-3 font-mono text-xs">{entry.name}</td><td className="p-3">{formatBytes(entry.uncompressedSize)}</td><td className="p-3 text-slate-500">{formatBytes(entry.compressedSize)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </section>
                )}

                {report.image && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold">图片信息</h2>
                    <div className="mt-4 text-sm text-slate-600">尺寸：<b className="text-slate-950">{report.image.width} × {report.image.height} px</b></div>
                  </section>
                )}

                {report.pdf && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold">PDF 信息</h2>
                    <div className="mt-4 text-sm text-slate-600">快速估算页数：<b className="text-slate-950">{report.pdf.estimatedPages || '无法估算'}</b></div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{report.pdf.note}</p>
                  </section>
                )}

                {report.textPreview !== undefined && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold">文本预览</h2>
                    <pre className="mt-4 max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{report.textPreview || '文件为空'}</pre>
                  </section>
                )}
              </>
            )}
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold">检测范围</h3>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                <div>• APK / ZIP：目录、DEX、SO、ABI、签名文件线索、最大文件</div>
                <div>• 图片：像素尺寸、MIME、文件大小</div>
                <div>• PDF：快速页数估算</div>
                <div>• 文本：前 128KB 内容预览</div>
              </div>
            </section>
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <h3 className="font-semibold text-emerald-900">隐私模式</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-800">当前快检默认在浏览器本地完成。关闭页面后不会保留文件内容。</p>
            </section>
            {isApk && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-semibold text-amber-900">APK 深度字段</h3>
                <p className="mt-2 text-sm leading-6 text-amber-800">包名、版本、targetSdk、权限、Debug、HTTP、证书链需要返回 APKFlow 使用独立分析后端读取。</p>
              </section>
            )}
          </aside>
        </section>
      </div>
    </main>
  )
}
