import { configureStore } from '@reduxjs/toolkit'
import llmReducer from './llm'
import agentReducer from './agent'
import terminalReducer from './terminal'

export const store = configureStore({
  reducer: {
    llm: llmReducer,
    agent: agentReducer,
    terminal: terminalReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['llm/setDefaultModel', 'llm/addProvider', 'llm/updateProvider']
      }
    })
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
