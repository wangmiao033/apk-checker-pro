export type ChannelRule = {
  id: string
  name: string
  logo: string
  targetSdkMin: number
  requireArm64: boolean
  allowPure32Bit: boolean
  strictHttp: boolean
  description: string
}

export const channelRules: ChannelRule[] = [
  {
    id: 'generic',
    name: '通用渠道',
    logo: '⚡',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: false,
    description: '通用基础规则：64 位、targetSdk、签名和明显风险检测。'
  },
  {
    id: 'xiaomi',
    name: '小米',
    logo: 'MI',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: true,
    description: '适用于小米开放平台提交前检查。'
  },
  {
    id: 'huawei',
    name: '华为',
    logo: 'HW',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: true,
    description: '适用于华为 AppGallery 提交前检查。'
  },
  {
    id: 'oppo',
    name: 'OPPO',
    logo: 'OP',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: true,
    description: '适用于 OPPO 软件商店提交前检查。'
  },
  {
    id: 'vivo',
    name: 'vivo',
    logo: 'VV',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: true,
    description: '适用于 vivo 应用商店提交前检查。'
  },
  {
    id: 'honor',
    name: '荣耀',
    logo: 'HN',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: true,
    description: '适用于荣耀应用市场提交前检查。'
  },
  {
    id: 'taptap',
    name: 'TapTap',
    logo: 'TT',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: false,
    description: '适用于 TapTap 提交前检查。'
  },
  {
    id: 'yingyongbao',
    name: '应用宝',
    logo: 'YYB',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: true,
    description: '适用于应用宝提交前检查。'
  },
  {
    id: 'bilibili',
    name: 'B站',
    logo: 'B',
    targetSdkMin: 30,
    requireArm64: true,
    allowPure32Bit: false,
    strictHttp: false,
    description: '适用于 B站游戏渠道提交前检查。'
  }
]
