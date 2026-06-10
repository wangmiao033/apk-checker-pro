import rules from '@/config/channelRules.json'

export type ChannelRule = {
  id: string
  channelName: string
  name: string
  logo: string
  minTargetSdkVersion: number
  targetSdkMin: number
  requireArm64: boolean
  allowPure32Bit: boolean
  allowDebuggable: boolean
  allowCleartextTraffic: boolean
  strictHttp: boolean
  maxApkSizeMB: number
  requiredSignatureSchemes: string[]
  sensitivePermissionPolicy: Record<string, 'high' | 'medium' | 'low'>
  description: string
}

export const channelRules = rules as unknown as ChannelRule[]
