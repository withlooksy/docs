# Root discovery files

These files are the source of truth for static answer-engine discovery resources hosted by Framer at `https://withlooksy.com`.

Upload the files through **Framer Dashboard -> withlooksy.com -> Files** using these mappings:

| Source | Framer path | Public URL |
| --- | --- | --- |
| `root-discovery/robots.txt` | `/` | `/robots.txt` |
| `llms.txt` | `/` | `/llms.txt` |
| `skill.md` | `/` | `/skill.md` |
| `root-discovery/.well-known/skills/index.json` | `/.well-known/skills` | `/.well-known/skills/index.json` |
| `root-discovery/.well-known/skills/looksy/SKILL.md` | `/.well-known/skills/looksy` | `/.well-known/skills/looksy/skill.md` |

Framer normalizes the uploaded `SKILL.md` filename to lowercase. Its current plan permits five static files, so this is the complete root discovery set. Mintlify continues to serve the recommended agent-skills manifest, agent card, and MCP server card below `/docs`.

The root legacy `SKILL.md` copy must match `skill.md` byte for byte. After changing any file, publish Framer and run `node scripts/aeo-audit.mjs --live`.
