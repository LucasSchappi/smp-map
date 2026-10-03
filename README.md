# SMP Map

A top-down map of our Minecraft server: https://lucasschappi.github.io/smp-map/

Drag to pan, scroll to zoom, hover to see coordinates and blocks. Anyone can also load their own Java Edition world with **Load world**. It's read in the browser and never uploaded.

## Updating the map

On the computer running the server:

```
bash ~/smp-map/publish.sh ~/Desktop/server
```

This renders the world into `map/` and pushes it. Player positions are never included. Needs Git and Node.js 18+.
