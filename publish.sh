#!/bin/bash
# Renders a Minecraft server folder and publishes the map to GitHub Pages.
# Usage: bash publish.sh <server folder>     (default: ~/Desktop/server)
set -e
SERVER="${1:-$HOME/Desktop/server}"
REPO_DIR="$HOME/smp-map"

command -v git >/dev/null || { echo "Git is missing. Run: xcode-select --install"; exit 1; }
command -v node >/dev/null || { echo "Node.js is missing. Install it from https://nodejs.org (the LTS button), then run this again."; exit 1; }
[ -d "$SERVER" ] || { echo "Can't find the server folder at $SERVER"; exit 1; }

if [ -d "$REPO_DIR/.git" ]; then git -C "$REPO_DIR" pull --quiet
else git clone --quiet https://github.com/SchappiPlays/smp-map.git "$REPO_DIR"; fi
cd "$REPO_DIR"

node build-map.mjs "$SERVER"

git add -A map
if git diff --cached --quiet; then echo "Map unchanged, nothing to publish."; exit 0; fi
git -c user.name="SMP map" -c user.email="smp-map@users.noreply.github.com" commit --quiet -m "Update map $(date '+%Y-%m-%d %H:%M')"
if command -v gh >/dev/null; then gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https; gh auth setup-git; fi
git push --quiet
echo "Published. The site updates in a minute or two: https://schappiplays.github.io/smp-map/"
