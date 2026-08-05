import { UploadWorkspace } from '@/components/UploadWorkspace'

const fileScannerUrl = process.env.NEXT_PUBLIC_FILE_SCANNER_URL || 'https://scan.hnchpower.cn'

export default function Page() {
  return (
    <>
      <UploadWorkspace />

      <a
        href={fileScannerUrl}
        target="_blank"
        rel="noreferrer"
        className="group fixed top-[390px] z-20 hidden w-[184px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md lg:block left-[max(24px,calc((100vw-1420px)/2))]"
        aria-label="打开独立文件检测工具"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
            FS
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950">文件快检</div>
            <div className="mt-0.5 text-[11px] text-slate-500">独立分析工具</div>
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">APK、ZIP、PDF、Office 与图片快速读取。</p>

        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-900">
          <span>打开工具</span>
          <span className="transition group-hover:translate-x-0.5">↗</span>
        </div>
      </a>
    </>
  )
}
