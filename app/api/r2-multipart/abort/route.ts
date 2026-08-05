import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { createR2Client, getR2Config } from '@/lib/r2Server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const config = getR2Config()
  if (!config) return NextResponse.json({ ok: true })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const key = String(body?.key || '')
  const uploadId = String(body?.uploadId || '')
  if (!key.startsWith('apk-share/') || !uploadId) return NextResponse.json({ ok: true })

  await createR2Client(config).send(new AbortMultipartUploadCommand({
    Bucket: config.bucket,
    Key: key,
    UploadId: uploadId
  })).catch(() => undefined)

  return NextResponse.json({ ok: true })
}
