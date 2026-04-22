import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  RotateCcw,
  TerminalSquare,
  X
} from 'lucide-react'
import type { AgentPart, AgentRun, Approval, Artifact } from '../../../shared/types'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton
} from './ui'
import { cn } from '../lib/utils'

interface AgentRunDetailDrawerProps {
  runId: string | null
  open: boolean
  onClose: () => void
  onRevealTerminal?: (sessionId: string, partId?: string) => void
}

function statusLabel(status: AgentRun['status'] | AgentPart['status']): string {
  if (status === 'running') return '运行中'
  if (status === 'waiting_approval') return '等待审批'
  if (status === 'completed') return '完成'
  if (status === 'failed' || status === 'error') return '失败'
  if (status === 'cancelled') return '已取消'
  if (status === 'blocked') return '阻塞'
  if (status === 'pending') return '等待'
  if (status === 'retrying') return '重试'
  if (status === 'compacting') return '压缩上下文'
  return '空闲'
}

function toneFor(status: AgentRun['status'] | AgentPart['status']): React.ComponentProps<
  typeof Badge
>['variant'] {
  if (status === 'completed') return 'success'
  if (status === 'running' || status === 'waiting_approval' || status === 'pending') return 'accent'
  if (status === 'failed' || status === 'error') return 'danger'
  if (status === 'blocked' || status === 'retrying') return 'warning'
  return 'neutral'
}

