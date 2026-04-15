import { useState, useCallback, useMemo } from 'react'
import type { Host } from '../../../shared/types'

export function useHosts() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [selectedHost, setSelectedHost] = useState<Host | null>(null)
  const [showAddHost, setShowAddHost] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const loadHosts = useCallback(async () => {
    const loadedHosts = await window.api.getHosts()
    setHosts(loadedHosts.filter((h) => h.id !== 'local'))
  }, [])

  const handleCreateHost = useCallback(async (hostData: Omit<Host, 'id' | 'createdAt'>) => {
    const newHost = await window.api.createHost(hostData)
    setHosts((prev) => [newHost, ...prev])
  }, [])

  const handleDeleteHost = useCallback(async (id: string) => {
    await window.api.deleteHost(id)
    setHosts((prev) => prev.filter((h) => h.id !== id))
  }, [])

  const filteredHosts = useMemo(
    () =>
      hosts.filter(
        (h) =>
          h.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
          h.ip.includes(searchQuery) ||
          h.username.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [hosts, searchQuery]
  )

  return {
    hosts,
    setHosts,
    selectedHost,
    setSelectedHost,
    showAddHost,
    setShowAddHost,
    searchQuery,
    setSearchQuery,
    loadHosts,
    handleCreateHost,
    handleDeleteHost,
    filteredHosts
  }
}
