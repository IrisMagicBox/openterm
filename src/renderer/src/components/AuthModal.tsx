import { ShieldAlert, Check, X, Info, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

interface AuthModalProps {
  requestId: string
  command: string
  riskLevel?: string
  reason?: string
  onResolve: (approved: boolean, alwaysAllow?: boolean) => void
}

export function AuthModal({ command, riskLevel, reason, onResolve }: AuthModalProps) {
  const [alwaysAllow, setAlwaysAllow] = useState(false)
  const isCritical = riskLevel?.toLowerCase() === 'critical'
  const getRiskStyles = (level?: string) => {
    switch (level?.toLowerCase()) {
      case 'critical':
        return {
          bg: 'bg-red-500/10',
          text: 'text-red-500',
          border: 'border-red-500/20',
          indicator: 'bg-red-500',
          label: '关键风险 (系统级)',
          icon: <ShieldAlert size={14} />
        }
      case 'high':
        return {
          bg: 'bg-amber-500/10',
          text: 'text-amber-500',
          border: 'border-amber-500/20',
          indicator: 'bg-amber-500',
          label: '高风险 (破坏性命令)',
          icon: <AlertTriangle size={14} />
        }
      case 'medium':
        return {
          bg: 'bg-blue-500/10',
          text: 'text-blue-500',
          border: 'border-blue-500/20',
          indicator: 'bg-blue-500',
          label: '敏感操作 (配置访问)',
          icon: <Info size={14} />
        }
      default:
        return {
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-500',
          border: 'border-emerald-500/20',
          indicator: 'bg-emerald-500',
          label: '受控操作 (需授权)',
          icon: <ShieldCheck size={14} />
        }
    }
  }

  const risk = getRiskStyles(riskLevel)

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
        <div className="p-10">
          <div
            className={`w-20 h-20 ${risk.bg} ${risk.text} rounded-3xl flex items-center justify-center mb-8 shadow-sm border ${risk.border}`}
          >
            {risk.icon}
          </div>

          <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">安全执行授权</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Agent 正在请求执行一个自主命令。请审阅下方的安全评估及具体命令。
          </p>

          <div className={`rounded-3xl p-6 mb-8 border ${risk.border} ${risk.bg} bg-opacity-50`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center text-[11px] font-black uppercase tracking-widest gap-2.5">
                <span className={`w-2.5 h-2.5 ${risk.indicator} rounded-full animate-pulse`}></span>
                <span className={risk.text}>{risk.label}</span>
              </div>
              <span className="text-[10px] font-bold text-gray-400 opacity-60">
                策略引擎评估报告
              </span>
            </div>
            <p className={`text-sm font-bold leading-relaxed ${risk.text}`}>
              {reason || '由于当前安全策略，此命令需要您的显式授权。'}
            </p>
          </div>

          <div className="bg-gray-900 rounded-[32px] p-7 mb-6 shadow-2xl border border-gray-800 relative group">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center justify-between">
              <span>拟执行命令</span>
              <span className="text-gray-700 italic lowercase font-mono">ssh_execute_v1</span>
            </div>
            <code className="text-emerald-400 font-mono text-base break-all leading-relaxed font-bold block">
              {command}
            </code>
          </div>

          {!isCritical && (
            <label className="flex items-center gap-3 mb-8 cursor-pointer select-none group">
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${alwaysAllow ? 'bg-blue-600 border-blue-600' : 'border-gray-300 group-hover:border-blue-400'}`}
              >
                {alwaysAllow && <Check size={12} className="text-white" />}
              </div>
              <input
                type="checkbox"
                checked={alwaysAllow}
                onChange={(e) => setAlwaysAllow(e.target.checked)}
                className="sr-only"
              />
              <div>
                <span className="text-sm font-bold text-gray-700">总是允许此类命令</span>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  信任后，相似命令将自动执行无需确认
                </p>
              </div>
            </label>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => onResolve(false)}
              className="flex-1 px-8 py-5 bg-gray-100 text-gray-700 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition active:scale-95 flex items-center justify-center gap-3"
            >
              <X size={18} /> 拒绝执行
            </button>
            <button
              onClick={() => onResolve(true, alwaysAllow)}
              className="flex-1 px-8 py-5 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition shadow-xl shadow-blue-500/40 active:scale-95 flex items-center justify-center gap-3"
            >
              <Check size={18} /> 授权运行
            </button>
          </div>
        </div>

        <div className="px-10 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] text-gray-400 font-black tracking-widest">
              HITL 实时保护中
            </span>
          </div>
          <span className="text-[10px] text-gray-400 font-black tracking-widest opacity-40">
            OpenTerm SECURITY
          </span>
        </div>
      </div>
    </div>
  )
}
