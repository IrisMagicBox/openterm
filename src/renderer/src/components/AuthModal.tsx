import { ShieldAlert, Check, X, Info, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch
} from './ui'
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

  return (
    <Dialog open>
      <DialogContent className="max-w-lg overflow-hidden p-0" showClose={false}>
        <div className="p-5">
          <DialogHeader>
            <div
              className={cn(
                'mb-1 flex h-10 w-10 items-center justify-center rounded-md border',
                risk.panel
              )}
            >
              {risk.icon}
            </div>
            <DialogTitle>安全执行授权</DialogTitle>
            <DialogDescription>
              Agent 正在请求执行一个自主命令。请审阅安全评估及具体命令。
            </DialogDescription>
          </DialogHeader>

          <div className={cn('mt-4 rounded-lg border p-4', risk.panel)}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <Badge variant={risk.badge}>{risk.label}</Badge>
              <span className="text-xs font-medium text-muted-foreground">策略引擎评估报告</span>
            </div>
            <p className="text-sm font-semibold leading-relaxed">
              {reason || '由于当前安全策略，此命令需要您的显式授权。'}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-workspace-border bg-workspace/85 p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-workspace-muted-foreground">
              <span>拟执行命令</span>
              <span className="font-mono">ssh_execute_v1</span>
            </div>
            <code className="block break-all font-mono text-sm font-semibold leading-relaxed text-success">
              {command}
            </code>
            {(riskCategory || commandPattern || requiresVerification) && (
              <div className="mt-3 grid gap-2 border-t border-workspace-border pt-3 text-xs text-workspace-muted-foreground">
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
            <label className="mt-4 flex cursor-pointer select-none items-center gap-3 rounded-2xl border border-white/70 bg-white/55 p-3 backdrop-blur-xl">
              <Switch checked={alwaysAllow} onCheckedChange={setAlwaysAllow} />
              <div>
                <span className="text-sm font-semibold text-foreground">总是允许此类命令</span>
                <p className="text-xs text-muted-foreground">信任后，相似命令将自动执行无需确认</p>
              </div>
            </label>
          )}
        </div>

        <DialogFooter className="border-t border-white/70 bg-white/45 p-4">
          <Button onClick={() => onResolve(false)} variant="secondary" className="flex-1">
            <X size={16} /> 拒绝执行
          </Button>
          <Button onClick={() => onResolve(true, alwaysAllow)} variant="primary" className="flex-1">
            <Check size={16} /> 授权运行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
