import * as React from 'react'
import { cn } from '../../lib/utils'

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
}

export function FormField({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: FormFieldProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
