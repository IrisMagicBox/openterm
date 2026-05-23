import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { errorDetails, reportRendererDiagnostic } from '../diagnostics'

interface RendererErrorBoundaryProps {
  children: ReactNode
}

interface RendererErrorBoundaryState {
  error: Error | null
}

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportRendererDiagnostic('react-error-boundary', {
      ...errorDetails(error),
      componentStack: info.componentStack
    })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-foreground">
        <section className="w-full max-w-2xl rounded-lg border border-danger/20 bg-danger-soft/30 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={20} />
            <div className="min-w-0">
              <h1 className="text-base font-bold">Renderer crashed before it could recover</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                错误已经写入主进程日志。请把白屏前后的终端输出贴回来，我就能继续定位。
              </p>
              <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-danger/20 bg-white/80 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                {this.state.error.stack || this.state.error.message}
              </pre>
            </div>
          </div>
        </section>
      </main>
    )
  }
}
