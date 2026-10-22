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
  /** optional artwork for image/meme themes */
  image?: string
  imageAlt?: string
  imagePosition?: string
  vars: Record<string, string>
}

interface ThemePalette {
  bg: string
  bgSoft: string
  surface: string
  surface2: string
  surfaceSolid: string
  text: string
  muted: string
  accent: string
  accent2: string
  accentInk?: string
  accentSoft?: string
}

const HERO_DEFAULTS = {
  '--hero-image': 'none',
  '--hero-image-opacity': '0.22',
  '--hero-image-position': 'center',
  '--hero-overlay': '0.76',
}

const darkPalette: ThemePalette = {
  bg: '#101011',
  bgSoft: '#17171a',
  surface: '#1a1a1d',
  surface2: '#242427',
  surfaceSolid: '#1d1d20',
  text: '#ffffff',
  muted: '#a3a3a3',
  accent: '#dcdcdc',
  accent2: '#d3d3d3',
  accentInk: '#111111',
  accentSoft: 'rgba(220, 220, 220, 0.10)',
}

const lightPalette: ThemePalette = {
  bg: '#f2f2f2',
  bgSoft: '#ffffff',
  surface: '#ffffff',
  surface2: '#e9e9e9',
  surfaceSolid: '#ffffff',
  text: '#111111',
  muted: '#808080',
  accent: '#ffffff',
  accent2: '#808080',
  accentInk: '#111111',
  accentSoft: 'rgba(0, 0, 0, 0.06)',
}

const bluePalette: ThemePalette = {
  bg: '#07101f',
  bgSoft: '#0a1626',
  surface: '#0d1b2f',
  surface2: '#152740',
  surfaceSolid: '#101f35',
  text: '#f3f7ff',
  muted: '#98abc7',
  accent: '#3b82f6',
  accent2: '#93c5fd',
  accentInk: '#ffffff',
}

const redPalette: ThemePalette = {
  bg: '#150809',
  bgSoft: '#1d0b0d',
  surface: '#241012',
  surface2: '#31171b',
  surfaceSolid: '#291215',
  text: '#fff6f6',
  muted: '#c6a3a3',
  accent: '#ef4444',
  accent2: '#fca5a5',
  accentInk: '#ffffff',
}

const greenPalette: ThemePalette = {
  bg: '#06110a',
  bgSoft: '#0a1a10',
  surface: '#0d2014',
  surface2: '#142f1d',
  surfaceSolid: '#102518',
  text: '#f2fff6',
  muted: '#9cc0a8',
  accent: '#22c55e',
  accent2: '#86efac',
  accentInk: '#05210f',
}

const pinkPalette: ThemePalette = {
  bg: '#160910',
  bgSoft: '#200d17',
  surface: '#28101d',
  surface2: '#351725',
  surfaceSolid: '#2d1320',
  text: '#fff5fa',
  muted: '#d0a2b8',
  accent: '#ec4899',
  accent2: '#f9a8d4',
  accentInk: '#ffffff',
}

const yellowPalette: ThemePalette = {
  bg: '#141004',
  bgSoft: '#1c1606',
  surface: '#231c0a',
  surface2: '#302612',
  surfaceSolid: '#291f0c',
  text: '#fffdf0',
  muted: '#c9ba87',
  accent: '#f59e0b',
  accent2: '#fde68a',
  accentInk: '#1b1302',
}

const purplePalette: ThemePalette = {
  bg: '#100a1b',
  bgSoft: '#171022',
  surface: '#1b1229',
  surface2: '#271a39',
  surfaceSolid: '#201530',
  text: '#faf7ff',
  muted: '#b6a5cd',
  accent: '#8b5cf6',
  accent2: '#c4b5fd',
  accentInk: '#ffffff',
}

const dogePalette: ThemePalette = {
  bg: '#0a111b',
  bgSoft: '#0e1724',
  surface: '#111c2c',
  surface2: '#1a2a40',
  surfaceSolid: '#142134',
  text: '#fffaf0',
  muted: '#b7aa91',
  accent: '#f59e0b',
  accent2: '#fcd34d',
  accentInk: '#1b1302',
}

const firePalette: ThemePalette = {
  bg: '#140a06',
  bgSoft: '#1d0f09',
  surface: '#23130b',
  surface2: '#301b0f',
  surfaceSolid: '#28160d',
  text: '#fff7f0',
  muted: '#c8a18c',
  accent: '#f97316',
  accent2: '#fdba74',
  accentInk: '#1e0d03',
}

