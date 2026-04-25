import { useState, useCallback, type Dispatch, type SetStateAction } from 'react'

export function useCommandPalette(): {
  commandPaletteOpen: boolean
  commandPaletteValue: string
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>
  setCommandPaletteValue: Dispatch<SetStateAction<string>>
  openCommandPalette: () => void
} {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteValue, setCommandPaletteValue] = useState('')

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true)
  }, [])

  return {
    commandPaletteOpen,
    commandPaletteValue,
    setCommandPaletteOpen,
    setCommandPaletteValue,
    openCommandPalette
  }
}
