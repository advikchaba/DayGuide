# OpenCode skills

These skills are installed project-locally under `.opencode/` so their bundled
scripts keep resolving through `.opencode/skills/...` paths.

## Skills

| Skill | Source |
| --- | --- |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `security-audit` | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) |

The UI/UX Pro Max installer also added its companion skills:

`banner-design`, `brand`, `design`, `design-system`, `slides`, `ui-styling`

## Commands

- `/frontend-design <request>`
- `/ui-ux-pro-max <request>`
- `/impeccable <subcommand> [target]`
- `/security-audit [target]`

## Local adaptations

- UI/UX companion docs now point at `.opencode/skills/...` instead of
  `.claude/skills/...`.
- Three UI/UX search scripts force UTF-8 stdout/stderr so Unicode results work
  on Windows consoles that default to cp1252.
- `banner-design` and `brand` reference optional `ai-artist`, `ai-multimodal`,
  and `chrome-devtools` skills that are not bundled. Install those separately if
  you need the image-generation or browser-screenshot steps.
- On Windows, use `python` instead of `python3` for bundled scripts.

## Verify

```powershell
python .opencode\skills\ui-ux-pro-max\scripts\search.py "dashboard" --domain style
python .opencode\skills\design-system\scripts\search-slides.py "investor pitch" -d strategy
```

Restart OpenCode or start a new session if a command is not listed yet.

See `THIRD_PARTY_NOTICES.md` and `licenses/` for upstream licensing.
