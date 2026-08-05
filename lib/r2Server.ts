import { S3Client } from '@aws-sdk/client-s3'

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || 'https://files.hnchpower.cn').trim().replace(/\/+$/g, '')

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl }
}

export function createR2Client(config: R2Config) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  })
}

export function safeFileName(input: string) {
  const base = input.split(/[\\/]/).pop() || 'upload.apk'
  const cleaned = base
    .normalize('NFKC')
    .replace(/[^\w\u4e00-\u9fa5.()\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '')
  return (cleaned || 'upload.apk').slice(-180)
}

export function buildObjectKey(fileName: string) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `apk-share/${year}/${month}/${day}/${crypto.randomUUID()}-${safeFileName(fileName)}`
}

export function publicObjectUrl(config: R2Config, key: string) {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${config.publicBaseUrl}/${encoded}`
}
