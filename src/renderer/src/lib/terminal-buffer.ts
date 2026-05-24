export function pendingTerminalLiveDataAfterBuffer(buffer: string, pendingLiveData: string): string {
  if (!pendingLiveData) return ''
  if (!buffer) return pendingLiveData

  const maxOverlap = Math.min(buffer.length, pendingLiveData.length)
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (buffer.endsWith(pendingLiveData.slice(0, length))) {
      return pendingLiveData.slice(length)
    }
  }

  return pendingLiveData
}
