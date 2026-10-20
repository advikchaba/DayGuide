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
  emoji?: string
  vars: Record<string, string>
}

const darkVars = {
  '--bg': '#06060B',
  '--bg-soft': '#0C0C16',
  '--surface': 'rgba(20,20,33,0.72)',
  '--surface-2': 'rgba(31,31,50,0.72)',
  '--border': 'rgba(255,255,255,0.10)',
  '--text': '#FFFFFF',
  '--muted': '#A0A3BD',
  '--surface-solid': '#141421',
  '--accent': '#7C5CFF',
  '--accent-2': '#22D3EE',
  '--accent-ink': '#0A0A12',
  '--glow': 'rgba(124,92,255,0.45)',
}

const lightVars = {
  '--bg': '#F5F6FC',
  '--bg-soft': '#FFFFFF',
  '--surface': 'rgba(255,255,255,0.92)',
  '--surface-2': 'rgba(238,240,250,0.95)',
  '--border': 'rgba(15,23,42,0.12)',
  '--text': '#0B1020',
  '--muted': '#5A6180',
  '--surface-solid': '#FFFFFF',
  '--accent': '#5B45E0',
  '--accent-2': '#0EA5E9',
  '--accent-ink': '#FFFFFF',
  '--glow': 'rgba(91,69,224,0.28)',
}

function darkVariant(accent: string, accent2: string, glow: string): Record<string, string> {
  return { ...darkVars, '--accent': accent, '--accent-2': accent2, '--glow': glow }
}

function imageVariant(accent: string, accent2: string, glow: string, image: string): Record<string, string> {
  return { ...darkVariant(accent, accent2, glow), '--hero-image': `url("${image}")` }
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
    description: 'Cobalt accents on a deep night sky.',
    vars: darkVariant('#3B82F6', '#06B6D4', 'rgba(59,130,246,0.45)'),
  },
  {
    slug: 'red',
    name: 'Crimson',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'For people who attack their checklist.',
    vars: darkVariant('#EF4444', '#F97316', 'rgba(239,68,68,0.45)'),
  },
  {
    slug: 'green',
    name: 'Emerald',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Fresh, focused and a little bit smug.',
    vars: darkVariant('#22C55E', '#84CC16', 'rgba(34,197,94,0.42)'),
  },
  {
    slug: 'pink',
    name: 'Bubblegum',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Neon pink energy for the aesthetic grinders.',
    vars: darkVariant('#EC4899', '#A855F7', 'rgba(236,72,153,0.45)'),
  },
  {
    slug: 'yellow',
    name: 'Solar Flare',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Blindingly bright, impossible to ignore.',
    vars: darkVariant('#FACC15', '#FB923C', 'rgba(250,204,21,0.42)'),
  },
  {
    slug: 'purple',
    name: 'Ultraviolet',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Deep violet gradients and glow.',
    vars: darkVariant('#A855F7', '#6366F1', 'rgba(168,85,247,0.45)'),
  },
  {
    slug: 'meme-doge',
    name: 'Doge Mode',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Such routine. Very coins. Wow.',
    emoji: '🐕',
    image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#F59E0B',
      '#FDE68A',
      'rgba(245,158,11,0.45)',
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
    emoji: '🔥',
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#F97316',
      '#EF4444',
      'rgba(249,115,22,0.45)',
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
    emoji: '😼',
    image: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#F472B6',
      '#C084FC',
      'rgba(244,114,182,0.45)',
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
    emoji: '🐸',
    image: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#4ADE80',
      '#22D3EE',
      'rgba(74,222,128,0.42)',
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
    emoji: '🤡',
    image: 'https://images.unsplash.com/photo-1527261834078-9b37d35a4a32?auto=format&fit=crop&w=1600&q=70',
    vars: imageVariant(
      '#F43F5E',
      '#FACC15',
      'rgba(244,63,94,0.45)',
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
  emoji: string
  accent: string
}

export const AVATARS: AvatarDefinition[] = [
  { slug: 'spark', name: 'Spark', emoji: '✨', accent: '#7C5CFF' },
  { slug: 'flame', name: 'Flame', emoji: '🔥', accent: '#F97316' },
  { slug: 'bolt', name: 'Bolt', emoji: '⚡', accent: '#FACC15' },
  { slug: 'waves', name: 'Waves', emoji: '🌊', accent: '#38BDF8' },
  { slug: 'leaf', name: 'Leaf', emoji: '🌿', accent: '#22C55E' },
  { slug: 'moon', name: 'Moon', emoji: '🌙', accent: '#A78BFA' },
  { slug: 'sun', name: 'Sun', emoji: '🌞', accent: '#FB923C' },
  { slug: 'cat', name: 'Cat', emoji: '🐱', accent: '#F472B6' },
  { slug: 'dog', name: 'Dog', emoji: '🐶', accent: '#F59E0B' },
  { slug: 'frog', name: 'Frog', emoji: '🐸', accent: '#4ADE80' },
  { slug: 'ghost', name: 'Ghost', emoji: '👻', accent: '#E2E8F0' },
  { slug: 'robot', name: 'Robot', emoji: '🤖', accent: '#94A3B8' },
  { slug: 'alien', name: 'Alien', emoji: '👽', accent: '#34D399' },
  { slug: 'dragon', name: 'Dragon', emoji: '🐲', accent: '#EF4444' },
  { slug: 'crown', name: 'Crown', emoji: '👑', accent: '#F5C542' },
  { slug: 'skull', name: 'Skull', emoji: '💀', accent: '#CBD5E1' },
  { slug: 'cherry', name: 'Cherry', emoji: '🍒', accent: '#F43F5E' },
  { slug: 'rocket', name: 'Rocket', emoji: '🚀', accent: '#60A5FA' },
]

export function getAvatar(slug: string | null | undefined): AvatarDefinition {
  return AVATARS.find((avatar) => avatar.slug === slug) ?? AVATARS[0]
}
