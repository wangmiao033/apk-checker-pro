const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const dataRoot = process.env.APK_DATA_DIR || path.join(process.cwd(), 'data')
const storeFile = process.env.TEST_RELEASE_USER_STORE_FILE || path.join(dataRoot, 'test-release-users.json')
const sessionDays = Number(process.env.TEST_RELEASE_SESSION_DAYS || 30)

function now() {
  return new Date().toISOString()
}

function ensureStore() {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true })
  if (!fs.existsSync(storeFile)) fs.writeFileSync(storeFile, JSON.stringify({ users: [], sessions: [] }, null, 2))
}

function readStore() {
  ensureStore()
  try {
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8') || '{}')
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    }
  } catch {
    return { users: [], sessions: [] }
  }
}

function writeStore(store) {
  ensureStore()
  const tempFile = `${storeFile}.${process.pid}.tmp`
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2))
  fs.renameSync(tempFile, storeFile)
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function assertEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('请填写有效邮箱地址')
}

function assertPassword(password) {
  if (String(password || '').length < 6) throw new Error('密码至少需要 6 位')
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex')
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || '',
    createdAt: user.createdAt
  }
}

function makeSession(store, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString()
  const session = {
    tokenHash: hashToken(token),
    userId,
    createdAt: now(),
    expiresAt
  }
  const activeSessions = store.sessions.filter(item => new Date(item.expiresAt).getTime() > Date.now())
  store.sessions = [session, ...activeSessions].slice(0, 5000)
  return { token, expiresAt }
}

function registerUser(input = {}) {
  const store = readStore()
  const email = normalizeEmail(input.email)
  const password = String(input.password || '')
  const displayName = String(input.displayName || '').trim()
  assertEmail(email)
  assertPassword(password)
  if (store.users.some(user => user.email === email)) throw new Error('该邮箱已注册，请直接登录')

  const salt = crypto.randomBytes(16).toString('hex')
  const user = {
    id: `u_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
    email,
    displayName,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    createdAt: now()
  }
  store.users.unshift(user)
  const session = makeSession(store, user.id)
  writeStore(store)
  return { user: publicUser(user), ...session }
}

function loginUser(input = {}) {
  const store = readStore()
  const email = normalizeEmail(input.email)
  const password = String(input.password || '')
  assertEmail(email)
  assertPassword(password)
  const user = store.users.find(item => item.email === email)
  if (!user) throw new Error('邮箱或密码不正确')
  const expected = Buffer.from(user.passwordHash, 'hex')
  const actual = Buffer.from(hashPassword(password, user.passwordSalt), 'hex')
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('邮箱或密码不正确')
  }
  const session = makeSession(store, user.id)
  writeStore(store)
  return { user: publicUser(user), ...session }
}

function userFromToken(token) {
  if (!token) return null
  const store = readStore()
  const tokenHash = hashToken(token)
  const session = store.sessions.find(item => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > Date.now())
  if (!session) return null
  const user = store.users.find(item => item.id === session.userId)
  return publicUser(user)
}

module.exports = {
  registerUser,
  loginUser,
  userFromToken
}
