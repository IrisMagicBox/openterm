import { useState, useEffect, useCallback } from 'react'
import type { Message } from '../../../shared/types'

export function useChatMessages(topicId: string, thinking?: boolean) {
  const [messages, setMessages] = useState<Message[]>([])
  const [activeSteps, setActiveSteps] = useState<Message[]>([])
  const [messageQueue, setMessageQueue] = useState<{ id: string; content: string }[]>([])
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const fetchHistory = async () => {
      const history = await window.api.getMessages(topicId)
      setMessages(history)
      setActiveSteps([])
    }
    fetchHistory()

    const unlistenStep = window.api.onAgentStep((step) => {
      if (step.topicId === topicId) {
        if (step.metadata?.agentStatus && !step.content) {
          setActiveSteps((prev) => [...prev, step])
        } else if (step.content && step.role === 'assistant') {
          setActiveSteps([])
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
    return () => unlistenStep()
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
    messageQueue,
    expandedThoughts,
    sendMessage,
    toggleThought,
    removeQueuedMessage,
    clearQueue
  }
}
