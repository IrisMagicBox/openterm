import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Message } from '../../../shared/types'

export interface AgentState {
  thinkingTopics: string[]
  activeSteps: Message[]
  messageQueue: { id: string; content: string; topicId: string }[]
}

const initialState: AgentState = {
  thinkingTopics: [],
  activeSteps: [],
  messageQueue: []
}

const agentSlice = createSlice({
  name: 'agent',
  initialState,
  reducers: {
    setThinking: (state, action: PayloadAction<{ topicId: string; thinking: boolean }>) => {
      const { topicId, thinking } = action.payload
      if (thinking) {
        if (!state.thinkingTopics.includes(topicId)) {
          state.thinkingTopics.push(topicId)
        }
      } else {
        state.thinkingTopics = state.thinkingTopics.filter((id) => id !== topicId)
      }
    },
    addStep: (state, action: PayloadAction<Message>) => {
      const exists = state.activeSteps.find((s) => s.id === action.payload.id)
      if (exists) {
        state.activeSteps = state.activeSteps.map((s) =>
          s.id === action.payload.id ? action.payload : s
        )
      } else {
        state.activeSteps.push(action.payload)
      }
    },
    clearSteps: (state) => {
      state.activeSteps = []
    },
    enqueueMessage: (
      state,
      action: PayloadAction<{ id: string; content: string; topicId: string }>
    ) => {
      state.messageQueue.push(action.payload)
    },
    dequeueMessage: (state) => {
      state.messageQueue.shift()
    },
    clearQueue: (state) => {
      state.messageQueue = []
    }
  }
})

export const { setThinking, addStep, clearSteps, enqueueMessage, dequeueMessage, clearQueue } =
  agentSlice.actions
export default agentSlice.reducer
