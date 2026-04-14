import { useState, useCallback, useRef, ReactNode } from 'react'
import { ConfirmDialog, ConfirmDialogOptions } from '../components/ConfirmDialog'

interface ConfirmState extends ConfirmDialogOptions {
  resolve: ((value: boolean) => void) | null
}

const initialState: ConfirmState = {
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  variant: 'default',
  resolve: null
}

export function useConfirm(): {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
  ConfirmDialogComponent: ReactNode
} {
  const [state, setState] = useState<ConfirmState>(initialState)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({
        ...options,
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        variant: options.variant || 'default',
        resolve
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    resolveRef.current = null
    setState(initialState)
  }, [])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false)
    resolveRef.current = null
    setState(initialState)
  }, [])

  const dialogElement = state.resolve ? (
    <ConfirmDialog
      open={true}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, ConfirmDialogComponent: dialogElement }
}
