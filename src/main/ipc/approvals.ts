import { ipcMain } from 'electron'
import { approvalDB } from '../db'

export function registerApprovalIPC(): void {
  ipcMain.removeHandler('get-approvals')
  ipcMain.handle('get-approvals', (_, taskId: string) => approvalDB.getApprovalsByTaskId(taskId))

  ipcMain.removeHandler('create-approval')
  ipcMain.handle('create-approval', (_, approval) => approvalDB.createApproval(approval))

  ipcMain.removeHandler('update-approval-status')
  ipcMain.handle('update-approval-status', (_, id: string, status) =>
    approvalDB.updateApprovalStatus(id, status)
  )
}
