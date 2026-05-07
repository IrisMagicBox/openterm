import { ShieldAlert, Check, X, Info, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Switch } from './ui'
import { cn } from '../lib/utils'

interface AuthModalProps {
  requestId: string
  command: string
  riskLevel?: string
  reason?: string
  metadata?: Record<string, unknown>
  onResolve: (approved: boolean, alwaysAllow?: boolean) => void
}

export function AuthModal({
  command,
  riskLevel,
  reason,
  metadata,
  onResolve
}: AuthModalProps): React.ReactElement {
  const [alwaysAllow, setAlwaysAllow] = useState(false)
  const isCritical = riskLevel?.toLowerCase() === 'critical'
  const getRiskStyles = (
    level?: string
  ): {
    badge: 'danger' | 'warning' | 'accent' | 'success'
    panel: string
    icon: React.ReactElement
    label: string
  } => {
    switch (level?.toLowerCase()) {
      case 'critical':
        return {
          badge: 'danger' as const,
          panel: 'border-danger/20 bg-danger-soft text-danger',
          icon: <ShieldAlert size={18} />,
          label: '关键风险 (系统级)'
        }
      case 'high':
        return {
          badge: 'warning' as const,
          panel: 'border-warning/20 bg-warning-soft text-warning',
          icon: <AlertTriangle size={18} />,
          label: '高风险 (破坏性命令)'
        }
      case 'medium':
        return {
          badge: 'accent' as const,
          panel: 'border-accent/20 bg-accent-soft text-accent',
          icon: <Info size={18} />,
          label: '敏感操作 (配置访问)'
        }
      default:
        return {
          badge: 'success' as const,
          panel: 'border-success/20 bg-success-soft text-success',
          icon: <ShieldCheck size={18} />,
          label: '受控操作 (需授权)'
        }
    }
  }

  const risk = getRiskStyles(riskLevel)
  const riskCategory =
    typeof metadata?.riskCategory === 'string' ? metadata.riskCategory : undefined
  const commandPattern =
    typeof metadata?.commandPattern === 'string' ? metadata.commandPattern : undefined
  const requiresVerification = metadata?.requiresVerification === true
  const permission = typeof metadata?.permission === 'string' ? metadata.permission : undefined
  const isWebSearch = permission === 'websearch'
  const actionLabel = isWebSearch ? '网页搜索' : '终端命令'
  const actionType = isWebSearch ? '搜索请求' : 'SSH 命令'
  const defaultReason = isWebSearch
    ? '需要你确认本次网页搜索。'
    : '由于当前安全策略，此操作需要你的显式授权。'
  const displayReason =
    reason && !reason.startsWith('Permission required:') ? reason : defaultReason

  return (
    <section className="overflow-hidden rounded-[16px] border border-black/[0.08] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.12)]">
      <div className="max-h-[360px] overflow-y-auto p-3 no-scrollbar">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
              risk.panel
            )}
          >
            {risk.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-bold leading-6 text-foreground">安全执行授权</h2>
              <Badge variant={risk.badge}>{risk.label}</Badge>
            </div>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Agent 请求执行自主操作，确认后会继续当前任务。
            </p>
          </div>
        </div>

        <div className={cn('mt-3 rounded-lg border px-3 py-2.5', risk.panel)}>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold">策略评估</span>
            <span className="text-[11px] font-medium text-muted-foreground">{actionType}</span>
          </div>
          <p className="text-sm font-semibold leading-5">{displayReason}</p>
        </div>

        <div className="mt-2.5 rounded-xl border border-workspace-border bg-workspace px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-workspace-muted-foreground">
            <span>{actionLabel}</span>
            <span>{actionType}</span>
          </div>
          <code className="block break-all font-mono text-sm font-semibold leading-6 text-foreground">
            {command}
          </code>
          {(riskCategory || commandPattern || requiresVerification) && (
            <div className="mt-2.5 grid gap-1.5 border-t border-workspace-border pt-2.5 text-xs text-workspace-muted-foreground">
              {riskCategory && (
                <div className="flex justify-between gap-3">
                  <span>风险类别</span>
                  <span className="font-mono text-workspace-foreground">{riskCategory}</span>
                </div>
              )}
              {commandPattern && (
                <div className="flex justify-between gap-3">
                  <span>命令模式</span>
                  <span className="min-w-0 truncate font-mono text-workspace-foreground">
                    {commandPattern}
                  </span>
                </div>
              )}
              {requiresVerification && (
                <div className="flex justify-between gap-3">
                  <span>完成要求</span>
                  <span className="font-semibold text-warning">执行后需要只读验证</span>
                </div>
              )}
            </div>
          )}
        </div>

        {!isCritical && (
          <label className="mt-2.5 flex cursor-pointer select-none items-center gap-3 rounded-xl border border-black/[0.06] bg-black/[0.015] px-3 py-2">
            <Switch checked={alwaysAllow} onCheckedChange={setAlwaysAllow} />
            <div className="min-w-0">
              <span className="text-sm font-semibold text-foreground">总是允许同类操作</span>
              <p className="truncate text-xs text-muted-foreground">信任后，相似操作将自动执行</p>
            </div>
          </label>
        )}
      </div>

      <div className="flex gap-2.5 border-t border-black/[0.06] bg-white p-2.5">
        <Button onClick={() => onResolve(false)} variant="secondary" size="lg" className="flex-1">
          <X size={16} /> 拒绝执行
        </Button>
        <Button
          onClick={() => onResolve(true, alwaysAllow)}
          variant="primary"
          size="lg"
          className="flex-1"
        >
          <Check size={16} /> 授权运行
        </Button>
      </div>
    </section>
  )
}
