import { ShieldAlert, Check, X } from 'lucide-react'

interface AuthModalProps {
  requestId: string
  command: string
  onResolve: (approved: boolean) => void
}

export function AuthModal({ command, onResolve }: AuthModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
            <ShieldAlert size={32} />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 mb-2">Security Authorization</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            The Agent is requesting permission to execute a high-privilege command on a remote host. 
            Please review the command carefully before approving.
          </p>

          <div className="bg-gray-900 rounded-2xl p-5 mb-8 shadow-inner border border-gray-800">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span> High-Privilege Command
            </div>
            <code className="text-red-400 font-mono text-sm break-all leading-relaxed font-bold">
              {command}
            </code>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => onResolve(false)}
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-2xl hover:bg-gray-200 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <X size={18} /> Deny
            </button>
            <button 
              onClick={() => onResolve(true)}
              className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-2xl hover:bg-red-700 transition shadow-lg shadow-red-500/30 active:scale-95 flex items-center justify-center gap-2"
            >
              <Check size={18} /> Approve
            </button>
          </div>
        </div>
        
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-medium">PENDING APPROVAL</span>
            <span className="text-[10px] text-gray-400 font-medium">OpenTerm Security</span>
        </div>
      </div>
    </div>
  )
}
