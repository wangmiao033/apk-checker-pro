export function MetricCard({ label, value, detail, tone = 'slate' }: { label: string, value: string | number, detail: string, tone?: 'slate' | 'green' | 'red' | 'blue' | 'amber' }) {
  const toneMap = {
    slate: 'from-slate-900 to-slate-700 text-white',
    green: 'from-emerald-500 to-teal-600 text-white',
    red: 'from-rose-500 to-red-600 text-white',
    blue: 'from-blue-500 to-indigo-600 text-white',
    amber: 'from-amber-400 to-orange-500 text-white'
  }

  return (
    <div className={`rounded-3xl bg-gradient-to-br ${toneMap[tone]} p-5 shadow-glow`}>
      <div className="text-sm opacity-80">{label}</div>
      <div className="mt-3 text-3xl font-black">{value}</div>
      <div className="mt-2 text-xs leading-5 opacity-80">{detail}</div>
    </div>
  )
}
