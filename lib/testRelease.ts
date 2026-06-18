export type TestReleaseInfo = {
  id?: string
  source?: 'admin' | 'submission'
  userId?: string
  ownerEmail?: string
  productName: string
  versionName: string
  packageName: string
  buildNo: string
  apkUrl: string
  apkSize: string
  updatedAt: string
  recordUpdatedAt?: string
  createdAt?: string
  downloadCount?: number
  lastDownloadedAt?: string
  archived?: boolean
  owner: string
  ownerContact: string
  submitterName: string
  submitterContact: string
  testType: string
  status: string
  intro: string
  testScope: string
  changelog: string
  installGuide: string
  notice: string
  screenshots: string[]
}

export type TestReleaseFileUploadResult = {
  fileName: string
  apkUrl: string
  apkSize: string
  sizeBytes: number
  uploadedAt: string
}

export type TestReleaseUser = {
  id: string
  email: string
  displayName?: string
  createdAt?: string
}

export type TestReleaseAuthSession = {
  token: string
  expiresAt?: string
  user: TestReleaseUser
}

export const defaultTestReleaseInfo: TestReleaseInfo = {
  id: '',
  source: 'admin',
  userId: '',
  ownerEmail: '',
  productName: '',
  versionName: '',
  packageName: '',
  buildNo: '',
  apkUrl: '',
  apkSize: '',
  updatedAt: '',
  recordUpdatedAt: '',
  createdAt: '',
  downloadCount: 0,
  lastDownloadedAt: '',
  archived: false,
  owner: '',
  ownerContact: '',
  submitterName: '',
  submitterContact: '',
  testType: '渠道包测试',
  status: '待测试',
  intro: '',
  testScope: '',
  changelog: '',
  installGuide: '请使用 Android 设备打开本页面，点击下载 APK 后按系统提示安装。若提示未知来源，请按测试要求临时允许安装。',
  notice: '本链接仅用于内部提测，请勿外传。',
  screenshots: []
}

export const TEST_RELEASE_UPLOAD_ACCEPT = '.apk,.apk.1,.apk.txt,application/vnd.android.package-archive,application/zip,*/*'
export const TEST_RELEASE_AUTH_STORAGE_KEY = 'apkflow-test-release-auth'

export function testReleaseApiBase() {
  const explicit = process.env.NEXT_PUBLIC_TEST_RELEASE_API_URL
  if (explicit) return explicit.replace(/\/+$/g, '')
  const analyzeUrl = process.env.NEXT_PUBLIC_ANALYZE_API_URL
  if (analyzeUrl) {
    try {
      return new URL('/api/test-releases', analyzeUrl).toString().replace(/\/+$/g, '')
    } catch {}
  }
  return '/api/test-releases'
}

export function testReleaseFileUploadUrl() {
  const base = testReleaseApiBase()
  if (base.startsWith('/')) return '/api/test-release-files'
  try {
    return new URL('/api/test-release-files', base).toString()
  } catch {
    return '/api/test-release-files'
  }
}

export function testReleaseAuthApiUrl(path: 'register' | 'login' | 'me') {
  const base = testReleaseApiBase()
  if (base.startsWith('/')) return `/api/auth/${path}`
  try {
    return new URL(`/api/auth/${path}`, base).toString()
  } catch {
    return `/api/auth/${path}`
  }
}

export function getStoredTestReleaseAuth(): TestReleaseAuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(TEST_RELEASE_AUTH_STORAGE_KEY) || 'null')
    if (!parsed?.token || !parsed?.user?.email) return null
    return parsed
  } catch {
    return null
  }
}

export function storeTestReleaseAuth(session: TestReleaseAuthSession) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TEST_RELEASE_AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredTestReleaseAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TEST_RELEASE_AUTH_STORAGE_KEY)
}

export function testReleaseAuthHeaders(): Record<string, string> {
  const session = getStoredTestReleaseAuth()
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {}
}

export function testSubmissionApiUrl() {
  const base = testReleaseApiBase()
  if (base.startsWith('/')) return '/api/test-submissions'
  try {
    return new URL('/api/test-submissions', base).toString()
  } catch {
    return '/api/test-submissions'
  }
}

