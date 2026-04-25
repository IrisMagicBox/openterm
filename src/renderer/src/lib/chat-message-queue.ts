export function shouldDispatchQueuedMessage(input: {
  thinking: boolean
  queuedSendInFlight: boolean
  queueLength: number
}): boolean {
  return !input.thinking && !input.queuedSendInFlight && input.queueLength > 0
}
