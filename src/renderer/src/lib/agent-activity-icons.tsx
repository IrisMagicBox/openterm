import {
  ClipboardCheck,
  Code2,
  Eye,
  FileText,
  Globe,
  ListChecks,
  PencilLine,
  Search,
  ShieldCheck,
  TerminalSquare
} from 'lucide-react'
import type { AgentActivityDetailSection, AgentActivityKind } from './agent-activity-summary'

interface ActivityIconProps {
  kind: AgentActivityKind
  toolName?: string
  className?: string
  size?: number
}

interface SectionIconProps {
  tone: AgentActivityDetailSection['tone']
  className?: string
  size?: number
}

export function AgentActivityIcon({
  kind,
  toolName,
  className,
  size = 13
}: ActivityIconProps): React.ReactElement {
  if (kind === 'think') return <Eye size={size} className={className} />
  if (kind === 'plan') return <ListChecks size={size} className={className} />
  if (kind === 'approval') return <ShieldCheck size={size} className={className} />
  if (kind === 'edit') return <PencilLine size={size} className={className} />
  if (kind === 'command') return <TerminalSquare size={size} className={className} />
  if (toolName === 'websearch') return <Search size={size} className={className} />
  if (toolName === 'webfetch') return <Globe size={size} className={className} />
  if (toolName === 'read_file' || toolName === 'write_file') {
    return <FileText size={size} className={className} />
  }
  if (kind === 'explore') return <Search size={size} className={className} />
  return <Code2 size={size} className={className} />
}

export function AgentActivitySectionIcon({
  tone,
  className,
  size = 12
}: SectionIconProps): React.ReactElement {
  if (tone === 'observation') return <Eye size={size} className={className} />
  if (tone === 'call') return <Code2 size={size} className={className} />
  if (tone === 'error') return <ShieldCheck size={size} className={className} />
  return <ClipboardCheck size={size} className={className} />
}