const catPalette: ThemePalette = {
  bg: '#150d11',
  bgSoft: '#1e1319',
  surface: '#25161d',
  surface2: '#311f28',
  surfaceSolid: '#2a1821',
  text: '#fff7fa',
  muted: '#c9a6b5',
  accent: '#ec4899',
  accent2: '#f9a8d4',
  accentInk: '#ffffff',
}

const frogPalette: ThemePalette = {
  bg: '#07130a',
  bgSoft: '#0b1b10',
  surface: '#0f2115',
  surface2: '#17301f',
  surfaceSolid: '#122719',
  text: '#f4fff6',
  muted: '#a0c2aa',
  accent: '#22c55e',
  accent2: '#86efac',
  accentInk: '#06210f',
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function paletteVars(palette: ThemePalette): Record<string, string> {
  return {
    ...HERO_DEFAULTS,
    '--bg': palette.bg,
    '--bg-soft': palette.bgSoft,
    '--surface': palette.surface,
    '--surface-2': palette.surface2,
    '--surface-solid': palette.surfaceSolid,
    '--border': 'transparent',
    '--text': palette.text,
    '--muted': palette.muted,
    '--accent': palette.accent,
    '--accent-2': palette.accent2,
    '--accent-ink': palette.accentInk ?? '#111111',
    '--accent-soft': palette.accentSoft ?? hexToRgba(palette.accent, 0.2),
    '--glow': 'transparent',
  }
}

function imageVars(
  palette: ThemePalette,
  image: string,
  imagePosition = 'center',
): Record<string, string> {
  return {
    ...paletteVars(palette),
    '--hero-image': `url("${image}")`,
    '--hero-image-opacity': '1',
    '--hero-image-position': imagePosition,
    '--hero-overlay': '0.64',
  }
}

const darkVars = paletteVars(darkPalette)
const lightVars = paletteVars(lightPalette)

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
    description: 'Deep navy surfaces with electric blue controls.',
    vars: paletteVars(bluePalette),
  },
  {
    slug: 'red',
    name: 'Crimson',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'For people who attack their checklist.',
    vars: paletteVars(redPalette),
  },
  {
    slug: 'green',
    name: 'Emerald',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Fresh, focused and a little bit smug.',
    vars: paletteVars(greenPalette),
  },
  {
    slug: 'pink',
    name: 'Bubblegum',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Deep rose surfaces with a soft pink counterpoint.',
    vars: paletteVars(pinkPalette),
  },
  {
    slug: 'yellow',
    name: 'Solar Flare',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Warm ochre surfaces with a pale gold counterpoint.',
    vars: paletteVars(yellowPalette),
  },
  {
    slug: 'purple',
    name: 'Ultraviolet',
    isFree: false,
    price: 10_000,
    rarity: 'rare',
    description: 'Deep violet surfaces with a pale lavender counterpoint.',
    vars: paletteVars(purplePalette),
  },
  {
    slug: 'meme-doge',
    name: 'Good Boy',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Sit. Stay. Finish the checklist.',
    image: '/theme-art/doge.jpg',
    imageAlt: 'A bulldog puppy sitting on a sunlit lawn.',
    imagePosition: 'center 45%',
    vars: imageVars(dogePalette, '/theme-art/doge.jpg', 'center 45%'),
  },
  {
    slug: 'meme-thisisfine',
    name: 'This Is Fine',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Everything is on fire, but the checklist is done.',
    image: '/theme-art/thisisfine.jpg',
    imageAlt: 'Burning branches and leaves with glowing sparks.',
    imagePosition: 'center',
    vars: imageVars(firePalette, '/theme-art/thisisfine.jpg'),
  },
  {
    slug: 'meme-cat',
    name: 'Cat Vibes',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Boss energy, nine lives, zero excuses.',
    image: '/theme-art/cat.jpg',
    imageAlt: 'A kitten sitting on a cream knitted blanket.',
    imagePosition: 'center 40%',
    vars: imageVars(catPalette, '/theme-art/cat.jpg', 'center 40%'),
  },
  {
    slug: 'meme-frog',
    name: 'Frog Time',
    isFree: false,
    price: 20_000,
    rarity: 'epic',
    description: 'Hop to it. Ribbit.',
    image: '/theme-art/frog.jpg',
    imageAlt: 'A green tree frog sitting on a wet leaf.',
    imagePosition: 'center 50%',
    vars: imageVars(frogPalette, '/theme-art/frog.jpg', 'center 50%'),
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
  { slug: 'nova', name: 'Nova', initials: 'NV', accent: '#2DD4BF' },
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
