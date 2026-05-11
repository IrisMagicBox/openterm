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

function withAddedHost(topic: Topic, hostId: string): Topic {
  if (topic.hostIds.includes(hostId)) return topic
  return { ...topic, hostIds: [...topic.hostIds, hostId] }
}

function withRemovedHost(topic: Topic, hostId: string): Topic {
  if (!topic.hostIds.includes(hostId)) return topic
  return { ...topic, hostIds: topic.hostIds.filter((id) => id !== hostId) }
}

function applyTopicUpdate(
  topicId: string,
  updatedTopic: Topic | undefined,
  fallback: (topic: Topic) => Topic
): (topic: Topic) => Topic {
  return (topic) => {
    if (topic.id !== topicId) return topic
    return updatedTopic ?? fallback(topic)
  }
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
      const topicId = selectedTopic.id
      const updatedTopic = await window.api.addHostToTopic(topicId, hostId)
      const applyUpdate = applyTopicUpdate(topicId, updatedTopic, (topic) =>
        withAddedHost(topic, hostId)
      )
      setTopics((prev) => prev.map(applyUpdate))
      setSelectedTopic((prev) => (prev ? applyUpdate(prev) : null))
      await loadHosts()
    },
    [selectedTopic, loadHosts]
  )

  const handleRemoveHostFromTopic = useCallback(
    async (hostId: string) => {
      if (!selectedTopic) return
      const topicId = selectedTopic.id
      const updatedTopic = await window.api.removeHostFromTopic(topicId, hostId)
      const applyUpdate = applyTopicUpdate(topicId, updatedTopic, (topic) =>
        withRemovedHost(topic, hostId)
      )
      setTopics((prev) => prev.map(applyUpdate))
      setSelectedTopic((prev) => (prev ? applyUpdate(prev) : null))
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
        setSelectedTopic((prev) => (prev?.id === topic.id ? topic : prev))
        return
      }

      if (!title) return
      setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, title } : t)))
      setSelectedTopic((prev) => (prev?.id === topicId ? { ...prev, title } : prev))
    })

    return () => {
      unlistenTopic()
    }
  }, [])

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
