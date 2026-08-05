import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { createR2Client, getR2Config, publicObjectUrl } from '@/lib/r2Server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const config = getR2Config()
  if (!config) return NextResponse.json({ error: 'R2 分片上传尚未配置。' }, { status: 503 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求参数格式错误。' }, { status: 400 })
  }

  const key = String(body?.key || '')
  const uploadId = String(body?.uploadId || '')
  const parts = Array.isArray(body?.parts) ? body.parts : []

  if (!key.startsWith('apk-share/') || !uploadId || !parts.length) {
    return NextResponse.json({ error: '完成上传参数无效。' }, { status: 400 })
  }

  const normalized = parts
    .map((part: any) => ({
      ETag: String(part?.etag || part?.ETag || '').trim(),
      PartNumber: Number(part?.partNumber || part?.PartNumber || 0)
    }))
    .filter((part: any) => part.ETag && Number.isInteger(part.PartNumber) && part.PartNumber > 0)
    .sort((a: any, b: any) => a.PartNumber - b.PartNumber)

  if (normalized.length !== parts.length) {
    return NextResponse.json({ error: '分片清单不完整。' }, { status: 400 })
  }

  await createR2Client(config).send(new CompleteMultipartUploadCommand({
    Bucket: config.bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: normalized }
  }))

  return NextResponse.json({
    apkUrl: publicObjectUrl(config, key),
    key
  })
}
