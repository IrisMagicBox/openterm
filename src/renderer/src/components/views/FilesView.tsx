import { Folder, X } from 'lucide-react'
import { FileBrowser } from '../terminal/FileBrowser'
import { View } from '../../types'

interface FilesViewProps {
  fileBrowserHostId: string
  fileBrowserHostAlias: string
  setFileBrowserHostId: (id: string | null) => void
  setFileBrowserHostAlias: (alias: string) => void
  setActiveView: (v: View) => void
}

export function FilesView({
  fileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostId,
  setFileBrowserHostAlias,
  setActiveView
}: FilesViewProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-11 bg-white text-gray-900 px-5 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Folder size={15} className="text-blue-500" />
          <span className="text-xs font-bold">{fileBrowserHostAlias}</span>
          <span className="text-[10px] text-gray-400">文件管理</span>
        </div>
        <button
          onClick={() => {
            setFileBrowserHostId(null)
            setFileBrowserHostAlias('')
            setActiveView('hosts')
          }}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <FileBrowser
          hostId={fileBrowserHostId}
          hostAlias={fileBrowserHostAlias}
          onClose={() => {
            setFileBrowserHostId(null)
            setFileBrowserHostAlias('')
            setActiveView('hosts')
          }}
        />
      </div>
    </div>
  )
}
