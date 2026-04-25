import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ConfirmActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
> {
  confirmChildren?: ReactNode
  confirmClassName?: string
  confirmTimeoutMs?: number
  confirmingTitle?: string
  onConfirm: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  stopPropagation?: boolean
}

export function ConfirmActionButton({
  children,
  className,
  confirmChildren,
  confirmClassName,
  confirmTimeoutMs = 3600,
  confirmingTitle = '确认',
  disabled,
  onBlur,
  onConfirm,
  stopPropagation = false,
  title,
  type = 'button',
  ...props
}: ConfirmActionButtonProps): React.ReactElement {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const ariaLabel = props['aria-label']

  const clearConfirmTimer = (): void => {
    if (timeoutRef.current === null) return
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }

  const resetConfirming = (): void => {
    clearConfirmTimer()
    setConfirming(false)
  }

  useEffect(
    () => () => {
      clearConfirmTimer()
    },
    []
  )

  const handleClick = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    if (stopPropagation) event.stopPropagation()
    if (disabled || pending) return

    if (!confirming) {
      clearConfirmTimer()
      setConfirming(true)
      timeoutRef.current = window.setTimeout(resetConfirming, confirmTimeoutMs)
      return
    }

    resetConfirming()
    setPending(true)
    try {
      await onConfirm(event)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      {...props}
      aria-label={confirming && ariaLabel ? `确认${ariaLabel}` : ariaLabel}
      aria-pressed={confirming || undefined}
      className={cn(
        'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
        className,
        confirming &&
          cn(
            'scale-[1.03] border-danger/35 bg-danger text-white shadow-[0_8px_20px_rgba(220,38,38,0.18)] ring-2 ring-danger/15 hover:border-danger/40 hover:bg-danger-strong hover:text-white',
            confirmClassName
          )
      )}
      disabled={disabled || pending}
      onBlur={onBlur}
      onClick={(event) => void handleClick(event)}
      title={confirming ? confirmingTitle : title}
      type={type}
    >
      {confirming && confirmChildren !== undefined ? confirmChildren : children}
    </button>
  )
}
