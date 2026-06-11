const crypto = require('crypto')
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
  return path.basename(name || 'upload.apk').replace(/[^a-zA-Z0-9._-]/g, '_')
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
  limits: { fileSize: maxSize, files: 1 },
  fileFilter(_req, file, callback) {
    if (!file.originalname.toLowerCase().endsWith('.apk')) {
      return callback(new Error('Only .apk files are allowed'))
    }
    callback(null, true)
  }
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
  const filePath = req.file && req.file.path

  try {
    if (!req.file) return res.status(400).json({ error: 'APK file is required' })

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
      originalName: req.file.originalname,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype,
      selectedChannelIds: selectedChannels,
      channelRules
    })
    return res.json(result)
  } catch (error) {
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
