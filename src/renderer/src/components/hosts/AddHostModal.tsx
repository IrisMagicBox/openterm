import { getErrorMessage } from '../../../../shared/errors'
import { useState } from 'react'
import { Eye, EyeOff, Plus, Save, Server } from 'lucide-react'
import { DEFAULT_SSH_PORT } from '../../../../shared/constants'
import type { Host } from '../../../../shared/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  IconButton,
  Input,
  Textarea
} from '../ui'

interface AddHostModalProps {
  host?: Host
  onClose: () => void
  onSave: (host: Omit<Host, 'id' | 'createdAt'>) => void
  onUpdate?: (id: string, updates: Partial<Omit<Host, 'id' | 'createdAt'>>) => void
}

export function AddHostModal({
  host,
  onClose,
  onSave,
  onUpdate
}: AddHostModalProps): React.ReactElement {
  const editing = Boolean(host)
  const [form, setForm] = useState({
    alias: host?.alias ?? '',
    ip: host?.ip ?? '',
    port: String(host?.port || DEFAULT_SSH_PORT),
    username: host?.username ?? 'root',
    password: host?.password ?? '',
    keyPath: host?.keyPath ?? '',
    keyContent: host?.keyContent ?? '',
    keyPassphrase: host?.keyPassphrase ?? ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showKeyPassphrase, setShowKeyPassphrase] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (): Promise<void> => {
    const alias = form.alias.trim()
    const ip = form.ip.trim()
    const username = form.username.trim()
    if (!alias || !ip || !username) {
      setError('别名、IP 和用户名是必填项。')
      return
    }
    const port = Number(form.port)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      setError('端口必须是 1-65535 之间的整数。')
      return
    }
    setSaving(true)
    try {
      const payload: Omit<Host, 'id' | 'createdAt'> = {
        alias,
        ip,
        port,
        username,
        password: form.password || undefined,
        keyPath: form.keyPath.trim() || undefined,
        keyContent: form.keyContent.trim() || undefined,
        keyPassphrase: form.keyPassphrase || undefined,
        tags: host?.tags ?? [],
        agentNotes: host?.agentNotes
      }
      if (host && onUpdate) {
        await onUpdate(host.id, payload)
      } else {
        await onSave(payload)
      }
      onClose()
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '保存失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-xl border border-white/70 bg-white/60 text-accent shadow-sm backdrop-blur-xl">
            <Server size={18} />
          </div>
          <DialogTitle>{editing ? '编辑主机' : '添加新主机'}</DialogTitle>
          <DialogDescription>配置 SSH 终点和登录凭据</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="别名">
              <Input
                value={form.alias}
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                placeholder="prod-server"
              />
            </FormField>
            <FormField label="用户名">
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="root"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="IP 地址" className="col-span-2">
              <Input
                value={form.ip}
                onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
                placeholder="192.168.1.100"
                className="font-mono"
              />
            </FormField>
            <FormField label="端口">
              <Input
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                placeholder="22"
                className="font-mono"
              />
            </FormField>
          </div>

          <FormField label="密码" hint="账号密码登录时使用；使用 SSH Key 时可以留空">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="可选"
                className="pr-10"
              />
              <IconButton
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
            </div>
          </FormField>

          <FormField label="SSH Key 内容" hint="可直接粘贴私钥内容，连接时会优先使用这里的 Key">
            <Textarea
              value={form.keyContent}
              onChange={(e) => setForm((f) => ({ ...f, keyContent: e.target.value }))}
              placeholder="ssh-private-key-placeholder"
              className="h-28 resize-y font-mono text-xs leading-5"
              spellCheck={false}
            />
          </FormField>

          <FormField label="SSH Key Passphrase" hint="加密私钥的解锁口令；保存后连接会自动使用">
            <div className="relative">
              <Input
                type={showKeyPassphrase ? 'text' : 'password'}
                value={form.keyPassphrase}
                onChange={(e) => setForm((f) => ({ ...f, keyPassphrase: e.target.value }))}
                placeholder="可选"
                className="pr-10"
              />
              <IconButton
                aria-label={
                  showKeyPassphrase ? '隐藏 SSH Key Passphrase' : '显示 SSH Key Passphrase'
                }
                type="button"
                onClick={() => setShowKeyPassphrase((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                {showKeyPassphrase ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
            </div>
          </FormField>

          <FormField label="SSH Key 路径" hint="兼容旧方式；未填写 Key 内容时使用">
            <Input
              value={form.keyPath}
              onChange={(e) => setForm((f) => ({ ...f, keyPath: e.target.value }))}
              placeholder="~/.ssh/id_rsa"
              className="font-mono"
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="primary">
            {saving ? (
              '正在保存...'
            ) : editing ? (
              <>
                <Save size={16} /> 保存修改
              </>
            ) : (
              <>
                <Plus size={16} /> 保存主机
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
