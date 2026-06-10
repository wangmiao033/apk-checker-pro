import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'APKFlow 渠道提审检测平台',
  description: '上传 APK，自动生成多渠道提交前检测报告。解析失败时不会输出误导性的渠道不通过结论。',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'APKFlow',
    statusBarStyle: 'black-translucent'
  }
}

export const viewport: Viewport = {
  themeColor: '#07111f',
  width: 'device-width',
  initialScale: 1
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
