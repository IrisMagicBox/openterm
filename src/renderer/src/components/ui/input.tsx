import * as React from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'blue-ring glass-control flex h-8 w-full rounded-md px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all hover:border-accent/15 disabled:cursor-not-allowed disabled:opacity-50 no-drag',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'blue-ring glass-control flex min-h-20 w-full rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all hover:border-accent/15 disabled:cursor-not-allowed disabled:opacity-50 no-drag',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
