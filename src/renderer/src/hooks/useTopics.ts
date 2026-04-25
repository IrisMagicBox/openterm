import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Topic } from '../../../shared/types'

interface UseTopicsConfig {
  loadHosts: () => Promise<void>
}

interface UseTopicsResult {
  topics: Topic[]
  setTopics: Dispatch<SetStateAction<Topic[]>>
  selectedTopic: Topic | null
  setSelectedTopic: Dispatch<SetStateAction<Topic | null>>
  editingTopicId: string | null
  setEditingTopicId: Dispatch<SetStateAction<string | null>>
  editingTopicTitle: string
  setEditingTopicTitle: Dispatch<SetStateAction<string>>
  showManageHosts: boolean
  setShowManageHosts: Dispatch<SetStateAction<boolean>>
  prefilledText: string
  setPrefilledText: Dispatch<SetStateAction<string>>
  loadTopics: () => Promise<void>
  handleCreateTopic: (initialText?: string, initialHostIds?: string[]) => Promise<Topic>
  handleStartRenameTopic: (topic: Topic) => void
  handleCommitRenameTopic: () => Promise<void>
  handleDeleteTopic: (topicId: string) => Promise<void>
  handleAddHostToTopic: (hostId: string) => Promise<void>
  handleRemoveHostFromTopic: (hostId: string) => Promise<void>
  handleUpdateTopicModel: (topicId: string, providerId: string, modelId: string) => Promise<void>
}

export function useTopics(config: UseTopicsConfig): UseTopicsResult {
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
    async (initialText?: string, initialHostIds: string[] = []): Promise<Topic> => {
      const title = `Session ${topics.length + 1}`
      const topic = await window.api.createTopic(title, initialHostIds)
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

  const handleUpdateTopicModel = useCallback(
    async (topicId: string, providerId: string, modelId: string) => {
      await window.api.updateTopicModel(topicId, providerId, modelId)
      setTopics((prev) =>
        prev.map((t) =>
          t.id === topicId ? { ...t, selectedProviderId: providerId, selectedModelId: modelId } : t
        )
      )
      if (selectedTopic?.id === topicId) {
        setSelectedTopic((prev) =>
          prev ? { ...prev, selectedProviderId: providerId, selectedModelId: modelId } : null
        )
      }
    },
    [selectedTopic]
  )

  useEffect(() => {
    const unlistenTopic = window.api.onTopicUpdated(({ topicId, title, topic, deleted }) => {
      if (deleted) {
        setTopics((prev) => prev.filter((t) => t.id !== topicId))
        setSelectedTopic((prev) => (prev?.id === topicId ? null : prev))
        return
      }

      if (topic) {
        setTopics((prev) => {
          const exists = prev.some((t) => t.id === topic.id)
          if (exists) return prev.map((t) => (t.id === topic.id ? topic : t))
          return [topic, ...prev]
        })
        if (selectedTopic?.id === topic.id) setSelectedTopic(topic)
        return
      }

      if (!title) return
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
    handleRemoveHostFromTopic,
    handleUpdateTopicModel
  }
}
