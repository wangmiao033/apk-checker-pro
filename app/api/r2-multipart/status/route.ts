import { NextResponse } from 'next/server'
import { getR2Config } from '@/lib/r2Server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const configured = Boolean(getR2Config())
  return NextResponse.json({
    configured,
    mode: configured ? 'r2-multipart' : 'legacy-single-stream',
    partSizeMB: 32,
    concurrency: 6
  })
}
