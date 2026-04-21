import type { IpcRenderer, IpcRendererEvent } from 'electron'
import type {
  IpcInvokeChannels,
  IpcSendChannels,
  InvokeChannel,
  InvokeResult,
  PushChannel,
  PushPayload,
  SendChannel
} from '../shared/ipc/channels'

type InvokeArgs<C extends InvokeChannel> = IpcInvokeChannels[C]['payload'] extends unknown[]
  ? IpcInvokeChannels[C]['payload']
  : []
type SendArgs<C extends SendChannel> = IpcSendChannels[C]['payload'] extends unknown[]
  ? IpcSendChannels[C]['payload']
  : []

export function createTypedIpc(ipcRenderer: IpcRenderer): {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void
  on<C extends PushChannel>(channel: C, callback: (payload: PushPayload<C>) => void): () => void
} {
  return {
    invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>> {
      return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>
    },
    send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void {
      ipcRenderer.send(channel, ...args)
    },
    on<C extends PushChannel>(channel: C, callback: (payload: PushPayload<C>) => void): () => void {
      const listener = (_event: IpcRendererEvent, payload: PushPayload<C>): void =>
        callback(payload)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
  }
}
