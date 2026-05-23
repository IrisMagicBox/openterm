const DIAGNOSTIC_TEXT_LIMIT = 4000

function truncate(value: unknown, limit = DIAGNOSTIC_TEXT_LIMIT): string {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > limit ? `${text.slice(0, limit)}... [truncated ${text.length - limit}]` : text
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncate(error.message),
      stack: truncate(error.stack)
    }
  }

  return {
    message: truncate(error)
  }
}

export function reportRendererDiagnostic(
  type: string,
  details: Record<string, unknown> = {}
): void {
  try {
    window.api.reportRendererDiagnostic({
      type,
      href: window.location.href,
      userAgent: navigator.userAgent,
      ...details
    })
  } catch (error) {
    console.error('Failed to report renderer diagnostic', error)
  }
}

export function installRendererDiagnostics(): void {
  window.addEventListener('error', (event) => {
    reportRendererDiagnostic('window-error', {
      message: truncate(event.message),
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      ...errorDetails(event.error)
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportRendererDiagnostic('unhandled-rejection', errorDetails(event.reason))
  })
}
