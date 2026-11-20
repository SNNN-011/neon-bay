# neon-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/SNNN-011/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/SNNN-011/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** is an original open-world crime sandbox that runs entirely in a desktop browser — no install, no build step, no network calls at play time. You play Riko, a ferry arrival who climbs the ranks of the Tidewater Crew in a sun-baked coastal city of art-deco pastels, neon signage, palm-lined boulevards and a long pier out over the bay.

Roam a 7×7 street grid with live traffic and sidewalk pedestrians, jack any car you can reach, and outrun Neon Bay PD as your wanted level climbs from one star to five — patrol cars chase and ram you, foot officers shoot, and getting caught means a BUSTED screen and a fine. Seven story jobs (deliveries, a heist, a van takedown, a heat escape, a checkpoint race and a pier shootout) carry the plot, with dialog panels, a mission log and cash rewards. Pistol and punch combat, health/armor pickups, skid marks and particle effects, a canvas minimap, localStorage save/continue, and a fully procedural WebAudio soundtrack (engine, sirens, gunfire, synthwave pad) round it out. Everything — city, characters, story, art and sound — is original, rendered with a vendored three.js from plain static files in `game/`.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Walk / drive (camera-relative on foot) |
| Mouse | Look around; aim the pistol |
| Shift | Sprint |
| Space | Jump on foot · handbrake while driving |
| E | Enter/exit a vehicle, steal traffic cars, talk to mission givers, advance dialog |
| Click | Punch up close · fire pistol at range |
| Tab | Mission log |
| M | Mute |
| Esc | Pause (also saves) |

## Run it

```sh
node serve.ts
```

Open http://localhost:8080 in desktop Chrome and press **New Game** (or **Continue** to load your save). Node 22+; keyboard and mouse required.

To produce a submission folder instead: `MAKEFUN_OUTPUT_DIR=out node main.ts` copies `game/` and `screenshots/` and writes `dossier.json` via the vendored make.fun library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=pszvrn2f&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>