import { useState, useEffect, useCallback, useRef } from 'react'
import type { AgentPart, AgentRun, Message } from '../../../shared/types'

interface ChatMessageQueueItem {
  id: string
  content: string
}

interface UseChatMessagesResult {
  messages: Message[]
  activeSteps: Message[]
  activeParts: AgentPart[]
  activeRunId: string | null
  messageQueue: ChatMessageQueueItem[]
  expandedThoughts: Record<string, boolean>
  sendMessage: (content: string) => Promise<void>
  toggleThought: (msgId: string) => void
  removeQueuedMessage: (id: string) => void
  clearQueue: () => void
}

function sortParts(parts: AgentPart[]): AgentPart[] {
  return [...parts].sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
}

function isActiveRun(run: AgentRun): boolean {
  return ['running', 'waiting_approval', 'retrying', 'compacting'].includes(run.status)
}

export function useChatMessages(topicId: string, thinking?: boolean): UseChatMessagesResult {
  const [messages, setMessages] = useState<Message[]>([])
  const [activeSteps, setActiveSteps] = useState<Message[]>([])
  const [activeParts, setActiveParts] = useState<AgentPart[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [messageQueue, setMessageQueue] = useState<ChatMessageQueueItem[]>([])
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({})
  const runCacheRef = useRef<Map<string, AgentRun | undefined>>(new Map())

  useEffect(() => {
    const fetchHistory = async (): Promise<void> => {
      const history = await window.api.getMessages(topicId)
      setMessages(history)
      setActiveSteps([])
      setActiveParts([])
      setActiveRunId(null)
      runCacheRef.current.clear()
    }
    fetchHistory()

    let disposed = false

    const getRun = async (runId: string): Promise<AgentRun | undefined> => {
      if (runCacheRef.current.has(runId)) return runCacheRef.current.get(runId)
      const run = await window.api.getAgentRun(runId)
      runCacheRef.current.set(runId, run)
      return run
    }

    const upsertPart = async (part: AgentPart): Promise<void> => {
      const run = await getRun(part.runId)
      if (disposed || run?.topicId !== topicId) return
      setActiveParts((prev) => {
        const next = prev.some((existing) => existing.id === part.id)
          ? prev.map((existing) => (existing.id === part.id ? part : existing))
          : [...prev, part]
        return sortParts(next)
      })
    }

    const unlistenStep = window.api.onAgentStep((step) => {
      if (step.topicId === topicId) {
        if (step.metadata?.agentStatus && !step.content) {
          setActiveSteps((prev) => [...prev, step])
        } else if (step.content && step.role === 'assistant') {
          setActiveSteps([])
          if (step.runId) {
            setActiveParts((prev) => prev.filter((part) => part.runId !== step.runId))
          }
          setMessages((prev) => {
            const exists = prev.find((m) => m.id === step.id)
            if (exists) return prev.map((m) => (m.id === step.id ? step : m))
            return [...prev, step]
          })
        } else {
          setActiveSteps((prev) => [...prev, step])
          setMessages((prev) => {
            const exists = prev.find((m) => m.id === step.id)
            if (exists) return prev.map((m) => (m.id === step.id ? step : m))
            return [...prev, step]
          })
        }
      }
    })
    const unlistenPartCreated = window.api.onAgentPartCreated((part) => {
      void upsertPart(part)
    })
    const unlistenPartUpdated = window.api.onAgentPartUpdated((part) => {
      void upsertPart(part)
    })
    const unlistenRunCreated = window.api.onAgentRunCreated((run) => {
      if (run.topicId !== topicId || !isActiveRun(run)) return
      setActiveRunId(run.id)
    })
    const unlistenRunUpdated = window.api.onAgentRunUpdated((run) => {
      if (run.topicId !== topicId) return
      if (isActiveRun(run)) {
        setActiveRunId(run.id)
        return
      }
      setActiveRunId((current) => (current === run.id ? null : current))
    })

    return () => {
      disposed = true
      unlistenStep()
      unlistenPartCreated()
      unlistenPartUpdated()
      unlistenRunCreated()
      unlistenRunUpdated()
    }
  }, [topicId])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return

      if (thinking) {
        setMessageQueue((prev) => [...prev, { id: Date.now().toString(), content }])
        return
      }

      const userMsg: Message = {
        id: Date.now().toString(),
        topicId,
        role: 'user',
        content,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, userMsg])

      try {
        const response = await window.api.sendMessage(topicId, content)
        setMessages((prev) => {
          const index = prev.findIndex((m) => m.id === response.id)
          if (index !== -1) {
            const newMessages = [...prev]
            newMessages[index] = response
            return newMessages
          }
          return [...prev, response]
        })
      } catch (err) {
        console.error('Agent error:', err)
        const errMsg: Message = {
          id: Date.now().toString(),
          topicId,
          role: 'assistant',
          content: '抱歉，出错了。请检查连接并重试。',
          timestamp: Date.now()
        }
        setMessages((prev) => [...prev, errMsg])
      }
    },
    [topicId, thinking]
  )

  useEffect(() => {
    if (!thinking && messageQueue.length > 0) {
      const next = messageQueue[0]
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessageQueue((prev) => prev.slice(1))
      const userMsg: Message = {
        id: next.id,
        topicId,
        role: 'user',
        content: next.content,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, userMsg])
      window.api
        .sendMessage(topicId, next.content)
        .then((response) => {
          setMessages((prev) => {
            const index = prev.findIndex((m) => m.id === response.id)
            if (index !== -1) {
              const newMessages = [...prev]
              newMessages[index] = response
              return newMessages
            }
            return [...prev, response]
          })
        })
        .catch((err) => {
          console.error('Agent error:', err)
        })
    }
  }, [thinking, messageQueue, topicId])

  const toggleThought = useCallback((msgId: string) => {
    setExpandedThoughts((p) => ({ ...p, [msgId]: !p[msgId] }))
  }, [])

  const removeQueuedMessage = useCallback((id: string) => {
    setMessageQueue((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const clearQueue = useCallback(() => {
    setMessageQueue([])
  }, [])

  return {
    messages,
    activeSteps,
    activeParts,
    activeRunId,
    messageQueue,
    expandedThoughts,
    sendMessage,
    toggleThought,
    removeQueuedMessage,
    clearQueue
  }
}
