import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { TerminalSession } from '../../../shared/types'

export interface TerminalState {
  sessions: TerminalSession[]
  focusedSessionId: string | null
  terminalWidth: number
  fontSize: number
}

const initialState: TerminalState = {
  sessions: [],
  focusedSessionId: null,
  terminalWidth: 800,
  fontSize: 13
}

const terminalSlice = createSlice({
  name: 'terminal',
  initialState,
  reducers: {
    setSessions: (state, action: PayloadAction<TerminalSession[]>) => {
      state.sessions = action.payload
    },
    addSession: (state, action: PayloadAction<TerminalSession>) => {
      const exists = state.sessions.find((s) => s.id === action.payload.id)
      if (!exists) {
        state.sessions.push(action.payload)
      }
    },
    updateSession: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<TerminalSession> }>
    ) => {
      const idx = state.sessions.findIndex((s) => s.id === action.payload.id)
      if (idx !== -1) {
        state.sessions[idx] = { ...state.sessions[idx], ...action.payload.updates }
      }
    },
    removeSession: (state, action: PayloadAction<string>) => {
      state.sessions = state.sessions.filter((s) => s.id !== action.payload)
      if (state.focusedSessionId === action.payload) {
        state.focusedSessionId = state.sessions[0]?.id || null
      }
    },
    setFocusedSessionId: (state, action: PayloadAction<string | null>) => {
      state.focusedSessionId = action.payload
    },
    setTerminalWidth: (state, action: PayloadAction<number>) => {
      state.terminalWidth = action.payload
    },
    setFontSize: (state, action: PayloadAction<number>) => {
      state.fontSize = Math.max(6, Math.min(action.payload, 30))
    }
  }
})

export const {
  setSessions,
  addSession,
  updateSession,
  removeSession,
  setFocusedSessionId,
  setTerminalWidth,
  setFontSize
} = terminalSlice.actions
export default terminalSlice.reducer
