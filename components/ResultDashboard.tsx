'use client'

import { CopyButton } from './CopyButton'
import { MetricCard } from './MetricCard'

function downloadText(filename: string, content: string, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function levelClass(level: string) {
  if (level === 'blocker' || level === 'high') return 'status-fail'
  if (level === 'medium') return 'status-warn'
  if (level === 'low') return 'status-info'
  return 'status-pass'
}

export function ResultDashboard({ result }: { result: any }) {
  if (!result) return null

  const pass = result.status === 'passed'
  const blockerCount = result.risks.filter((r: any) => r.level === 'blocker').length
  const passedChannels = result.channelChecks.filter((c: any) => c.passed).length

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-glow">
        <div className="absolute inset-0 bg-radial-blue opacity-80" />
        <div className="absolute inset-0 bg-radial-purple opacity-80" />
        <div className="relative grid gap-8 xl:grid-cols-[1fr_330px]">
          <div>
            <div className={pass ? 'inline-flex rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-300/30' : 'inline-flex rounded-full bg-rose-400/15 px-4 py-2 text-sm font-semibold text-rose-200 ring-1 ring-rose-300/30'}>
              {pass ? 'Ready for submit' : 'Blocked before submit'}
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-tight">{result.summary}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              渠道提交前报告已生成。该报告用于研发整改、运营同步和渠道提审前复核。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <CopyButton text={result.developerMessage} label="复制研发整改说明" variant="light" />
              <CopyButton text={result.operationMessage} label="复制运营话术" variant="light" />
              <button onClick={() => downloadText('apkflow-report.json', JSON.stringify(result, null, 2))} className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/15">下载 JSON</button>
              <button onClick={() => downloadText('apkflow-channel-report.html', result.htmlReport, 'text/html;charset=utf-8')} className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/15">下载 HTML 报告</button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
            <div className="text-sm text-slate-300">APKFlow Score</div>
            <div className={pass ? 'mt-3 text-7xl font-black text-emerald-300' : 'mt-3 text-7xl font-black text-rose-300'}>{result.score}</div>
            <div className="mt-2 text-sm text-slate-300">等级 {result.grade} · {result.generatedAt}</div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
              <div className={pass ? 'h-full bg-emerald-300' : 'h-full bg-rose-300'} style={{ width: `${result.score}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="总评分" value={`${result.score}/100`} detail={`等级 ${result.grade}`} tone={pass ? 'green' : 'red'} />
        <MetricCard label="阻断问题" value={blockerCount} detail="必须修复后再提审" tone={blockerCount ? 'red' : 'green'} />
        <MetricCard label="通过渠道" value={`${passedChannels}/${result.channelChecks.length}`} detail="基于已选渠道规则" tone="blue" />
        <MetricCard label="targetSdk" value={result.apkInfo.targetSdkVersion ?? '-'} detail={result.checks.targetSdkOk ? '已达基础要求' : '低于基础要求'} tone={result.checks.targetSdkOk ? 'green' : 'amber'} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="glass-card p-6">
          <h3 className="text-lg font-bold">APK 基础信息</h3>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ['文件名', result.apkInfo.fileName],
              ['文件大小', result.apkInfo.fileSize],
              ['包名', result.apkInfo.packageName || '-'],
              ['versionName', result.apkInfo.versionName || '-'],
              ['versionCode', result.apkInfo.versionCode || '-'],
              ['minSdkVersion', result.apkInfo.minSdkVersion ?? '-'],
              ['targetSdkVersion', result.apkInfo.targetSdkVersion ?? '-'],
              ['签名', result.apkInfo.hasSignature ? '已检测到' : '异常/未确认']
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="max-w-[190px] truncate text-right font-semibold">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">CPU 架构矩阵</h3>
            <span className={result.checks.hasArm64 ? 'status-pass' : 'status-fail'}>{result.checks.hasArm64 ? '64 位已支持' : '64 位缺失'}</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {Object.entries(result.abiInfo).map(([abi, exists]) => (
              <div key={abi} className={exists ? 'rounded-3xl border border-emerald-200 bg-emerald-50 p-4' : 'rounded-3xl border border-slate-200 bg-slate-50 p-4'}>
                <div className="text-xs text-slate-500">{abi.includes('64') ? '64 位 ABI' : '32 位 ABI'}</div>
                <div className="mt-2 text-sm font-black">{abi}</div>
                <div className={exists ? 'mt-4 text-sm font-bold text-emerald-700' : 'mt-4 text-sm font-bold text-slate-400'}>{exists ? '存在' : '不存在'}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4">
            <h4 className="font-semibold">渠道规则检测</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {result.channelChecks.map((channel: any) => (
                <div key={channel.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white">{channel.logo}</div>
                      <div className="font-semibold">{channel.name}</div>
                    </div>
                    <span className={channel.passed ? 'status-pass' : 'status-fail'}>{channel.passed ? '通过' : '不通过'}</span>
                  </div>
                  <div className="mt-3 text-sm text-slate-500">{channel.messages.join('；')}</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className={channel.passed ? 'h-full bg-emerald-500' : 'h-full bg-rose-500'} style={{ width: `${channel.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="glass-card p-6">
          <h3 className="text-lg font-bold">风险雷达</h3>
          <div className="mt-5 space-y-3">
            {result.risks.length === 0 && (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
                未发现明显阻断或高风险项。
              </div>
            )}
            {result.risks.map((risk: any, index: number) => (
              <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={levelClass(risk.level)}>{risk.level}</span>
                    <h4 className="mt-3 font-bold">{risk.title}</h4>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{risk.detail}</p>
                {risk.fix && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">整改：{risk.fix}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">研发整改说明</h3>
              <CopyButton text={result.developerMessage} label="复制" />
            </div>
            <pre className="mt-5 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-3xl bg-slate-950 p-5 text-sm leading-7 text-slate-100">{result.developerMessage}</pre>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">运营同步话术</h3>
              <CopyButton text={result.operationMessage} label="复制" />
            </div>
            <pre className="mt-5 whitespace-pre-wrap rounded-3xl bg-slate-50 p-5 text-sm leading-7 text-slate-700">{result.operationMessage}</pre>
          </div>
        </div>
      </section>

      {result.httpUrls?.length > 0 && (
        <section className="glass-card p-6">
          <h3 className="text-lg font-bold">HTTP 明文地址样本</h3>
          <div className="mt-4 max-h-72 overflow-auto rounded-3xl bg-slate-950 p-5">
            {result.httpUrls.slice(0, 50).map((url: string, index: number) => (
              <div key={index} className="border-b border-white/10 py-2 font-mono text-xs text-slate-200 last:border-0">{url}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
