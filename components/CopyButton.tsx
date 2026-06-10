'use client'

import { useState } from 'react'

export function CopyButton({
  text,
  label = '复制',
  variant = 'dark',
  size = 'md',
  className = ''
}: {
  text: string
  label?: string
  variant?: 'dark' | 'light'
  size?: 'sm' | 'md'
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text || '')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button
      onClick={copy}
      className={`${variant === 'dark' ? 'btn-primary' : 'btn-secondary'} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      type="button"
    >
      {copied ? '已复制' : label}
    </button>
  )
}
