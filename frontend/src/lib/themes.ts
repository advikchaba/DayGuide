/**
 * Theme engine.
 *
 * Every theme writes a set of CSS custom properties onto <html data-theme=...>.
 * Slugs and prices mirror `backend/app/catalog.py` — keep the two lists in sync.
 */

export interface ThemeDefinition {
  slug: string
  name: string
  /** free themes are owned by everyone */
  isFree: boolean
  price: number
  rarity: 'common' | 'rare' | 'epic'
  description: string
  /** optional background art for image/meme themes */
  image?: string
  vars: Record<string, string>
}

const darkVars = {
  '--bg': '#101011',
  '--bg-soft': '#17171a',
  '--surface': '#1a1a1d',
  '--surface-2': '#242427',
  '--surface-solid': '#1d1d20',
  '--border': 'transparent',
  '--text': '#ffffff',
  '--muted': '#a3a3a3',
  '--accent': '#dcdcdc',
  '--accent-2': '#d3d3d3',
  '--accent-ink': '#111111',
  '--accent-soft': 'rgba(220, 220, 220, 0.10)',
  '--glow': 'transparent',
}

const lightVars = {
  '--bg': '#f2f2f2',
  '--bg-soft': '#ffffff',
  '--surface': '#ffffff',
  '--surface-2': '#e9e9e9',
  '--surface-solid': '#ffffff',
  '--border': 'transparent',
  '--text': '#111111',
  '--muted': '#808080',
  '--accent': '#ffffff',
  '--accent-2': '#808080',
  '--accent-ink': '#111111',
  '--accent-soft': 'rgba(0, 0, 0, 0.06)',
  '--glow': 'transparent',
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function darkVariant(accent: string, accent2: string): Record<string, string> {
  return {
    ...darkVars,
    '--accent': accent,
    '--accent-2': accent2,
    '--accent-ink': '#ffffff',
    '--accent-soft': hexToRgba(accent, 0.18),
  }
}

function imageVariant(accent: string, accent2: string, image: string): Record<string, string> {
  return { ...darkVariant(accent, accent2), '--hero-image': `url("${image}")` }
}

export const THEMES: ThemeDefinition[] = [
  {
    slug: 'dark',
    name: 'Midnight',
    isFree: true,
    price: 0,
    rarity: 'common',
    description: 'The default dark interface with pure white text.',
    vars: darkVars,
  },
  {
    slug: 'light',
    name: 'Daylight',
    isFree: true,
    price: 0,
    rarity: 'common',
    description: 'Clean light mode for daytime planning.',
    vars: lightVars,
  },
  {
    slug: 'blue',
    name: 'Electric Blue',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Deep blue with a pale blue counterpoint.',
    vars: darkVariant('#1d4ed8', '#93c5fd'),
  },
  {
    slug: 'red',
    name: 'Crimson',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'For people who attack their checklist.',
    vars: darkVariant('#b91c1c', '#fca5a5'),
  },
  {
    slug: 'green',
    name: 'Emerald',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Fresh, focused and a little bit smug.',
    vars: darkVariant('#15803d', '#86efac'),
  },
  {
    slug: 'pink',
    name: 'Bubblegum',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Deep rose with a soft pink counterpoint.',
    vars: darkVariant('#be185d', '#f9a8d4'),
  },
  {
    slug: 'yellow',
    name: 'Solar Flare',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Warm ochre with a pale gold counterpoint.',
    vars: darkVariant('#a16207', '#fde68a'),
  },
  {
    slug: 'purple',
    name: 'Ultraviolet',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Deep violet with a pale lavender counterpoint.',
    vars: darkVariant('#6d28d9', '#c4b5fd'),
  },
  {
    slug: 'meme-doge',
    name: 'Doge Mode',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Such routine. Very coins. Wow.',
    image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#b45309',
      '#fcd34d',
      'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=1600&q=70',
    ),
  },
  {
    slug: 'meme-thisisfine',
    name: 'This Is Fine',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Everything is on fire, but the checklist is done.',
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#c2410c',
      '#fdba74',
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70',
    ),
  },
  {
    slug: 'meme-cat',
    name: 'Cat Vibes',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Boss energy, nine lives, zero excuses.',
    image: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#be185d',
      '#f9a8d4',
      'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1600&q=70',
    ),
  },
  {
    slug: 'meme-frog',
    name: 'Frog Time',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Hop to it. Ribbit.',
    image: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#15803d',
      '#86efac',
      'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=1600&q=70',
    ),
  },
  {
    slug: 'meme-clown',
    name: 'Clown Mode',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'For the days you skip leg day and log it anyway.',
    image: 'https://images.unsplash.com/photo-1527261834078-9b37d35a4a32?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#b91c1c',
      '#fca5a5',
      'https://images.unsplash.com/photo-1527261834078-9b37d35a4a32?auto=format&fit=crop&w=1600&q=70',
    ),
  },
]

