import { ShieldAlert, Check, X, Info, AlertTriangle, ShieldCheck } from 'lucide-react'

interface AuthModalProps {
  requestId: string
  command: string
  riskLevel?: string
  reason?: string
  onResolve: (approved: boolean) => void
}

export function AuthModal({ command, riskLevel, reason, onResolve }: AuthModalProps) {
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="p-8">
          <div className={`w-16 h-16 ${risk.bg} ${risk.text} rounded-2xl flex items-center justify-center mb-6 shadow-sm`}>
            {risk.icon}
          </div>
          
          <h2 className="text-2xl font-black text-gray-900 mb-2">安全执行授权</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Agent 正在请求执行一个自主命令。请审阅下方的安全评估及具体命令。
          </p>

          <div className={`rounded-2xl p-4 mb-6 border ${risk.border} ${risk.bg}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center text-[10px] font-black uppercase tracking-widest gap-2">
                <span className={`w-2 h-2 ${risk.indicator} rounded-full`}></span>
                <span className={risk.text}>{risk.label}</span>
              </div>
              <span className="text-[10px] font-bold text-gray-400">策略引擎评估</span>
            </div>
            <p className={`text-xs font-bold leading-relaxed ${risk.text}`}>
              {reason || '由于当前安全策略，此命令需要您的显式授权。'}
            </p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-5 mb-8 shadow-inner border border-gray-800">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center justify-between">
                <span>拟执行命令</span>
                <span className="text-gray-700 italic lowercase font-mono">ssh_execute</span>
            </div>
            <code className="text-emerald-400 font-mono text-sm break-all leading-relaxed font-bold">
              {command}
            </code>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => onResolve(false)}
              className="flex-1 px-6 py-4 bg-gray-100 text-gray-700 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <X size={16} /> 拒绝执行
            </button>
            <button 
              onClick={() => onResolve(true)}
              className="flex-1 px-6 py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-500/30 active:scale-95 flex items-center justify-center gap-2"
            >
              <Check size={16} /> 授权运行
            </button>
          </div>
        </div>
        
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-black tracking-widest">等待人工交互授权 (HITL)</span>
            <span className="text-[10px] text-gray-400 font-black tracking-widest">OpenTerm 安全防护</span>
        </div>
      </div>
    </div>
  )
}
