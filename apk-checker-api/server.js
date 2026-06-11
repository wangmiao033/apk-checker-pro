const crypto = require('crypto')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const cors = require('cors')
const express = require('express')
const multer = require('multer')
const { analyzeApk, getEngineHealth } = require('./lib/analyzer')
const pkg = require('./package.json')

const app = express()
const port = Number(process.env.PORT || 8080)
const maxUploadMB = Number(process.env.MAX_UPLOAD_MB || 2048)
const maxSize = maxUploadMB * 1024 * 1024
const tmpRoot = process.env.APK_TMP_DIR || path.join(os.tmpdir(), 'apk-checker-api')
const allowedOrigins = (process.env.CORS_ORIGIN || 'https://apk.hnchpower.cn,https://apk-checker-pro.vercel.app')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

fs.mkdirSync(tmpRoot, { recursive: true })

function safeFileName(name) {
  const base = path.basename(name || 'upload.apk')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  const safe = base
    .replace(/\.\.+/g, '.')
    .replace(/^\.+/, '')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .slice(0, 180)
  return safe || 'upload.apk'
}

function normalizeApkName(originalName) {
  const safe = safeFileName(originalName)
  const withoutKnownSuffix = safe
    .replace(/\.apk(?:[._-]?\d+|\(\d+\)|\.txt)$/i, '.apk')
    .replace(/\.apk\.[^.]+$/i, '.apk')
  if (/\.apk$/i.test(withoutKnownSuffix)) return withoutKnownSuffix
  const withoutExt = withoutKnownSuffix.replace(/\.[^.]{1,12}$/i, '')
  return `${withoutExt || 'upload'}.apk`
}

function readMagic(filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(4)
    const bytes = fs.readSync(fd, buffer, 0, 4, 0)
    return buffer.subarray(0, bytes)
  } finally {
    fs.closeSync(fd)
  }
}

function listZipEntries(filePath) {
  const output = execFileSync('unzip', ['-l', filePath], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 24,
    shell: false,
    windowsHide: true
  })
  const entries = []
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+?)\s*$/)
    if (!match) continue
    entries.push({ size: Number(match[1]), name: match[2] })
    if (entries.length > 50000) throw new Error('ZIP 文件目录数量异常，疑似 zip bomb，已拒绝处理。')
  }
  return entries
}

