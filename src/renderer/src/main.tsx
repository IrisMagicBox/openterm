import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import { installRendererDiagnostics, reportRendererDiagnostic } from './diagnostics'
import { store } from './store'

installRendererDiagnostics()
reportRendererDiagnostic('renderer-bootstrap', {
  message: 'Renderer bootstrap started'
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RendererErrorBoundary>
      <Provider store={store}>
        <App />
      </Provider>
    </RendererErrorBoundary>
  </StrictMode>
)
