export function MetricCard({ label, value, detail, tone = 'slate' }: { label: string, value: string | number, detail: string, tone?: 'slate' | 'green' | 'red' | 'blue' | 'amber' }) {
  const toneMap = {
    slate: 'border-slate-200 bg-white text-slate-900 before:bg-slate-400',
    green: 'border-emerald-200 bg-emerald-50/50 text-emerald-950 before:bg-emerald-500',
    red: 'border-rose-200 bg-rose-50/50 text-rose-950 before:bg-rose-500',
    blue: 'border-sky-200 bg-sky-50/50 text-sky-950 before:bg-sky-500',
    amber: 'border-amber-200 bg-amber-50/60 text-amber-950 before:bg-amber-500'
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${toneMap[tone]}`}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  )
}
