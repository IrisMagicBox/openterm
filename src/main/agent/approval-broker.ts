import type { WebContents } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { AuthResponse } from '../AgentRunner'

export class ApprovalBroker {
  private webContents?: WebContents
  private pendingRequests: Map<string, (response: AuthResponse) => void> = new Map()

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents
  }

  async requestAuthorization(
    command: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical',
    reason: string
  ): Promise<AuthResponse> {
    const requestId = uuidv4()
    this.webContents?.send('agent:auth-request', { requestId, command, riskLevel, reason })
    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve)
    })
  }

  async handleAuthResponse(
    requestId: string,
    approved: boolean,
    alwaysAllow = false
  ): Promise<void> {
    const resolve = this.pendingRequests.get(requestId)
    if (resolve) {
      resolve({ approved, alwaysAllow })
      this.pendingRequests.delete(requestId)
    }
  }
}