function textPreview(value?: string, limit = 900): string {
  if (!value) return ''
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function parseCommand(part: AgentPart): string {
  if (part.toolName !== 'execute_command' || !part.input) return ''
  try {
    const parsed = JSON.parse(part.input) as { command?: unknown }
    return typeof parsed.command === 'string' ? parsed.command : ''
  } catch {
    return ''
  }
}

function metadataSessionId(part: AgentPart): string | undefined {
  if (part.sessionId) return part.sessionId
  const value = part.metadata?.sessionId
  return typeof value === 'string' ? value : undefined
}

export function AgentRunDetailDrawer({
  runId,
  open,
  onClose,
  onRevealTerminal
}: AgentRunDetailDrawerProps): React.ReactElement | null {
  const [run, setRun] = useState<AgentRun | undefined>()
  const [parts, setParts] = useState<AgentPart[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!runId) return
    setLoading(true)
    try {
      const nextRun = await window.api.getAgentRun(runId)
      setRun(nextRun)
      const nextParts = await window.api.getAgentRunParts(runId)
      setParts(nextParts)
      if (nextRun?.taskId) {
        const [nextApprovals, nextArtifacts] = await Promise.all([
          window.api.getApprovals(nextRun.taskId),
          window.api.getArtifacts(nextRun.taskId)
        ])
        setApprovals(nextApprovals)
        setArtifacts(nextArtifacts)
      }
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    if (!open || !runId) return
    void refresh()
    const unlistenRun = window.api.onAgentRunUpdated((nextRun) => {
      if (nextRun.id === runId) void refresh()
    })
    const unlistenPartCreated = window.api.onAgentPartCreated((part) => {
      if (part.runId === runId) void refresh()
    })
    const unlistenPartUpdated = window.api.onAgentPartUpdated((part) => {
      if (part.runId === runId) void refresh()
    })
    return () => {
      unlistenRun()
      unlistenPartCreated()
      unlistenPartUpdated()
    }
  }, [open, refresh, runId])

  const sortedParts = useMemo(
    () => [...parts].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt),
    [parts]
  )

  if (!open || !runId) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="left-auto right-0 top-0 h-screen max-h-screen w-[min(760px,calc(100vw-1rem))] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0"
        showClose={false}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-white/65 bg-white/55 px-5 py-4 backdrop-blur-2xl">
            <div className="flex items-start justify-between gap-3">
              <DialogHeader>
                <DialogTitle>Run 详情</DialogTitle>
                <DialogDescription className="line-clamp-2">
                  {run?.goal || '正在读取运行目标...'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex shrink-0 items-center gap-2">
                {run && <Badge variant={toneFor(run.status)}>{statusLabel(run.status)}</Badge>}
                <IconButton aria-label="关闭 Run 详情" onClick={onClose}>
                  <X size={15} />
                </IconButton>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {run?.status === 'running' || run?.status === 'waiting_approval' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => run && void window.api.cancelAgentRun(run.id)}
                >
                  <X size={13} />
                  取消 Run
                </Button>
              ) : null}
              {run?.status === 'failed' || run?.status === 'cancelled' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => run && void window.api.resumeAgentRun(run.id)}
                >
                  <RotateCcw size={13} />
                  恢复 Run
                </Button>
              ) : null}
              {loading && (
                <Badge variant="neutral">
                  <Loader2 size={12} className="animate-spin" />
                  同步中
                </Badge>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <div className="rounded-lg border border-white/65 bg-white/55 p-3">
                <div className="text-[11px] font-semibold text-muted-foreground">Agent</div>
                <div className="mt-1 truncate text-sm font-bold">{run?.agentName || '-'}</div>
              </div>
              <div className="rounded-lg border border-white/65 bg-white/55 p-3">
                <div className="text-[11px] font-semibold text-muted-foreground">模型</div>
                <div className="mt-1 truncate text-sm font-bold">{run?.modelId || '-'}</div>
              </div>
              <div className="rounded-lg border border-white/65 bg-white/55 p-3">
                <div className="text-[11px] font-semibold text-muted-foreground">Part</div>
                <div className="mt-1 text-sm font-bold">{parts.length}</div>
              </div>
              <div className="rounded-lg border border-white/65 bg-white/55 p-3">
                <div className="text-[11px] font-semibold text-muted-foreground">Artifact</div>
                <div className="mt-1 text-sm font-bold">{artifacts.length}</div>
              </div>
            </div>

            {run?.usage && (
              <section className="mt-4 rounded-lg border border-white/65 bg-white/55 p-3">
                <h4 className="text-xs font-bold text-foreground">Token 用量</h4>
                <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-white/70 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(run.usage, null, 2)}
                </pre>
              </section>
            )}

            {approvals.length > 0 && (
              <section className="mt-4 rounded-lg border border-white/65 bg-white/55 p-3">
                <h4 className="text-xs font-bold text-foreground">审批记录</h4>
                <div className="mt-2 space-y-2">
                  {approvals.map((approval) => (
                    <div key={approval.id} className="rounded-md border border-white/60 bg-white/60 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[11px]">{approval.command}</span>
                        <Badge variant={approval.status === 'approved' ? 'success' : 'warning'}>
                          {approval.status}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                        <span>{approval.riskLevel}</span>
                        {approval.riskCategory && <span>{approval.riskCategory}</span>}
                        {approval.commandPattern && <span>{approval.commandPattern}</span>}
                        {approval.requiresVerification && <span>需验证</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {artifacts.length > 0 && (
              <section className="mt-4 rounded-lg border border-white/65 bg-white/55 p-3">
                <h4 className="text-xs font-bold text-foreground">Artifact</h4>
                <div className="mt-2 space-y-2">
                  {artifacts.map((artifact) => (
                    <div key={artifact.id} className="rounded-md border border-white/60 bg-white/60 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold">{artifact.title}</span>
                        <Badge variant="neutral">{artifact.type}</Badge>
                      </div>
                      <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md bg-white/70 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {textPreview(artifact.content, 1200)}
                      </pre>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-4">
              <h4 className="mb-2 text-xs font-bold text-foreground">Runtime Timeline</h4>
              <div className="space-y-2">
                {sortedParts.map((part) => {
                  const command = parseCommand(part)
                  const sessionId = metadataSessionId(part)
                  return (
                    <div
                      key={part.id}
                      className={cn(
                        'rounded-lg border p-3',
                        part.status === 'error'
                          ? 'border-danger/25 bg-danger-soft/45'
                          : 'border-white/65 bg-white/55'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            {part.status === 'running' ? (
                              <Loader2 size={13} className="animate-spin text-accent" />
                            ) : part.status === 'completed' ? (
                              <CheckCircle2 size={13} className="text-success" />
                            ) : part.status === 'error' ? (
                              <AlertTriangle size={13} className="text-danger" />
                            ) : (
                              <TerminalSquare size={13} className="text-muted-foreground" />
                            )}
                            <span className="truncate text-xs font-bold">
                              {part.toolName || part.type}
                            </span>
                            <Badge variant={toneFor(part.status)}>{statusLabel(part.status)}</Badge>
                          </div>
                          {command && (
                            <div className="mt-2 rounded-md bg-white/70 px-2 py-1 font-mono text-[11px] text-foreground">
                              {command}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {command && (
                            <IconButton
                              aria-label="复制命令"
                              className="h-7 w-7"
                              onClick={() => void navigator.clipboard.writeText(command)}
                            >
                              <Clipboard size={12} />
                            </IconButton>
                          )}
                          {sessionId && onRevealTerminal && (
                            <IconButton
                              aria-label="跳转到关联终端"
                              className="h-7 w-7"
                              onClick={() => onRevealTerminal(sessionId, part.id)}
                            >
                              <ExternalLink size={12} />
                            </IconButton>
                          )}
                        </div>
                      </div>
                      {(part.output || part.error || part.input) && (
                        <pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md border border-workspace-border bg-workspace/85 px-3 py-2 font-mono text-[11px] leading-relaxed text-workspace-foreground">
                          {textPreview(part.error || part.output || part.input)}
                        </pre>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
