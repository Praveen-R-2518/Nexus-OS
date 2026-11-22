# graphify in Nexus OS (and any repo)

graphify builds `graphify-out/` — a queryable knowledge graph for architecture exploration.

## Install CLI (once per machine)

```bash
uv tool install graphifyy
```

The binary lands at `~/.local/bin/graphify`. Add to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Per-repo bootstrap

From the repo root:

```bash
chmod +x scripts/graphify.sh scripts/ensure-graphify.sh
./scripts/ensure-graphify.sh
```

This writes `.cursor/rules/graphify.mdc` and updates `graphify-out/`.

## Commands (use the wrapper in agents)

Always prefer the repo wrapper so PATH issues do not break agents:

```bash
./scripts/graphify.sh query "tenant model"
./scripts/graphify.sh path "approval" "reply_drafts"
./scripts/graphify.sh explain "requireApiTenantContext"
./scripts/graphify.sh update .          # after code edits (no LLM cost)
```

Full build (first time or major restructure):

```bash
./scripts/graphify.sh .
```

After deleting many files, if update refuses to overwrite:

```bash
./scripts/graphify.sh update . --force
```

Optional: SQL migrations in the graph need `uv tool install 'graphifyy[sql]'` (or `pip install 'graphifyy[sql]'` in the graphify venv).

## New repo checklist

1. `uv tool install graphifyy` (if needed)
2. Copy `scripts/graphify.sh` and `scripts/ensure-graphify.sh` (or run `graphify install --platform cursor` in that repo)
3. `./scripts/ensure-graphify.sh`
4. Commit `graphify-out/` if you want the graph in git (this repo does)

Global Cursor skill: `~/.cursor/skills/graphify/SKILL.md`
