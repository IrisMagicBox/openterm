import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AgentActivityDetailSection, AgentActivityLine } from '../lib/agent-activity-summary'
import { AgentActivitySectionIcon } from '../lib/agent-activity-icons'
import { cn } from '../lib/utils'
import { MarkdownRenderer } from './MarkdownRenderer'

interface AgentActivityDetailProps {
  line?: AgentActivityLine
  fallback?: string
  isLive?: boolean
}

function sectionToneClass(tone: AgentActivityDetailSection['tone']): string {
  if (tone === 'error') return 'border-danger/20 bg-danger-soft/35 text-danger'
  if (tone === 'call') return 'border-workspace-border bg-workspace/75 text-workspace-foreground'
  if (tone === 'observation') return 'border-accent/15 bg-accent-soft/35 text-foreground'
  return 'border-workspace-border bg-workspace/85 text-workspace-foreground'
}

function markdownToneClass(tone: AgentActivityDetailSection['tone']): string {
  if (tone === 'error') return 'border-danger/20 bg-danger-soft/35 text-danger'
  if (tone === 'observation') return 'border-accent/15 bg-accent-soft/35 text-foreground'
  return 'border-workspace-border bg-workspace/85 text-workspace-foreground'
}

function defaultOpenIds(sections: AgentActivityDetailSection[]): Set<string> {
  return new Set(
    sections
      .filter((section) => section.defaultOpen || sections.length === 1)
      .map((section) => section.id)
  )
}

function sectionOpenStateKey(sections: AgentActivityDetailSection[]): string {
  return sections
    .map((section) => `${section.id}:${section.defaultOpen ? 'open' : 'closed'}`)
    .join('\n')
}

export function AgentActivityDetail({
  line,
  fallback,
  isLive = false
}: AgentActivityDetailProps): React.ReactElement | null {
  const sections = line?.sections ?? []
  const fallbackRef = useRef<HTMLPreElement>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const openStateKey = useMemo(() => sectionOpenStateKey(sections), [sections])
  const lastOpenStateKeyRef = useRef(openStateKey)
  const [openIds, setOpenIds] = useState(() => defaultOpenIds(sections))

  useEffect(() => {
    if (lastOpenStateKeyRef.current === openStateKey) return
    lastOpenStateKeyRef.current = openStateKey
    setOpenIds(defaultOpenIds(sections))
  }, [openStateKey, sections])

  useEffect(() => {
    if (!isLive) return
    const fallbackNode = fallbackRef.current
    if (fallbackNode) fallbackNode.scrollTop = fallbackNode.scrollHeight
    for (const node of Object.values(sectionRefs.current)) {
      if (node) node.scrollTop = node.scrollHeight
    }
  }, [fallback, isLive, sections])

  const toggleSection = (sectionId: string): void => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  if (sections.length === 0) {
    if (!fallback) return null
    return (
      <pre
        ref={fallbackRef}
        aria-live={isLive ? 'polite' : undefined}
        className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-workspace-border bg-workspace/85 px-3 py-2 font-mono text-xs leading-relaxed text-workspace-foreground"
      >
        {fallback}
      </pre>
    )
  }

  if (sections.length === 1 && sections[0].tone === 'observation') {
    const [section] = sections
    return (
      <div
        ref={(node) => {
          sectionRefs.current[section.id] = node
        }}
        className={cn(
          'mt-2 max-h-56 overflow-y-auto rounded-lg border px-3 py-2 text-sm leading-relaxed [&_code]:text-[0.92em] [&_h1]:mt-1 [&_h1]:text-base [&_h2]:mt-2 [&_h2]:text-sm [&_h3]:mt-2 [&_h3]:text-sm [&_ol]:mb-2 [&_p]:mb-2 [&_pre]:text-xs [&_table]:my-2 [&_ul]:mb-2',
          markdownToneClass(section.tone)
        )}
        aria-live={isLive ? 'polite' : undefined}
      >
        <MarkdownRenderer content={section.content} />
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-1.5">
      {sections.map((section) => {
        const open = openIds.has(section.id)
        return (
          <div key={section.id} className="rounded-lg border border-workspace-border/80">
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-muted-foreground transition hover:bg-black/[0.03] hover:text-foreground"
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <AgentActivitySectionIcon tone={section.tone} className="shrink-0" />
              <span>{section.label}</span>
              <span className="min-w-0 flex-1 truncate font-normal">
                {section.content.split(/\r?\n/)[0]}
              </span>
            </button>
            {open && (
              <pre
                ref={(node) => {
                  sectionRefs.current[section.id] = node
                }}
                aria-live={isLive ? 'polite' : undefined}
                className={cn(
                  'max-h-56 overflow-y-auto whitespace-pre-wrap rounded-b-lg border-t px-3 py-2 font-mono text-xs leading-relaxed',
                  sectionToneClass(section.tone)
                )}
              >
                {section.content}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
