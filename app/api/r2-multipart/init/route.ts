import { CreateMultipartUploadCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { buildObjectKey, createR2Client, getR2Config } from '@/lib/r2Server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 3 * 1024 * 1024 * 1024

export async function POST(request: NextRequest) {
  const config = getR2Config()
  if (!config) return NextResponse.json({ error: 'R2 分片上传尚未配置。' }, { status: 503 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求参数格式错误。' }, { status: 400 })
  }

  const fileName = String(body?.fileName || '')
  const size = Number(body?.size || 0)
  const contentType = String(body?.contentType || 'application/vnd.android.package-archive')

  if (!fileName.toLowerCase().endsWith('.apk')) {
    return NextResponse.json({ error: '只允许上传 APK 文件。' }, { status: 400 })
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'APK 大小无效或超过 3GB 限制。' }, { status: 400 })
  }

  const key = buildObjectKey(fileName)
  const client = createR2Client(config)
  const created = await client.send(new CreateMultipartUploadCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
    Metadata: {
      originalname: encodeURIComponent(fileName),
      size: String(size)
    }
  }))

  if (!created.UploadId) {
    return NextResponse.json({ error: 'R2 未返回 UploadId。' }, { status: 502 })
  }

  return NextResponse.json({
    key,
    uploadId: created.UploadId,
    partSize: 32 * 1024 * 1024,
    concurrency: 6
  })
}
