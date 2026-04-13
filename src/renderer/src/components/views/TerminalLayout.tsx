import { Terminal as TerminalIcon, X, Folder } from 'lucide-react'
import { TerminalView } from '../TerminalView'
import { FileBrowser } from '../terminal/FileBrowser'
import { Host } from '../../../../shared/types'
import { View, TerminalTab } from '../../types'

interface TerminalLayoutProps {
  terminalTabs: TerminalTab[]
  setTerminalTabs: React.Dispatch<React.SetStateAction<TerminalTab[]>>
  activeTerminalTabIndex: number
  setActiveTerminalTabIndex: (i: number) => void
  selectedHost: Host | null
  setSelectedHost: (h: Host | null) => void
  terminalSessionId: string | null
  setTerminalSessionId: (id: string | null) => void
  terminalFontSize: number
  setTerminalFontSize: (s: number) => void
  setActiveView: (v: View) => void
  fileBrowserHostId: string | null
  setFileBrowserHostId: (id: string | null) => void
  fileBrowserHostAlias: string
  setFileBrowserHostAlias: (alias: string) => void
}

export function TerminalLayout({
  terminalTabs,
  setTerminalTabs,
  activeTerminalTabIndex,
  setActiveTerminalTabIndex,
  selectedHost,
  setSelectedHost,
  terminalSessionId: _terminalSessionId,
  setTerminalSessionId,
  terminalFontSize,
  setTerminalFontSize,
  setActiveView,
  fileBrowserHostId,
  setFileBrowserHostId,
  fileBrowserHostAlias,
  setFileBrowserHostAlias
}: TerminalLayoutProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-gray-900 flex flex-col flex-shrink-0">
          {terminalTabs.length > 1 && (
            <div className="flex items-center border-b border-gray-700/50 px-2 pt-1 no-drag overflow-x-auto">
              {terminalTabs.map((tab, index) => (
                <button
                  key={tab.sessionId}
                  onClick={() => {
                    setActiveTerminalTabIndex(index)
                    setSelectedHost(tab.host)
                    setTerminalSessionId(tab.sessionId)
                  }}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold transition-colors border-b-2 whitespace-nowrap ${
                    index === activeTerminalTabIndex
                      ? 'text-white border-blue-500 bg-gray-800/50'
                      : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/30'
                  }`}
                >
                  <TerminalIcon size={11} />
                  <span>
                    {tab.host.alias}
                    {terminalTabs.filter((t) => t.host.id === tab.host.id).length > 1
                      ? ` #${terminalTabs.slice(0, index + 1).filter((t) => t.host.id === tab.host.id).length}`
                      : ''}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {tab.host.username}@{tab.host.ip}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const newTabs = terminalTabs.filter((_, i) => i !== index)
                      if (newTabs.length === 0) {
                        setTerminalTabs([])
                        setActiveTerminalTabIndex(0)
                        setActiveView('hosts')
                        setTerminalSessionId(null)
                        setSelectedHost(null)
                      } else {
                        const newIndex = Math.min(activeTerminalTabIndex, newTabs.length - 1)
                        setTerminalTabs(newTabs)
                        setActiveTerminalTabIndex(newIndex)
                        setSelectedHost(newTabs[newIndex].host)
                        setTerminalSessionId(newTabs[newIndex].sessionId)
                      }
                    }}
                    className="ml-1 p-0.5 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300 transition"
                  >
                    <X size={10} />
                  </button>
                </button>
              ))}
            </div>
          )}
          <div className="h-11 text-white px-5 flex items-center justify-between flex-shrink-0 drag">
            <div className="flex items-center gap-3 no-drag">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-emerald-400 rounded-full" />
              </div>
              <div className="w-px h-4 bg-gray-700" />
              <TerminalIcon size={13} className="text-blue-400" />
              <span className="text-xs font-bold font-mono text-gray-300">
                {selectedHost?.alias}
              </span>
              <span className="text-[10px] text-gray-600 font-mono">
                {selectedHost
                  ? `${selectedHost.username}@${selectedHost.ip}:${selectedHost.port || 22}`
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 no-drag">
              <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700 mr-1">
                <button
                  onClick={() => setTerminalFontSize(Math.max(terminalFontSize - 1, 6))}
                  className="px-3 py-1.5 text-xs font-black hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                  title="缩小 (Cmd -)"
                >
                  -
                </button>
                <div className="w-[1px] bg-gray-700" />
                <button
                  onClick={() => setTerminalFontSize(Math.min(terminalFontSize + 1, 30))}
                  className="px-3 py-1.5 text-xs font-black hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                  title="放大 (Cmd +)"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => {
                  if (selectedHost) {
                    setFileBrowserHostId(selectedHost.id)
                    setFileBrowserHostAlias(selectedHost.alias)
                  }
                }}
                className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-blue-400 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
                title="文件管理"
              >
                <Folder size={12} /> 文件
              </button>
              <button
                onClick={() => {
                  setTerminalTabs([])
                  setActiveTerminalTabIndex(0)
                  setActiveView('hosts')
                  setTerminalSessionId(null)
                  setSelectedHost(null)
                }}
                className="text-[11px] bg-gray-800 hover:bg-red-900/60 text-gray-500 hover:text-red-400 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5"
              >
                <X size={12} /> 断开全部
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 bg-[#1a1b1e] relative">
          {terminalTabs.map((tab, index) => (
            <div
              key={tab.sessionId}
              className="absolute inset-0"
              style={{ display: index === activeTerminalTabIndex ? 'block' : 'none' }}
            >
              <TerminalView
                id={tab.sessionId}
                fontSize={terminalFontSize}
                onClose={() => {
                  const currentIdx = index
                  const newTabs = terminalTabs.filter((_, i) => i !== currentIdx)
                  if (newTabs.length === 0) {
                    setTerminalTabs([])
                    setActiveTerminalTabIndex(0)
                    setActiveView('hosts')
                    setTerminalSessionId(null)
                    setSelectedHost(null)
                  } else {
                    const newIndex = Math.min(currentIdx, newTabs.length - 1)
                    setTerminalTabs(newTabs)
                    setActiveTerminalTabIndex(newIndex)
                    setSelectedHost(newTabs[newIndex].host)
                    setTerminalSessionId(newTabs[newIndex].sessionId)
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
      {fileBrowserHostId && (
        <div className="w-96 border-l border-gray-800 flex-shrink-0">
          <FileBrowser
            hostId={fileBrowserHostId}
            hostAlias={fileBrowserHostAlias}
            onClose={() => {
              setFileBrowserHostId(null)
              setFileBrowserHostAlias('')
            }}
          />
        </div>
      )}
    </div>
  )
}
