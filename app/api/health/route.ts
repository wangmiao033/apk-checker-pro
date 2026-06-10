import { NextResponse } from 'next/server'
import { getEngineHealth } from '@/lib/analyzer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(getEngineHealth())
}
