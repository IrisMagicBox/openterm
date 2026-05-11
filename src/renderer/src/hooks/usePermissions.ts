import { useState, useEffect, useCallback } from 'react'
import type { PermissionMode, PermissionSettings } from '../../../shared/types'

const DEFAULT_PERMISSIONS: PermissionSettings = {
  permissionMode: 'default',
  updatedAt: Date.now()
}

interface UsePermissionsResult {
  permissions: PermissionSettings
  loading: boolean
  setPermissionMode: (permissionMode: PermissionMode) => Promise<boolean>
  permissionMode: PermissionMode
  refresh: () => Promise<void>
}

export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<PermissionSettings>(DEFAULT_PERMISSIONS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPermissions()
  }, [])

  const loadPermissions = async (): Promise<void> => {
    try {
      setLoading(true)
      const savedPermissions = await window.api.getPermissions()
      setPermissions(savedPermissions)
    } catch (error) {
      console.error('Failed to load permissions:', error)
      setPermissions(DEFAULT_PERMISSIONS)
    } finally {
      setLoading(false)
    }
  }

  const savePermissionMode = useCallback(
    async (permissionMode: PermissionMode) => {
      try {
        const newPermissions = { ...permissions, permissionMode, updatedAt: Date.now() }
        await window.api.savePermissions({ permissionMode })
        setPermissions(newPermissions)
        return true
      } catch (error) {
        console.error('Failed to save permissions:', error)
        return false
      }
    },
    [permissions]
  )

  const setPermissionMode = useCallback(
    async (permissionMode: PermissionMode) => {
      return savePermissionMode(permissionMode)
    },
    [savePermissionMode]
  )

  return {
    permissions,
    loading,
    setPermissionMode,
    permissionMode: permissions.permissionMode,
    refresh: loadPermissions
  }
}
