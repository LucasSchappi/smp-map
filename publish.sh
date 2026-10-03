#!/bin/bash
# Renders a Minecraft server folder and publishes the map to GitHub Pages.
# Usage: bash publish.sh <server folder> [markers]     (default: ~/Desktop/server)
#   Add "markers" at the end to publish only map-markers.txt changes, without redrawing the map.
set -e
SERVER="${1:-$HOME/Desktop/server}"
MODE="$2"
REPO_DIR="$HOME/smp-map"

command -v git >/dev/null || { echo "Git is missing. Run: xcode-select --install"; exit 1; }
command -v node >/dev/null || { echo "Node.js is missing. Install it from https://nodejs.org (the LTS button), then run this again."; exit 1; }
[ -d "$SERVER" ] || { echo "Can't find the server folder at $SERVER"; exit 1; }

# Always start from the published version, dropping any half-finished local run
if [ -d "$REPO_DIR/.git" ]; then git -C "$REPO_DIR" fetch --quiet && git -C "$REPO_DIR" reset --quiet --hard origin/main
else git clone --quiet https://github.com/LucasSchappi/smp-map.git "$REPO_DIR"; fi
cd "$REPO_DIR"

# A starter markers file, so there's something to edit
if [ ! -f "$SERVER/map-markers.txt" ]; then
cat > "$SERVER/map-markers.txt" <<'TXT'
# SMP map markers. One per line:   X  Z  level  Name
# You can also paste X Y Z straight from the F3 screen; the Y is ignored.
#
# level decides when it shows, like on Google Maps:
#   far       only when zoomed way out     (big area names)
#   mid       at in-between zoom           (bases, towns)
#   near      only when zoomed right in    (small details)
#   always    at every zoom
#   far-mid / mid-near   across two levels
#
# Lines starting with # are ignored. Examples (delete the # to use them):
# 0 0 far The Spawn Lands
# 120 -340 mid Lucas's Base
# 130 -350 near Storage room
TXT
echo "Made $SERVER/map-markers.txt. Add markers there, then publish with: bash publish.sh \"$SERVER\" markers"
fi

if [ "$MODE" = "markers" ]; then
  node build-map.mjs "$SERVER" --markers-only
else
  # Low priority, so a running Minecraft server always gets the CPU first
  nice -n 15 node build-map.mjs "$SERVER"
fi

git add -A map
if git diff --cached --quiet; then echo "Map unchanged, nothing to publish."; exit 0; fi
git -c user.name="SMP map" -c user.email="smp-map@users.noreply.github.com" commit --quiet -m "Update map $(date '+%Y-%m-%d %H:%M')"
if command -v gh >/dev/null; then gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https; gh auth setup-git; fi
# The map is tens of MB; Git's default 1 MB HTTP buffer makes GitHub reject the push with HTTP 400
git -c http.postBuffer=524288000 push --quiet
echo "Published. The site updates in a minute or two: https://lucasschappi.github.io/smp-map/"
