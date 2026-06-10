import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { analyzeApk } from '@/lib/analyzer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SIZE = 300 * 1024 * 1024

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_')
}

export async function POST(req: NextRequest) {
  let tempPath = ''

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const channelsRaw = form.get('channels') as string | null

    if (!file) return NextResponse.json({ error: '未收到 APK 文件' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.apk')) return NextResponse.json({ error: '请上传 .apk 文件' }, { status: 400 })
    if (file.size <= 0) return NextResponse.json({ error: '文件为空' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: '文件超过 300MB 限制' }, { status: 400 })

    const safeName = safeFileName(file.name)
    tempPath = path.join(os.tmpdir(), `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safeName}`)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(tempPath, buffer)

    let selectedChannels: string[] | undefined
    try {
      selectedChannels = channelsRaw ? JSON.parse(channelsRaw) : undefined
    } catch {
      selectedChannels = undefined
    }

    const result = analyzeApk(tempPath, selectedChannels)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '检测失败' }, { status: 500 })
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath) } catch {}
    }
  }
}
