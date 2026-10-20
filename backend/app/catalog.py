"""The unlockable catalogue: themes and profile pictures.

Prices follow the product spec:
  * colour themes ......... 10,000 coins
  * image / meme themes ... 20,000 coins
  * profile pictures ...... 600 coins
  * light + dark themes ... free defaults

``meta`` carries everything the frontend needs to render the cosmetic
(accent colour, emoji art, background image url, ...).
"""

from __future__ import annotations

BASE_PRICE_THEME = 10_000
BASE_PRICE_IMAGE_THEME = 20_000
BASE_PRICE_AVATAR = 600

# --- themes ----------------------------------------------------------------- #
_THEMES: list[dict] = [
    {
        "slug": "dark",
        "name": "Midnight",
        "description": "The classic dark interface with pure white text.",
        "rarity": "common",
        "free": True,
        "meta": {"kind": "solid", "accent": "#7C5CFF", "accent2": "#22D3EE", "mode": "dark"},
    },
    {
        "slug": "light",
        "name": "Daylight",
        "description": "Clean light interface for daytime planning.",
        "rarity": "common",
        "free": True,
        "meta": {"kind": "solid", "accent": "#5B45E0", "accent2": "#0EA5E9", "mode": "light"},
    },
    {
        "slug": "blue",
        "name": "Electric Blue",
        "description": "Cobalt accents on a deep night sky.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#3B82F6", "accent2": "#06B6D4", "mode": "dark"},
    },
    {
        "slug": "red",
        "name": "Crimson",
        "description": "For people who attack their checklist.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#EF4444", "accent2": "#F97316", "mode": "dark"},
    },
    {
        "slug": "green",
        "name": "Emerald",
        "description": "Fresh, focused and a little bit smug.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#22C55E", "accent2": "#84CC16", "mode": "dark"},
    },
    {
        "slug": "pink",
        "name": "Bubblegum",
        "description": "Neon pink energy for the aesthetic grinders.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#EC4899", "accent2": "#A855F7", "mode": "dark"},
    },
    {
        "slug": "yellow",
        "name": "Solar Flare",
        "description": "Blindingly bright, impossible to ignore.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#FACC15", "accent2": "#FB923C", "mode": "dark"},
    },
    {
        "slug": "purple",
        "name": "Ultraviolet",
        "description": "Deep violet gradients and glow.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#A855F7", "accent2": "#6366F1", "mode": "dark"},
    },
    {
        "slug": "meme-doge",
        "name": "Doge Mode",
        "description": "Such routine. Very coins. Wow.",
        "rarity": "epic",
        "price": BASE_PRICE_IMAGE_THEME,
        "meta": {
            "kind": "image",
            "accent": "#F59E0B",
            "accent2": "#FDE68A",
            "mode": "dark",
            "emoji": "🐕",
            "image": "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=1600&q=70",
        },
    },
    {
        "slug": "meme-thisisfine",
        "name": "This Is Fine",
        "description": "Everything is on fire, but the checklist is done.",
        "rarity": "epic",
        "price": BASE_PRICE_IMAGE_THEME,
        "meta": {
            "kind": "image",
            "accent": "#F97316",
            "accent2": "#EF4444",
            "mode": "dark",
            "emoji": "🔥",
            "image": "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=70",
        },
    },
    {
        "slug": "meme-cat",
        "name": "Cat Vibes",
        "description": "Boss energy, nine lives, zero excuses.",
        "rarity": "epic",
        "price": BASE_PRICE_IMAGE_THEME,
        "meta": {
            "kind": "image",
            "accent": "#F472B6",
            "accent2": "#C084FC",
            "mode": "dark",
            "emoji": "😼",
            "image": "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=1600&q=70",
        },
    },
    {
        "slug": "meme-frog",
        "name": "Frog Time",
        "description": "Hop to it. Ribbit.",
        "rarity": "epic",
        "price": BASE_PRICE_IMAGE_THEME,
        "meta": {
            "kind": "image",
            "accent": "#4ADE80",
            "accent2": "#22D3EE",
            "mode": "dark",
            "emoji": "🐸",
            "image": "https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=1600&q=70",
        },
    },
    {
        "slug": "meme-clown",
        "name": "Clown Mode",
        "description": "For the days you skip leg day and log it anyway.",
        "rarity": "epic",
        "price": BASE_PRICE_IMAGE_THEME,
        "meta": {
            "kind": "image",
            "accent": "#F43F5E",
            "accent2": "#FACC15",
            "mode": "dark",
            "emoji": "🤡",
            "image": "https://images.unsplash.com/photo-1527261834078-9b37d35a4a32?auto=format&fit=crop&w=1600&q=70",
        },
    },
]

# --- avatars ---------------------------------------------------------------- #
_AVATARS: list[dict] = [
    ("spark", "Spark", "✨", "#7C5CFF", True),
    ("flame", "Flame", "🔥", "#F97316", False),
    ("bolt", "Bolt", "⚡", "#FACC15", False),
    ("waves", "Waves", "🌊", "#38BDF8", False),
    ("leaf", "Leaf", "🌿", "#22C55E", False),
    ("moon", "Moon", "🌙", "#A78BFA", False),
    ("sun", "Sun", "🌞", "#FB923C", False),
    ("cat", "Cat", "🐱", "#F472B6", False),
    ("dog", "Dog", "🐶", "#F59E0B", False),
    ("frog", "Frog", "🐸", "#4ADE80", False),
    ("ghost", "Ghost", "👻", "#E2E8F0", False),
    ("robot", "Robot", "🤖", "#94A3B8", False),
    ("alien", "Alien", "👽", "#34D399", False),
    ("dragon", "Dragon", "🐲", "#EF4444", False),
    ("crown", "Crown", "👑", "#F5C542", False),
    ("skull", "Skull", "💀", "#CBD5E1", False),
    ("cherry", "Cherry", "🍒", "#F43F5E", False),
    ("rocket", "Rocket", "🚀", "#60A5FA", False),
]


def build_catalog() -> list[dict]:
    """Return the flat, ordered list of shop items ready for upsert."""
    items: list[dict] = []

    for order, theme in enumerate(_THEMES):
        items.append(
            {
                "slug": theme["slug"],
                "name": theme["name"],
                "kind": "theme",
                "description": theme["description"],
                "price": 0 if theme.get("free") else theme.get("price", BASE_PRICE_THEME),
                "rarity": theme["rarity"],
                "is_free": bool(theme.get("free")),
                "sort_order": order,
                "meta": theme["meta"],
            }
        )

    for order, (slug, name, emoji, accent, free) in enumerate(_AVATARS):
        items.append(
            {
                "slug": slug,
                "name": name,
                "kind": "avatar",
                "description": f"{name} profile picture",
                "price": 0 if free else BASE_PRICE_AVATAR,
                "rarity": "common" if free else "rare",
                "is_free": free,
                "sort_order": order,
                "meta": {"emoji": emoji, "accent": accent},
            }
        )

    return items


DEFAULT_THEME = "dark"
DEFAULT_AVATAR = "spark"
