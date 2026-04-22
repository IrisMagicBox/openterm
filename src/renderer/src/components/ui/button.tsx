/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '../../lib/utils'

export const buttonVariants = cva(
  'blue-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:scale-100 disabled:opacity-50 no-drag',
  {
    variants: {
      variant: {
        primary:
          'border border-accent/10 bg-accent text-white shadow-[0_8px_20px_rgba(38,119,255,0.18)] hover:bg-accent-strong hover:shadow-[0_10px_26px_rgba(38,119,255,0.24)]',
        secondary:
          'glass-control text-foreground hover:border-accent/25 hover:bg-white/80 hover:text-accent',
        ghost:
          'border border-transparent text-muted-foreground hover:border-white/70 hover:bg-white/60 hover:text-foreground hover:shadow-sm',
        subtle: 'border border-white/65 bg-white/55 text-foreground hover:bg-white/80',
        destructive:
          'border border-danger/10 bg-danger text-white shadow-[0_8px_20px_rgba(220,38,38,0.16)] hover:bg-danger-strong'
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3',
        lg: 'h-10 px-4',
        icon: 'h-8 w-8 p-0'
      }
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button'
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    )
  }
)
Button.displayName = 'Button'

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  'aria-label': string
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', ...props }, ref) => (
    <Button ref={ref} variant={variant} size="icon" className={className} {...props} />
  )
)
IconButton.displayName = 'IconButton'