export const DEFAULT_THEME = 'dark'

export function getTheme(slug: string | null | undefined): ThemeDefinition {
  return THEMES.find((theme) => theme.slug === slug) ?? THEMES[0]
}

/** Apply a theme to the document (falls back to Midnight for unknown slugs). */
export function applyTheme(slug: string | null | undefined): void {
  const theme = getTheme(slug)
  const root = document.documentElement
  root.dataset.theme = theme.slug

  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value)
  }
  if (!theme.vars['--hero-image']) {
    root.style.removeProperty('--hero-image')
  }
  // Keeps form controls / scrollbars in the right colour mode.
  const isLight = theme.vars['--bg'] === lightVars['--bg']
  root.style.colorScheme = isLight ? 'light' : 'dark'
}

/* -------------------------------------------------------------------------- */
/* Avatars                                                                    */
/* -------------------------------------------------------------------------- */
export interface AvatarDefinition {
  slug: string
  name: string
  initials: string
  accent: string
}

export const AVATARS: AvatarDefinition[] = [
  { slug: 'spark', name: 'Spark', initials: 'SP', accent: '#7C5CFF' },
  { slug: 'flame', name: 'Flame', initials: 'FL', accent: '#F97316' },
  { slug: 'bolt', name: 'Bolt', initials: 'BO', accent: '#FACC15' },
  { slug: 'waves', name: 'Waves', initials: 'WV', accent: '#38BDF8' },
  { slug: 'leaf', name: 'Leaf', initials: 'LF', accent: '#22C55E' },
  { slug: 'moon', name: 'Moon', initials: 'MN', accent: '#A78BFA' },
  { slug: 'sun', name: 'Sun', initials: 'SN', accent: '#FB923C' },
  { slug: 'cat', name: 'Cat', initials: 'CT', accent: '#F472B6' },
  { slug: 'dog', name: 'Dog', initials: 'DG', accent: '#F59E0B' },
  { slug: 'frog', name: 'Frog', initials: 'FR', accent: '#4ADE80' },
  { slug: 'ghost', name: 'Ghost', initials: 'GH', accent: '#E2E8F0' },
  { slug: 'robot', name: 'Robot', initials: 'RB', accent: '#94A3B8' },
  { slug: 'alien', name: 'Alien', initials: 'AL', accent: '#34D399' },
  { slug: 'dragon', name: 'Dragon', initials: 'DR', accent: '#EF4444' },
  { slug: 'crown', name: 'Crown', initials: 'CR', accent: '#F5C542' },
  { slug: 'skull', name: 'Skull', initials: 'SK', accent: '#CBD5E1' },
  { slug: 'cherry', name: 'Cherry', initials: 'CH', accent: '#F43F5E' },
  { slug: 'rocket', name: 'Rocket', initials: 'RK', accent: '#60A5FA' },
]

export function getAvatar(slug: string | null | undefined): AvatarDefinition {
  return AVATARS.find((avatar) => avatar.slug === slug) ?? AVATARS[0]
}
