import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'APKFlow | APK 渠道提交前检测平台',
  description: '高级 SaaS UI 版 APK 渠道提交前检测平台：64 位、targetSdk、权限、HTTP、Debug、签名、多渠道规则与报告。',
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
