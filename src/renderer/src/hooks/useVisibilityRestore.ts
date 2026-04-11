import { useState, useEffect, useCallback } from 'react'

export function useVisibilityRestore() {
  const [animationKey, setAnimationKey] = useState(0)

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      setAnimationKey((prev) => prev + 1)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const handleFocus = () => {
      setAnimationKey((prev) => prev + 1)
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [handleVisibilityChange])

  return { animationKey }
}
