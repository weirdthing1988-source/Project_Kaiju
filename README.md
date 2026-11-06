# Project Kaiju — v0.3, four-tab tactical prototype

Standalone Cloudflare Workers + Durable Objects project. **This ZIP is the full website**, not only changed files. It does not overwrite GitHub until you choose to upload it.

## What's new

- **Human Commander**: a Teamuki-style character roster with named sheets, Edit and Play modes, stats, 4d6-drop-lowest rolling, and JSON export.
- **Titan**: separate Kaiju roster with body types, elements, six abilities, stats, and breath cooldown settings.
- **Map**: expanded, isometric hex board; rotate view left/right, switch to top-down, zoom with buttons or mouse wheel, and pan with Shift+drag or middle-button drag.
- **Board Maker**: paint ground, roads, forests, water, buildings, mountains, bunkers, rubble, and reactors; choose a radius from 4–9; save maps locally, import/export JSON, and use saved maps when hosting a room.
- **Multiplayer room controls** now sit at the top of the page with Create room and Join room, regardless of the active tab.
- When creating or joining, choose **Human Commander** or **Titan**, then choose an actual saved sheet. You can create a room as either role. The first Titan player occupies the unique Titan slot; multiple humans can join up to six total.
- **Spawn/deployment**: once connected, click any unoccupied battlefield hex to deploy. The server validates occupancy. Battle turns begin when one human and the Titan have deployed. There are no automatic spawn positions.
- Custom maps are sent to the server when the host creates the room and appear to everyone joining that room. The creator's local browser is the map library; other players don't need the map saved locally.

## Installation on existing project

1. Extract the ZIP. It contains `public/`, `src/`, `tests/`, `package.json`, and `wrangler.jsonc` at the root.
2. **Upload the contents** of the extracted folder into the root of `weirdthing1988-source/project_kaiju` on GitHub, replacing changed files. Do not add a second nested folder.
3. Cloudflare should deploy the `main` branch automatically if Workers Builds is already connected. The Worker name in this ZIP is `project-kaiju`, matching your existing `project-kaiju.weirdthing1988.workers.dev` address.
4. Hard-refresh after deployment (Ctrl+F5). Create a fresh room for v0.3; older saved multiplayer rooms used a different server-side format and will not be compatible.

If deploying manually:

```bash
npm install
npm test
npm run deploy
```

The Cloudflare Worker has bindings for `ASSETS` and SQLite-backed Durable Objects `BATTLE_ROOMS`; no additional KV or D1 setup is required.

## Quick test

1. Create a Titan sheet and a Human Commander sheet. Roll attributes and save.
2. Open Map → Create room. Choose your Titan sheet and the default or a custom map.
3. Pick an unoccupied hex to deploy the Titan. The map should show **WAITING** until a human connects.
4. Open a different browser profile or private window. Join the room with the Room ID and Join Code, select a Human Commander sheet, then click a free hex to deploy.
5. Verify that the Titan cannot see a human deployed inside an intact bunker, but can see firing-origin clues after the human shoots. Test Sniff, Plasma, and breath cooldown.
6. Test a second room created by a Human Commander, followed by a Titan joining with the same room code. The single Titan slot cannot be claimed twice.

## Important limitations

- **Existing character profiles are kept** in browser localStorage under `kaiju-command-profiles-v1`. They are not yet synced across browsers or accounts. Do not clear browser/site storage before exporting anything important.
- Board Maker saves boards to the browser under `kaiju-command-custom-maps-v1`. Use Export JSON to back up and share maps. Cloudflare doesn't store your map library, only the selected map inside a created room.
- Character stats are saved and included in the room data, but **combat is still based on the v0.1 prototype rules**. Attribute bonuses are not yet applied to attacks, movement, or health.
- Human hiding is still simplified: underground/bunker occupancy hides human tokens from the Titan. We have not added advanced cover, terrain blocking line of sight, realistic terrain movement costs, elevations, or a full 3D map editor.
- Terrain types are currently visible and decorative except for bunkers (cover/destructible objectives) and buildings/reactors (can be reduced to rubble by attacks). The layout is visually isometric, not a full 3D model.
- No server-side character account/save system, public lobby discovery, join-code rotation, or production-grade matchmaking/anti-cheat yet.
- Room IDs and join codes grant access to a match. Share them only with invited players. Concealed human *positions* are omitted from Titan-facing server responses.
- Gameplay/rules/API tests pass under Node. A full end-to-end Cloudflare browser deployment is still to be verified after uploading the ZIP.

## Architecture

- `src/worker.js`: Cloudflare Worker routing, room creator/joiner, authentication, WebSocket snapshots.
- `src/rules.js`: validated maps, deployment, turn order, attacks, breath cooldown, concealment and server-filtered role views.
- `public/characters.js`: saved characters (compatible with v0.2).
- `public/board-maker.js`: Board Maker and local map library.
- `public/lib/map-display.js`: shared isometric hex renderer for the battlefield and Board Maker.
- `public/app.js`: tab navigation, lobby, session, actions and camera controls.
- `public/ui.css`: v0.3 visual styling layered over the original `style.css`.
- `tests/`: automated Node tests of movement, detection, deployment, role claim, maps and API authorization.

The v0.2 version in GitHub has not been modified to create this ZIP.

Forcing a build