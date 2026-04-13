import type { ReactNode } from 'react'

interface NavItemProps {
  active: boolean
  icon: ReactNode
  label: string
  count?: number
  onClick: () => void
  tooltip?: string
}

export function NavItem({ active, icon, label, count, onClick, tooltip }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={label ? undefined : tooltip}
      className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all group ${
        active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
          : 'text-gray-500 hover:bg-white hover:text-gray-900 hover:shadow-sm'
      } ${!label ? 'justify-center' : ''}`}
    >
      <span
        className={active ? 'text-white' : 'text-gray-400 group-hover:text-blue-500 transition'}
      >
        {icon}
      </span>
      {label && <span className="flex-1 text-left truncate">{label}</span>}
      {count !== undefined && label && (
        <span
          className={`text-[10px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}
        >
          {count}
        </span>
      )}
      {count !== undefined && !label && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center border-2 border-gray-50 shadow-sm animate-in zoom-in">
          {count}
        </span>
      )}
    </button>
  )
}
