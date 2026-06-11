import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { analyzeApk } from '@/lib/analyzer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SIZE = 4 * 1024 * 1024

function safeFileName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_')
}

function normalizeApkName(name: string) {
  const safe = safeFileName(name || 'upload')
  const normalized = safe
    .replace(/\.apk(?:[._-]?\d+|\(\d+\)|\.txt)$/i, '.apk')
    .replace(/\.apk\.[^.]+$/i, '.apk')
  if (/\.apk$/i.test(normalized)) return normalized
  return `${normalized.replace(/\.[^.]{1,12}$/i, '') || 'upload'}.apk`
}

export async function POST(req: NextRequest) {
  let tempPath = ''

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const channelsRaw = form.get('channels') as string | null
    const channelRulesRaw = form.get('channelRules') as string | null

    if (!file) return NextResponse.json({ error: '未收到 APK 文件' }, { status: 400 })
    if (file.size <= 0) return NextResponse.json({ error: '文件为空' }, { status: 400 })
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '当前演示环境最大支持 4MB。生产环境请配置独立检测后端。' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const isZip = buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b
    if (!isZip) {
      const apkLikeName = /\.apk(?:$|[._(-])/i.test(file.name)
      return NextResponse.json({ error: apkLikeName ? '文件后缀疑似 APK，但内容不是有效 APK。' : '当前文件不是有效 APK，请确认文件内容是否正确。' }, { status: 400 })
    }

    const normalizedFileName = normalizeApkName(file.name)
    const safeName = safeFileName(normalizedFileName)
    tempPath = path.join(os.tmpdir(), `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safeName}`)
    fs.writeFileSync(tempPath, buffer)

    let selectedChannels: string[] | undefined
    try {
      selectedChannels = channelsRaw ? JSON.parse(channelsRaw) : undefined
    } catch {
      selectedChannels = undefined
    }

    let selectedRules: any[] | undefined
    try {
      const parsed = channelRulesRaw ? JSON.parse(channelRulesRaw) : undefined
      selectedRules = Array.isArray(parsed) ? parsed : undefined
    } catch {
      selectedRules = undefined
    }

    return NextResponse.json(analyzeApk(tempPath, selectedChannels, selectedRules, {
      originalFileName: file.name,
      storedFileName: path.basename(tempPath),
      mimeType: file.type || '未提供',
      uploadIdentification: {
        originalFileName: file.name,
        normalizedFileName,
        detectedFileType: 'apk',
        isApkLike: true,
        isNormalized: normalizedFileName !== safeFileName(file.name) || !/\.apk$/i.test(file.name),
        normalizeReason: normalizedFileName !== safeFileName(file.name) || !/\.apk$/i.test(file.name)
          ? '文件内容识别为 APK，已自动按 .apk 处理'
          : '文件内容识别为标准 APK',
        identificationEvidence: ['检测到 ZIP 文件头 PK；完整 APK 结构由独立检测后端进一步确认']
      }
    }))
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '检测失败' }, { status: 500 })
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath) } catch {}
    }
  }
}
