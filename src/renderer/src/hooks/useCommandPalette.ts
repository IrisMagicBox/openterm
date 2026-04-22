import { useState, useEffect, useCallback } from 'react'

export function useCommandPalette() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteValue, setCommandPaletteValue] = useState('')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
