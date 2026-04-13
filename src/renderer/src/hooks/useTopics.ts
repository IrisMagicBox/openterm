import { useState, useEffect, useCallback } from 'react'
import type { Topic } from '../../../shared/types'

interface UseTopicsConfig {
  loadHosts: () => Promise<void>
}

export function useTopics(config: UseTopicsConfig) {
  const { loadHosts } = config

  const [topics, setTopics] = useState<Topic[]>([])
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null)
  const [editingTopicTitle, setEditingTopicTitle] = useState('')
  const [showManageHosts, setShowManageHosts] = useState(false)
  const [prefilledText, setPrefilledText] = useState('')

  const loadTopics = useCallback(async () => {
    const loadedTopics = await window.api.getTopics()
    setTopics(loadedTopics)
  }, [])

  const handleCreateTopic = useCallback(
    async (initialText?: string): Promise<Topic> => {
      const title = `Session ${topics.length + 1}`
      const topic = await window.api.createTopic(title, [])
      setTopics((prev) => [topic, ...prev])
      setSelectedTopic(topic)
      setPrefilledText(initialText || '')
      return topic
    },
    [topics.length]
  )

  const handleStartRenameTopic = useCallback((topic: Topic) => {
    setEditingTopicId(topic.id)
    setEditingTopicTitle(topic.title)
  }, [])

  const handleCommitRenameTopic = useCallback(async () => {
    if (!editingTopicId) return
    const trimmedTitle = editingTopicTitle.trim()
    if (!trimmedTitle) {
      setEditingTopicId(null)
      setEditingTopicTitle('')
      return
    }

    await window.api.updateTopicTitle(editingTopicId, trimmedTitle)
    setTopics((prev) =>
      prev.map((topic) => (topic.id === editingTopicId ? { ...topic, title: trimmedTitle } : topic))
    )
    setSelectedTopic((prev) =>
      prev && prev.id === editingTopicId ? { ...prev, title: trimmedTitle } : prev
    )
    setEditingTopicId(null)
    setEditingTopicTitle('')
  }, [editingTopicId, editingTopicTitle])

  const handleDeleteTopic = useCallback(
    async (topicId: string) => {
      await window.api.deleteTopic(topicId)
      const remainingTopics = topics.filter((topic) => topic.id !== topicId)
      setTopics(remainingTopics)

      if (selectedTopic?.id === topicId) {
        setSelectedTopic(remainingTopics[0] || null)
      }
    },
    [topics, selectedTopic]
  )

  const handleAddHostToTopic = useCallback(
    async (hostId: string) => {
      if (!selectedTopic) return
      await window.api.addHostToTopic(selectedTopic.id, hostId)
      setTopics((prev) =>
        prev.map((t) => (t.id === selectedTopic.id ? { ...t, hostIds: [...t.hostIds, hostId] } : t))
      )
      setSelectedTopic((prev) => (prev ? { ...prev, hostIds: [...prev.hostIds, hostId] } : null))
      await loadHosts()
    },
    [selectedTopic, loadHosts]
  )

  const handleRemoveHostFromTopic = useCallback(
    async (hostId: string) => {
      if (!selectedTopic) return
      await window.api.removeHostFromTopic(selectedTopic.id, hostId)
      setTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopic.id ? { ...t, hostIds: t.hostIds.filter((id) => id !== hostId) } : t
        )
      )
      setSelectedTopic((prev) =>
        prev ? { ...prev, hostIds: prev.hostIds.filter((id) => id !== hostId) } : null
      )
      await loadHosts()
    },
    [selectedTopic, loadHosts]
  )

  useEffect(() => {
    const unlistenTopic = window.api.onTopicUpdated(({ topicId, title }) => {
      setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, title } : t)))
      if (selectedTopic?.id === topicId) {
        setSelectedTopic((prev) => (prev ? { ...prev, title } : null))
      }
    })

    return () => {
      unlistenTopic()
    }
  }, [selectedTopic])

  return {
    topics,
    setTopics,
    selectedTopic,
    setSelectedTopic,
    editingTopicId,
    setEditingTopicId,
    editingTopicTitle,
    setEditingTopicTitle,
    showManageHosts,
    setShowManageHosts,
    prefilledText,
    setPrefilledText,
    loadTopics,
    handleCreateTopic,
    handleStartRenameTopic,
    handleCommitRenameTopic,
    handleDeleteTopic,
    handleAddHostToTopic,
    handleRemoveHostFromTopic
  }
}
