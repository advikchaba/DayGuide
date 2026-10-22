"""The unlockable theme catalogue.

Prices follow the product spec:
  * colour themes ......... 10,000 coins
  * image / meme themes ... 20,000 coins
  * light + dark themes ... free defaults

Profile pictures are uploaded by the user instead of being shop items.

``meta`` carries everything the frontend needs to render the cosmetic
(accent colour, background image url, ...).
"""

from __future__ import annotations

BASE_PRICE_THEME = 10_000
BASE_PRICE_IMAGE_THEME = 20_000

# --- themes ----------------------------------------------------------------- #
_THEMES: list[dict] = [
    {
        "slug": "dark",
        "name": "Midnight",
        "description": "The default dark interface with pure white text.",
        "rarity": "common",
        "free": True,
        "meta": {"kind": "solid", "accent": "#DCDCDC", "accent2": "#D3D3D3", "mode": "dark"},
    },
    {
        "slug": "light",
        "name": "Daylight",
        "description": "Clean light mode for daytime planning.",
        "rarity": "common",
        "free": True,
        "meta": {"kind": "solid", "accent": "#FFFFFF", "accent2": "#808080", "mode": "light"},
    },
    {
        "slug": "blue",
        "name": "Electric Blue",
        "description": "Deep blue with a pale blue counterpoint.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#1D4ED8", "accent2": "#93C5FD", "mode": "dark"},
    },
    {
        "slug": "red",
        "name": "Crimson",
        "description": "For people who attack their checklist.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#B91C1C", "accent2": "#FCA5A5", "mode": "dark"},
    },
    {
        "slug": "green",
        "name": "Emerald",
        "description": "Fresh, focused and a little bit smug.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#15803D", "accent2": "#86EFAC", "mode": "dark"},
    },
    {
        "slug": "pink",
        "name": "Bubblegum",
        "description": "Deep rose with a soft pink counterpoint.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#BE185D", "accent2": "#F9A8D4", "mode": "dark"},
    },
    {
        "slug": "yellow",
        "name": "Solar Flare",
        "description": "Warm ochre with a pale gold counterpoint.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#A16207", "accent2": "#FDE68A", "mode": "dark"},
    },
    {
        "slug": "purple",
        "name": "Ultraviolet",
        "description": "Deep violet with a pale lavender counterpoint.",
        "rarity": "rare",
        "meta": {"kind": "solid", "accent": "#6D28D9", "accent2": "#C4B5FD", "mode": "dark"},
    },
    {
        "slug": "meme-doge",
        "name": "Doge Mode",
        "description": "Such routine. Very coins. Wow.",
        "rarity": "epic",
        "price": BASE_PRICE_IMAGE_THEME,
        "meta": {
            "kind": "image",
            "accent": "#B45309",
            "accent2": "#FCD34D",
            "mode": "dark",
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
            "accent": "#C2410C",
            "accent2": "#FDBA74",
            "mode": "dark",
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
            "accent": "#BE185D",
            "accent2": "#F9A8D4",
            "mode": "dark",
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
            "accent": "#15803D",
            "accent2": "#86EFAC",
            "mode": "dark",
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
            "accent": "#B91C1C",
            "accent2": "#FCA5A5",
            "mode": "dark",
            "image": "https://images.unsplash.com/photo-1527261834078-9b37d35a4a32?auto=format&fit=crop&w=1600&q=70",
        },
    },
]


def build_catalog() -> list[dict]:
    """Return the flat, ordered list of theme shop items ready for upsert."""
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

    return items


DEFAULT_THEME = "dark"
DEFAULT_AVATAR = "spark"
