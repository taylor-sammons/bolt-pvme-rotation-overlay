# PvME Rotation Overlay (Bolt plugin for RS3)

An overlay for the [Bolt Launcher](https://bolt.adamcake.com) that displays
[PvME](https://pvme.io) combat rotations on top of RuneScape 3. Rotations are organized
into **profiles** (one per boss/style — e.g. "Rasial — Mage"), each split into **named
phases**. Paste the text from PvME's **Copy Discord** button into each phase, switch
profiles in-game with the overlay's dropdown, and step between phases with the on-screen
◀ / ▶ buttons (or the arrow keys while the overlay is focused).

Ability icons are the real PvME emoji art, loaded straight from Discord's public CDN using
the emoji ids embedded in the pasted text — so anything PvME can show, this can show.

## Status

V1. Manual phase navigation only — no auto-advance and no screen detection (RS3's ToS only
permits acting on what's visibly on screen, and Bolt exposes no input-injection or
ability-detection API, so auto-detection is intentionally out of scope).

## How it works

```
bolt.json            Plugin manifest (name/version/description/main)
plugin/main.lua      Thin orchestrator: owns config, creates/positions the overlay and
                     settings windows, relays messages. (Lua has no HTTP, so it does no
                     rendering.)
modules/json.lua     Vendored rxi/json.lua (MIT) for encode/decode.
webpage/
  pvme-parse.js      Shared parser: PvME "Copy Discord" text -> tokens -> DOM.
  overlay.html/.css/.js   The on-screen strip + profile/phase navigation.
  config.html/.css/.js    Settings window: manage profiles, edit phases, set position/size.
```

Lua ⇄ browser bridge (per the Bolt API):

- **Lua → JS:** `browser:sendmessage(json)`; the page receives a `message` event whose
  `data.content` is an `ArrayBuffer` (decoded with `TextDecoder`).
- **JS → Lua:** `fetch("https://bolt-api/...", { method: "POST", body: json })`; Lua
  receives the body string in `browser:onmessage`.

Every message is a JSON object tagged with a `type` field (`data`, `ready`, `save`,
`setPhase`, `setProfile`, `openConfig`, `close`).

Config is persisted by Lua via `bolt.saveconfig("rotation.json", ...)` /
`bolt.loadconfig(...)`. The stored shape:

```json
{
  "overlay":  { "x": 40, "y": 40, "w": 640, "h": 110, "iconSize": 20, "visible": true, "locked": false },
  "currentProfile": 0,
  "profiles": [
    {
      "name": "Rasial — Mage",
      "currentPhase": 0,
      "phases": [ { "name": "Pre Living Death", "text": "(tc) → <:deathskulls:1159...> → ..." } ]
    }
  ]
}
```

Configs saved by 0.1.x (top-level `phases`/`currentPhase`) are migrated automatically
into a single profile named "Default" on first load.

The raw pasted text is stored per phase; the browser parses it at render time, so messy or
unusual input never breaks the Lua side.

## Install

1. In Bolt, open **RS3 settings** and enable **"Enable Bolt plugin loader"**.
2. Open the plugin menu under the **Play** button → **manage plugins**.
3. Install this plugin — either point it at a local copy of this folder, or install from a
   release URL if you've packaged one.
4. Launch RS3. On first run (no rotation yet) the settings window opens automatically.

## Releasing

Bolt installs a plugin from a **`meta.json`** URL that points at a **`.tar.zst`** archive
(files at the archive root) and carries its `sha256`. Build both with:

```sh
REPO=you/bolt-pvme-rotation-overlay scripts/build-release.sh
```

This writes `dist/pvme-rotation-overlay-v<version>.tar.zst` and `dist/meta.json` (with the
matching sha256 and the GitHub release-asset URL). To publish: bump `version` in
`bolt.json`, run the script, create a GitHub release tagged `v<version>`, upload the
`.tar.zst` as an asset, and host `meta.json` (e.g. as another release asset or in the repo).
Users then install by pasting the `meta.json` URL into Bolt's *manage plugins*. `meta.json`
is intentionally **not** inside the tarball, since it contains the tarball's own hash.

## Usage

1. In the settings window, click **+ New profile** and name it after the rotation
   (e.g. `Rasial — Mage`). Use **Duplicate** / **Delete** to manage profiles; the
   dropdown picks which profile you're editing.
2. Click **+ Add phase**, give it a name, and paste a chunk of a PvME rotation using the
   **Copy Discord** button on a PvME guide/rotation. Each phase shows a live preview as
   you type. Add as many phases as you want and reorder them with ↑ / ↓.
3. Set the overlay **position / size / icon size** and click **Save**.
4. In-game, pick a profile from the overlay's dropdown (shown when you have more than
   one) and use the **◀ / ▶** buttons to move between phases. The header shows
   `Phase 2/5 — <name>`. Click **⚙** on the overlay to reopen settings.

### Note on arrow keys

The overlay also responds to the **←/→ arrow keys**, but only while the overlay webview
has keyboard focus. While it's focused, keystrokes go to the overlay rather than the game,
so your in-game keybinds are paused. For live combat, prefer the **◀ / ▶ buttons**, which
never steal focus. (Bolt provides no Lua keyboard hook, which is why this is the
arrangement.)

### Note on overlay placement

The overlay rectangle captures mouse clicks within its bounds (that's how the buttons
work), so clicks that land on it won't reach the game. Keep it compact and tucked into a
corner away from where you click during combat.

## Local testing without Bolt

The web UI runs in a normal browser with mock data — handy for working on layout/parsing:

- Open `webpage/overlay.html?mock=1` — renders two sample profiles; the profile dropdown,
  ◀/▶, and arrow keys work, and icons load from the live Discord CDN.
- Open `webpage/config.html?mock=1` — loads two sample profiles with a live preview.

(The `https://bolt-api/` POSTs fail harmlessly outside Bolt, and `Save` is a no-op there.)

## Credits

- Rotation content & ability emoji: the [PvM Encyclopedia (PvME)](https://pvme.io)
  community, CC-licensed.
- `modules/json.lua`: [rxi/json.lua](https://github.com/rxi/json.lua) (MIT).
- Built for [Bolt Launcher](https://bolt.adamcake.com).
