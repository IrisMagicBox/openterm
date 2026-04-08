import { configureStore } from '@reduxjs/toolkit'
import llmReducer from './llm'

export const store = configureStore({
  reducer: {
    llm: llmReducer
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
