import { getErrorMessage } from '../../../../shared/errors'
import { useState } from 'react'
import { Eye, EyeOff, Plus, Server } from 'lucide-react'
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
  Input
} from '../ui'

interface AddHostModalProps {
  onClose: () => void
  onSave: (host: Omit<Host, 'id' | 'createdAt'>) => void
}

export function AddHostModal({ onClose, onSave }: AddHostModalProps): React.ReactElement {
  const [form, setForm] = useState({
    alias: '',
    ip: '',
    port: String(DEFAULT_SSH_PORT),
    username: 'root',
    password: '',
    keyPath: ''
  })
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async (): Promise<void> => {
    if (!form.alias || !form.ip || !form.username) {
      setError('别名、IP 和用户名是必填项。')
      return
    }
    setSaving(true)
    try {
      await onSave({ ...form, port: parseInt(form.port) || DEFAULT_SSH_PORT, tags: [] })
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
          <DialogTitle>添加新主机</DialogTitle>
          <DialogDescription>配置 SSH 终点</DialogDescription>
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

          <FormField label="密码" hint="留空时使用 SSH key">
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="可选"
                className="pr-10"
              />
              <IconButton
                aria-label={showPass ? '隐藏密码' : '显示密码'}
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
            </div>
          </FormField>

          <FormField label="SSH Key 路径">
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
