import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyTheme, DEFAULT_THEME, getTheme, type ThemeDefinition } from '../lib/themes'

interface ThemeContextValue {
  themeSlug: string
  theme: ThemeDefinition
  /** Applied locally after a successful equip/purchase call. */
  setTheme: (slug: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeSlug, setThemeSlug] = useState<string>(() => {
    return localStorage.getItem('routinery.theme') ?? DEFAULT_THEME
  })

  useEffect(() => {
    applyTheme(themeSlug)
    localStorage.setItem('routinery.theme', themeSlug)
  }, [themeSlug])

  const value = useMemo(
    () => ({ themeSlug, theme: getTheme(themeSlug), setTheme: (slug: string) => setThemeSlug(slug) }),
    [themeSlug],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
