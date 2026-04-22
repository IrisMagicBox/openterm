import { X, Plus, Terminal as TerminalIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

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

export function TerminalTabBar({
  tabs,
  onTabSelect,
  onTabClose,
  onNewTab
}: TerminalTabBarProps): React.ReactElement | null {
  if (tabs.length === 0) return null

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border bg-surface-muted px-2 no-scrollbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex max-w-[160px] cursor-pointer items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors',
            tab.active
              ? 'border-accent bg-surface text-foreground'
              : 'border-transparent text-muted-foreground hover:bg-surface hover:text-foreground'
          )}
          onClick={() => onTabSelect(tab.id)}
        >
          <TerminalIcon
            size={11}
            className={tab.active ? 'text-accent' : 'text-muted-foreground'}
          />
          <span className="truncate">{tab.name || tab.hostAlias}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTabClose(tab.id)
            }}
            className={`ml-1 rounded p-0.5 opacity-0 transition hover:bg-border ${
              tab.active ? 'opacity-60' : ''
            }`}
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={onNewTab}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-border hover:text-foreground"
        title="新建终端"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