function detectApkFile(filePath, originalName) {
  const magic = readMagic(filePath)
  const isZip = magic.length >= 2 && magic[0] === 0x50 && magic[1] === 0x4b
  const apkLikeName = /\.apk(?:$|[._(-])/i.test(originalName || '')

  if (!isZip) {
    throw new Error(apkLikeName ? '文件后缀疑似 APK，但内容不是有效 APK。' : '当前文件不是有效 APK，请确认文件内容是否正确。')
  }

  let entries
  try {
    entries = listZipEntries(filePath)
  } catch (error) {
    throw new Error(`当前文件不是有效 APK，请确认文件内容是否正确。${error.message ? `原因：${error.message}` : ''}`)
  }

  const names = entries.map(item => item.name.replace(/\\/g, '/'))
  const totalUncompressedSize = entries.reduce((sum, item) => sum + (Number.isFinite(item.size) ? item.size : 0), 0)
  const maxSingleFileSize = entries.reduce((max, item) => Math.max(max, item.size || 0), 0)
  if (totalUncompressedSize > 20 * 1024 * 1024 * 1024) throw new Error('ZIP 文件解压后体积异常，疑似 zip bomb，已拒绝处理。')
  if (maxSingleFileSize > 8 * 1024 * 1024 * 1024) throw new Error('ZIP 文件内存在异常超大文件，已拒绝处理。')

  const evidence = []
  const hasManifest = names.includes('AndroidManifest.xml')
  const hasDex = names.some(name => /^classes(?:\d*)\.dex$/.test(name))
  const hasResources = names.includes('resources.arsc')
  const hasMetaInf = names.some(name => name.startsWith('META-INF/'))
  const hasLib = names.some(name => name.startsWith('lib/') && name.endsWith('.so'))

  if (hasManifest) evidence.push('检测到 AndroidManifest.xml')
  if (hasDex) evidence.push('检测到 classes.dex')
  if (hasResources) evidence.push('检测到 resources.arsc')
  if (hasMetaInf) evidence.push('检测到 META-INF/')
  if (hasLib) evidence.push('检测到 lib/ 原生库')

  if (!hasManifest) {
    throw new Error(apkLikeName ? '文件后缀疑似 APK，但内容不是有效 APK。未检测到 AndroidManifest.xml。' : '这是 ZIP 文件，但不是 APK 包：未检测到 AndroidManifest.xml。')
  }

  const confidence = 60 + (hasDex ? 15 : 0) + (hasResources ? 10 : 0) + (hasMetaInf ? 8 : 0) + (hasLib ? 7 : 0)
  return {
    detectedFileType: 'apk',
    isApkLike: true,
    confidence: Math.min(100, confidence),
    evidence,
    entryCount: entries.length,
    totalUncompressedSize
  }
}

function normalizeApkUpload(file) {
  const originalFileName = file.originalname || 'upload'
  const normalizedFileName = normalizeApkName(originalFileName)
  const detection = detectApkFile(file.path, originalFileName)
  const normalizedPath = path.join(path.dirname(file.path), `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safeFileName(normalizedFileName)}`)

  if (file.path !== normalizedPath) {
    fs.renameSync(file.path, normalizedPath)
    file.path = normalizedPath
    file.filename = path.basename(normalizedPath)
  }

  const originalSafe = safeFileName(originalFileName)
  const isNormalized = originalSafe !== normalizedFileName || !/\.apk$/i.test(originalFileName)
  return {
    originalFileName,
    normalizedFileName,
    detectedFileType: detection.detectedFileType,
    isApkLike: detection.isApkLike,
    isNormalized,
    normalizeReason: isNormalized
      ? '文件内容识别为 APK，已自动按 .apk 处理'
      : '文件内容识别为标准 APK',
    identificationEvidence: detection.evidence,
    confidence: detection.confidence,
    entryCount: detection.entryCount,
    totalUncompressedSize: detection.totalUncompressedSize,
    normalizedPath
  }
}

function removeFile(filePath) {
  if (!filePath) return
  fs.unlink(filePath, () => {})
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('CORS origin is not allowed'))
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}))

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    callback(null, tmpRoot)
  },
  filename(_req, file, callback) {
    const suffix = crypto.randomBytes(8).toString('hex')
    callback(null, `${Date.now()}-${suffix}-${safeFileName(file.originalname)}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: maxSize, files: 1 }
})

function health(_req, res) {
  res.json({
    service: 'apk-checker-api',
    version: pkg.version,
    maxUploadMB,
    ...getEngineHealth()
  })
}

app.get('/health', health)
app.get('/api/health', health)
app.get('/api/version', (_req, res) => {
  res.json({
    service: 'apk-checker-api',
    version: pkg.version,
    node: process.version,
    uptime: Math.round(process.uptime()),
    now: new Date().toISOString()
  })
})

app.post('/api/analyze', upload.single('file'), (req, res) => {
  let filePath = req.file && req.file.path

  try {
    if (!req.file) return res.status(400).json({ error: 'APK file is required' })
    const normalizedUpload = normalizeApkUpload(req.file)
    filePath = req.file.path

    let selectedChannels
    try {
      selectedChannels = req.body.channels ? JSON.parse(req.body.channels) : undefined
    } catch {
      selectedChannels = undefined
    }
    let channelRules
    try {
      const parsed = req.body.channelRules ? JSON.parse(req.body.channelRules) : undefined
      channelRules = Array.isArray(parsed) ? parsed : undefined
    } catch {
      channelRules = undefined
    }

    const result = analyzeApk(filePath, {
      originalName: normalizedUpload.normalizedFileName,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype,
      uploadIdentification: normalizedUpload,
      selectedChannelIds: selectedChannels,
      channelRules
    })
    return res.json(result)
  } catch (error) {
    if (/不是有效 APK|不是 APK 包|ZIP 文件|zip bomb|异常超大文件|未检测到 AndroidManifest\.xml/.test(error.message || '')) {
      return res.status(400).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message || 'Analyze failed' })
  } finally {
    removeFile(filePath)
  }
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File exceeds ${maxUploadMB}MB limit` })
  }
  return res.status(400).json({ error: error.message || 'Bad request' })
})

const server = app.listen(port, () => {
  console.log(`apk-checker-api listening on :${port}`)
})

server.requestTimeout = 60 * 60 * 1000
server.headersTimeout = 65 * 60 * 1000
