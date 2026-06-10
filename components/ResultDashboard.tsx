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
  if (level === 'low' || level === 'info') return 'status-info'
  return 'status-pass'
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '未解析'
  return String(value)
}

function abiDisplay(value: boolean | null) {
  if (value === null) return 'ABI 扫描失败'
  return value ? '存在' : '不存在'
}

function logStatusText(status: string) {
  if (status === 'success') return '成功'
  if (status === 'failed') return '失败'
  return '跳过'
}

function hardCheckClass(status: string) {
  if (status === 'pass') return 'rounded-3xl border border-emerald-200 bg-emerald-50 p-5'
  if (status === 'blocker') return 'rounded-3xl border border-rose-200 bg-rose-50 p-5'
  if (status === 'warning') return 'rounded-3xl border border-amber-200 bg-amber-50 p-5'
  return 'rounded-3xl border border-slate-200 bg-slate-50 p-5'
}

function hardCheckStatusText(status: string) {
  if (status === 'pass') return '通过'
  if (status === 'blocker') return '阻断'
  if (status === 'warning') return '警告'
  return '无法解析，需要人工确认'
}

export function ResultDashboard({ result }: { result: any }) {
  if (!result) return null

  const pass = result.status === 'passed'
  const parseError = result.status === 'parse_error'
  const blockerCount = result.risks.filter((r: any) => r.level === 'blocker').length
  const passedChannels = result.channelChecks.filter((c: any) => c.passed === true).length
  const scoreText = result.score === null ? '评分不可用' : `${result.score}/100`
  const gradeText = result.grade === null ? '不可用' : `等级 ${result.grade}`

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-glow">
        <div className="absolute inset-0 bg-radial-blue opacity-80" />
        <div className="relative grid gap-8 xl:grid-cols-[1fr_330px]">
          <div>
            <div className={pass ? 'inline-flex rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-300/30' : parseError ? 'inline-flex rounded-full bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-100 ring-1 ring-amber-300/30' : 'inline-flex rounded-full bg-rose-400/15 px-4 py-2 text-sm font-semibold text-rose-200 ring-1 ring-rose-300/30'}>
              {pass ? '检测通过' : parseError ? '解析失败' : '检测不通过'}
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-tight">{result.summary}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              {parseError ? '当前环境无法完整解析该 APK，因此渠道结论和评分均不可用。请先修复检测引擎环境后重试。' : '渠道提交前检测报告已生成，可用于研发整改、运营同步和提交前复核。'}
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
            <div className={pass ? 'mt-3 text-5xl font-black text-emerald-300' : parseError ? 'mt-3 text-4xl font-black text-amber-200' : 'mt-3 text-5xl font-black text-rose-300'}>{scoreText}</div>
            <div className="mt-2 text-sm text-slate-300">{gradeText} · {result.generatedAt}</div>
            <div className="mt-5 rounded-2xl bg-white/10 p-4 text-xs leading-5 text-slate-300">
              报告编号：{result.reportMeta?.reportId}<br />
              规则版本：{result.reportMeta?.ruleVersion}<br />
              检测模式：{result.reportMeta?.detectionMode}
            </div>
            {typeof result.score === 'number' && (
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
                <div className={pass ? 'h-full bg-emerald-300' : 'h-full bg-rose-300'} style={{ width: `${result.score}%` }} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="总评分" value={scoreText} detail={gradeText} tone={parseError ? 'amber' : pass ? 'green' : 'red'} />
        <MetricCard label="阻断问题" value={parseError ? '不可用' : blockerCount} detail={parseError ? '解析失败不做阻断判定' : '必须修复后再提审'} tone={blockerCount ? 'red' : parseError ? 'amber' : 'green'} />
        <MetricCard label="通过渠道" value={parseError ? '不可用' : `${passedChannels}/${result.channelChecks.length}`} detail={parseError ? '渠道结论不可用' : '基于已选渠道规则'} tone={parseError ? 'amber' : 'blue'} />
        <MetricCard label="targetSdk" value={display(result.apkInfo.targetSdkVersion)} detail={result.checks.targetSdkOk === null ? '未解析，不参与达标判定' : result.checks.targetSdkOk ? '已达基础要求' : '低于基础要求'} tone={result.checks.targetSdkOk === null ? 'amber' : result.checks.targetSdkOk ? 'green' : 'red'} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="glass-card p-6">
          <h3 className="text-lg font-bold">APK 基础信息</h3>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ['文件名', result.apkInfo.fileName],
              ['文件大小', result.apkInfo.fileSize],
              ['appName', result.apkInfo.appName],
              ['packageName', result.apkInfo.packageName],
              ['versionName', result.apkInfo.versionName],
              ['versionCode', result.apkInfo.versionCode],
              ['minSdkVersion', result.apkInfo.minSdkVersion],
              ['targetSdkVersion', result.apkInfo.targetSdkVersion],
              ['签名', result.apkInfo.hasSignature === null ? '未解析' : result.apkInfo.hasSignature ? '已检测到' : '异常/未确认']
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="max-w-[190px] truncate text-right font-semibold">{display(v)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">CPU 架构表</h3>
            <span className={result.checks.hasArm64 === null ? 'status-warn' : result.checks.hasArm64 ? 'status-pass' : 'status-fail'}>
              {result.checks.hasArm64 === null ? 'ABI 扫描失败' : result.checks.hasArm64 ? '64 位已支持' : '缺少 64 位'}
            </span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {Object.entries(result.abiInfo).map(([abi, exists]: any) => (
              <div key={abi} className={exists === true ? 'rounded-3xl border border-emerald-200 bg-emerald-50 p-4' : exists === null ? 'rounded-3xl border border-amber-200 bg-amber-50 p-4' : 'rounded-3xl border border-slate-200 bg-slate-50 p-4'}>
                <div className="text-xs text-slate-500">{abi.includes('64') ? '64 位 ABI' : '32 位 ABI'}</div>
                <div className="mt-2 text-sm font-black">{abi}</div>
                <div className={exists === true ? 'mt-4 text-sm font-bold text-emerald-700' : exists === null ? 'mt-4 text-sm font-bold text-amber-700' : 'mt-4 text-sm font-bold text-slate-400'}>{abiDisplay(exists)}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4">
            <h4 className="font-semibold">渠道检测结果</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {result.channelChecks.map((channel: any) => (
                <div key={channel.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white">{channel.logo}</div>
                      <div className="font-semibold">{channel.name}</div>
                    </div>
                    <span className={channel.passed === null ? 'status-warn' : channel.passed ? 'status-pass' : 'status-fail'}>{channel.passed === null ? '不可用' : channel.passed ? '通过' : '不通过'}</span>
                  </div>
                  <div className="mt-3 text-sm text-slate-500">{channel.messages.join('；')}</div>
                  <div className="mt-3 text-sm font-bold">评分：{channel.score === null ? '不可用' : channel.score}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">硬性检测项</h3>
            <p className="mt-1 text-sm text-slate-500">按渠道上架前强制要求输出当前值、要求值和整改建议。无法解析时不判定为通过。</p>
          </div>
          {parseError && <span className="status-warn">无法解析，需要人工确认</span>}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {(result.hardChecks || []).map((item: any) => (
            <div key={item.key} className={hardCheckClass(item.status)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className={levelClass(item.level)}>{hardCheckStatusText(item.status)}</span>
                  <h4 className="mt-3 text-lg font-black">{item.title}</h4>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-2xl bg-white/70 p-3"><span className="text-slate-500">当前值：</span><b>{display(item.currentValue)}</b></div>
                <div className="rounded-2xl bg-white/70 p-3"><span className="text-slate-500">要求值：</span><b>{display(item.expectedValue)}</b></div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">{item.description}</p>
              <p className="mt-3 rounded-2xl bg-white/80 p-3 text-sm leading-6 text-slate-800">整改建议：{item.suggestion}</p>
              {item.unityTip && <p className="mt-3 rounded-2xl bg-slate-950 p-3 text-sm leading-6 text-slate-100">{item.unityTip}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card p-6">
        <h3 className="text-lg font-bold">检测日志</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {result.detectionLogs.map((log: any) => (
            <div key={log.key} className={log.status === 'success' ? 'rounded-3xl border border-emerald-200 bg-emerald-50 p-4' : 'rounded-3xl border border-amber-200 bg-amber-50 p-4'}>
              <div className="text-sm font-black">{log.label}</div>
              <div className={log.status === 'success' ? 'mt-2 text-sm font-bold text-emerald-700' : 'mt-2 text-sm font-bold text-amber-700'}>{logStatusText(log.status)}</div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{log.message}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card p-6">
        <h3 className="text-lg font-bold">APK Hash</h3>
        <div className="mt-4 space-y-3 rounded-3xl bg-slate-950 p-5 font-mono text-xs text-slate-100">
          <div>MD5: {result.apkHash?.md5}</div>
          <div>SHA1: {result.apkHash?.sha1}</div>
          <div>SHA256: {result.apkHash?.sha256}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="glass-card p-6">
          <h3 className="text-lg font-bold">{parseError ? '解析失败原因' : '风险雷达'}</h3>
          <div className="mt-5 space-y-3">
            {result.risks.length === 0 && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">未发现明显阻断或高风险项。</div>}
            {result.risks.map((risk: any, index: number) => (
              <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
                <span className={levelClass(risk.level)}>{risk.level}</span>
                <h4 className="mt-3 font-bold">{risk.title}</h4>
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
    </div>
  )
}
