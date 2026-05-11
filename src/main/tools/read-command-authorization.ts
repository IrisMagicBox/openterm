import { PolicyEngine } from '../PolicyEngine'
import { permissionDB } from '../db'
import { Tool } from './tool-factory'
import { shouldRequestApproval } from '../permissions'

interface ReadCommandAuthorizationInput {
  toolName: string
  hostId: string
  command: string
  reason: string
  metadata?: Record<string, unknown>
}

type ReadCommandAuthorizationResult =
  | { ok: true; metadata: Record<string, unknown> }
  | { ok: false; output: string; metadata: Record<string, unknown> }

export async function authorizeReadCommand(
  ctx: Tool.Context,
  input: ReadCommandAuthorizationInput
): Promise<ReadCommandAuthorizationResult> {
  const policy = PolicyEngine.evaluateWithTrust(input.command, input.hostId)
  const metadata = {
    ...input.metadata,
    toolName: input.toolName,
    hostId: input.hostId,
    command: input.command,
    riskLevel: policy.riskLevel,
    riskCategory: policy.riskCategory,
    commandPattern: policy.commandPattern || PolicyEngine.normalizeCommand(input.command),
    requiresVerification: false
  }

  if (policy.action === 'deny') {
    return {
      ok: false,
      output: `Error: Command blocked by policy: ${policy.reason}`,
      metadata
    }
  }

  if (policy.action === 'confirm' && shouldRequestApproval(permissionDB.getPermissions(), policy)) {
    const approval = await ctx.requestAuthorization(
      input.command,
      policy.riskLevel,
      input.reason,
      metadata
    )
    if (!approval.approved) {
      return {
        ok: false,
        output: `Error: User rejected ${input.toolName} authorization`,
        metadata
      }
    }
  }

  ctx.updatePartMetadata?.(metadata)
  return { ok: true, metadata }
}
