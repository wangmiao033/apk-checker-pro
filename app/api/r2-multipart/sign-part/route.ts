import { UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import { createR2Client, getR2Config } from '@/lib/r2Server'

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
  const partNumber = Number(body?.partNumber || 0)

  if (!key.startsWith('apk-share/') || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    return NextResponse.json({ error: '分片参数无效。' }, { status: 400 })
  }

  const command = new UploadPartCommand({
    Bucket: config.bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber
  })
  const url = await getSignedUrl(createR2Client(config), command, { expiresIn: 60 * 60 })
  return NextResponse.json({ url })
}
