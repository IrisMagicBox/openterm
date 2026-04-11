import { X, Plus, Terminal as TerminalIcon } from 'lucide-react'

interface TerminalTab {
  id: string
  hostAlias: string
  name?: string
  active: boolean
}

interface TerminalTabBarProps {
  tabs: TerminalTab[]
  onTabSelect: (id: string) => void
  onTabClose: (id: string) => void
  onNewTab: () => void
}

export function TerminalTabBar({ tabs, onTabSelect, onTabClose, onNewTab }: TerminalTabBarProps) {
  if (tabs.length === 0) return null

  return (
    <div className="flex items-center bg-gray-100 border-b border-gray-200 px-2 gap-0.5 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg cursor-pointer text-xs font-semibold transition-all max-w-[160px] ${
            tab.active
              ? 'bg-white text-gray-800 shadow-sm border border-gray-200 border-b-white -mb-px'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
          onClick={() => onTabSelect(tab.id)}
        >
          <TerminalIcon size={11} className={tab.active ? 'text-blue-500' : 'text-gray-400'} />
          <span className="truncate">{tab.name || tab.hostAlias}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTabClose(tab.id)
            }}
            className={`ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition ${
              tab.active ? 'opacity-60' : ''
            }`}
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={onNewTab}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition"
        title="新建终端"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