export function uploadTestReleaseFile(file: File, onProgress?: (progress: number) => void) {
  return new Promise<TestReleaseFileUploadResult>((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', testReleaseFileUploadUrl())
    xhr.responseType = 'text'
    xhr.timeout = 60 * 60 * 1000
    const token = getStoredTestReleaseAuth()?.token
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return
      onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }

    xhr.onload = () => {
      const raw = xhr.responseText || ''
      let json: any = null
      try { json = raw ? JSON.parse(raw) : null } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && json?.item?.apkUrl) {
        onProgress?.(100)
        resolve(json.item)
        return
      }
      reject(new Error(json?.error || raw || `APK 上传失败，HTTP 状态码：${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('APK 上传失败，请检查网络或稍后重试。'))
    xhr.ontimeout = () => reject(new Error('APK 上传超时，请检查网络或文件大小。'))
    xhr.onabort = () => reject(new Error('APK 上传已取消。'))
    xhr.send(form)
  })
}

export function testReleasePagePath(info: Pick<TestReleaseInfo, 'id'>) {
  return info.id ? `/test/${encodeURIComponent(info.id)}` : '/test'
}

export function absoluteUrl(pathOrUrl: string, origin: string) {
  if (!pathOrUrl) return ''
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (!origin) return pathOrUrl
  return new URL(pathOrUrl, origin).toString()
}

export function testReleaseDownloadUrl(info: Pick<TestReleaseInfo, 'id' | 'apkUrl'>) {
  if (info.id) return `${testReleaseApiBase()}/${encodeURIComponent(info.id)}/download`
  return info.apkUrl || ''
}

function base64UrlEncode(input: string) {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4)
  return decodeURIComponent(escape(atob(padded)))
}

export function normalizeTestReleaseInfo(input: Partial<TestReleaseInfo> = {}): TestReleaseInfo {
  return {
    ...defaultTestReleaseInfo,
    ...input,
    productName: String(input.productName || ''),
    versionName: String(input.versionName || ''),
    packageName: String(input.packageName || ''),
    buildNo: String(input.buildNo || ''),
    apkUrl: String(input.apkUrl || ''),
    apkSize: String(input.apkSize || ''),
    updatedAt: String(input.updatedAt || ''),
    recordUpdatedAt: String(input.recordUpdatedAt || ''),
    owner: String(input.owner || ''),
    userId: String(input.userId || ''),
    ownerEmail: String(input.ownerEmail || ''),
    ownerContact: String(input.ownerContact || ''),
    submitterName: String(input.submitterName || ''),
    submitterContact: String(input.submitterContact || ''),
    testType: String(input.testType || defaultTestReleaseInfo.testType),
    status: String(input.status || defaultTestReleaseInfo.status),
    intro: String(input.intro || ''),
    testScope: String(input.testScope || ''),
    changelog: String(input.changelog || ''),
    installGuide: String(input.installGuide || defaultTestReleaseInfo.installGuide),
    notice: String(input.notice || defaultTestReleaseInfo.notice),
    source: input.source === 'submission' ? 'submission' : 'admin',
    downloadCount: Number(input.downloadCount || 0),
    archived: Boolean(input.archived),
    screenshots: Array.isArray(input.screenshots) ? input.screenshots.map(String).map(item => item.trim()).filter(Boolean) : []
  }
}

export function encodeTestReleaseInfo(input: TestReleaseInfo) {
  return base64UrlEncode(JSON.stringify(normalizeTestReleaseInfo(input)))
}

export function decodeTestReleaseInfo(payload: string | null): TestReleaseInfo | null {
  if (!payload) return null
  try {
    return normalizeTestReleaseInfo(JSON.parse(base64UrlDecode(payload)))
  } catch {
    return null
  }
}

export function testReleaseShareText(info: TestReleaseInfo, url?: string) {
  return [
    `【提测】${info.productName || '未命名产品'}`,
    '',
    `版本：${info.versionName || '未填写'}${info.buildNo ? `（Build ${info.buildNo}）` : ''}`,
    `包名：${info.packageName || '未填写'}`,
    `测试类型：${info.testType || '未填写'}`,
    `状态：${info.status || '待测试'}`,
    info.apkSize ? `APK 大小：${info.apkSize}` : '',
    info.updatedAt ? `更新时间：${info.updatedAt}` : '',
    typeof info.downloadCount === 'number' ? `下载次数：${info.downloadCount}` : '',
    '',
    info.intro ? `产品简介：${info.intro}` : '',
    info.testScope ? `测试重点：${info.testScope}` : '',
    info.changelog ? `更新内容：${info.changelog}` : '',
    '',
    url ? `下载/提测页：${url}` : info.apkUrl ? `APK 下载：${info.apkUrl}` : '',
    info.owner ? `提测负责人：${info.owner}${info.ownerContact ? `（${info.ownerContact}）` : ''}` : '',
    info.notice ? `备注：${info.notice}` : ''
  ].filter(Boolean).join('\n')
}
