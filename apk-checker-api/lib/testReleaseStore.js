const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const dataRoot = process.env.APK_DATA_DIR || path.join(process.cwd(), 'data')
const storeFile = process.env.TEST_RELEASE_STORE_FILE || path.join(dataRoot, 'test-releases.json')

const stringFields = [
  'productName',
  'versionName',
  'packageName',
  'buildNo',
  'apkUrl',
  'apkSize',
  'updatedAt',
  'owner',
  'ownerContact',
  'submitterName',
  'submitterContact',
  'testType',
  'status',
  'intro',
  'testScope',
  'changelog',
  'installGuide',
  'notice'
]

function now() {
  return new Date().toISOString()
}

function makeId() {
  return `tr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

function ensureStore() {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true })
  if (!fs.existsSync(storeFile)) fs.writeFileSync(storeFile, '[]')
}

function readAll() {
  ensureStore()
  try {
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8') || '[]')
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

function writeAll(items) {
  ensureStore()
  const tempFile = `${storeFile}.${process.pid}.tmp`
  fs.writeFileSync(tempFile, JSON.stringify(items, null, 2))
  fs.renameSync(tempFile, storeFile)
}

function cleanText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function cleanUrl(value) {
  const text = cleanText(value)
  if (!text) return ''
  try {
    const url = new URL(text)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    return ''
  } catch {
    return ''
  }
}

function normalizeScreenshots(input) {
  if (!Array.isArray(input)) return []
  return input
    .map(cleanUrl)
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeRelease(input = {}, existing = {}) {
  const timestamp = now()
  const release = {
    ...existing,
    id: existing.id || cleanText(input.id) || makeId(),
    source: input.source === 'submission' || existing.source === 'submission' ? 'submission' : 'admin',
    userId: cleanText(input.userId ?? existing.userId),
    ownerEmail: cleanText(input.ownerEmail ?? existing.ownerEmail),
    createdAt: existing.createdAt || cleanText(input.createdAt) || timestamp,
    recordUpdatedAt: timestamp,
    downloadCount: Number.isFinite(Number(existing.downloadCount)) ? Number(existing.downloadCount) : 0,
    lastDownloadedAt: cleanText(existing.lastDownloadedAt || input.lastDownloadedAt),
    archived: Boolean(input.archived ?? existing.archived),
    screenshots: normalizeScreenshots(input.screenshots ?? existing.screenshots)
  }

  for (const field of stringFields) {
    release[field] = cleanText(input[field] ?? existing[field])
  }

  release.apkUrl = cleanUrl(release.apkUrl)
  release.testType = release.testType || '渠道包测试'
  release.status = release.status || (release.source === 'submission' ? '待处理' : '待测试')
  release.installGuide = release.installGuide || '请使用 Android 设备打开本页面，点击下载 APK 后按系统提示安装。若提示未知来源，请按测试要求临时允许安装。'
  release.notice = release.notice || '本链接仅用于内部提测，请勿外传。'

  return release
}

function toPublicRelease(release) {
  const {
    userId,
    ownerEmail,
    submitterName,
    submitterContact,
    ...publicRelease
  } = release
  return publicRelease
}

function listReleases(options = {}) {
  return readAll()
    .filter(item => !options.userId || item.userId === options.userId)
    .sort((a, b) => String(b.recordUpdatedAt || b.createdAt).localeCompare(String(a.recordUpdatedAt || a.createdAt)))
}

function getRelease(id) {
  return readAll().find(item => item.id === id) || null
}

function createRelease(input, source = 'admin') {
  const items = readAll()
  const release = normalizeRelease({ ...input, source })
  items.unshift(release)
  writeAll(items.slice(0, 1000))
  return release
}

function updateRelease(id, input) {
  const items = readAll()
  const index = items.findIndex(item => item.id === id)
  if (index === -1) return null
  const release = normalizeRelease({ ...items[index], ...input, id }, items[index])
  release.downloadCount = Number(items[index].downloadCount || 0)
  release.lastDownloadedAt = items[index].lastDownloadedAt || ''
  items[index] = release
  writeAll(items)
  return release
}

function setArchived(id, archived) {
  const items = readAll()
  const index = items.findIndex(item => item.id === id)
  if (index === -1) return null
  items[index] = { ...items[index], archived: Boolean(archived), recordUpdatedAt: now() }
  writeAll(items)
  return items[index]
}

function incrementDownload(id) {
  const items = readAll()
  const index = items.findIndex(item => item.id === id)
  if (index === -1) return null
  const release = items[index]
  const next = {
    ...release,
    downloadCount: Number(release.downloadCount || 0) + 1,
    lastDownloadedAt: now(),
    recordUpdatedAt: release.recordUpdatedAt || release.createdAt || now()
  }
  items[index] = next
  writeAll(items)
  return next
}

module.exports = {
  listReleases,
  getRelease,
  createRelease,
  updateRelease,
  setArchived,
  incrementDownload,
  toPublicRelease
}
