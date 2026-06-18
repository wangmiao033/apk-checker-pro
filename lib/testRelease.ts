export type TestReleaseInfo = {
  id?: string
  source?: 'admin' | 'submission'
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

export const defaultTestReleaseInfo: TestReleaseInfo = {
  id: '',
  source: 'admin',
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

export function testSubmissionApiUrl() {
  const base = testReleaseApiBase()
  if (base.startsWith('/')) return '/api/test-submissions'
  try {
    return new URL('/api/test-submissions', base).toString()
  } catch {
    return '/api/test-submissions'
  }
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
