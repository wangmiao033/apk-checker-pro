import type { ReactNode } from 'react'
import { FileShareUpload } from '@/components/FileShareUpload'

export default function FileScanLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <FileShareUpload />
    </>
  )
}
