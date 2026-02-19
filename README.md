# Design Exploration Prototype

An ongoing design exploration, started February 7th. Built in Three.js, prototyping different isometric action game directions — kit-bashing across genres to find novel ways to play.

**[Play the demo](https://jjzh.github.io/Iso_Shooter/)** (desktop + mobile)

---

## What this is

A personal game design project where I take lessons from my career in games and rapidly prototype different mechanical directions to see if there are new, novel ways to play — and whether those directions interact in interesting ways when combined.

The demo walks through six rooms, each representing a different stage of exploration.

This project is entirely built with [Claude Code](https://claude.ai/code). I'm still learning how best to work with it — if you have tips, come say hi.

## The rooms

| Room | Name | Date | What it explores |
|------|------|------|-----------------|
| 1 | **The Origin** | Feb 7 | Where it started — auto-fire projectiles, pure movement |
| 2 | **The Foundation** | Feb 12 | Melee, dash, force push. The simplest satisfying combat loop |
| 3 | **Physics Playground** | Feb 12 | Wall slams, enemy collisions. What if the arena is the weapon? |
| 4 | **The Shadows** | Feb 14 | Vision cones, patrol routes, bullet time. What if enemies can't see behind them? |
| 5 | **The Workshop** | Feb 15 | Physics objects, enlarge/shrink. What if you could bend the rules? |
| 6 | **The Arena** | Feb 18 | Jump, launch, dunk, spike. What if combat had a Y-axis? |

## How it was built

Each design direction lives on its own branch:

```
main                    — shared infrastructure (event bus, audio, particles)
  ├── explore/hades     — combat juice, encounter pacing, room system
  ├── explore/vertical  — aerial verbs (jump, launch, dunk, spike)
  ├── explore/assassin  — vision cones, stealth, detection
  ├── explore/heist     — rule-bending, physics objects, enlarge/shrink
  └── demo/portfolio    — all explorations integrated into 6 playable rooms
```

The `explore/*` branches diverge from `main` and explore independently. The `demo/portfolio` branch integrates the best of each into a single walkthrough. ~177 commits across all branches over two weeks.

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | WASD | Left joystick |
| Attack | Left click | Right joystick |
| Dash | Shift | Dash button |
| Force push | Hold right click | Push button |
| Jump (Room 6) | Space | Jump button |
| Launch (Room 6) | E | Launch button |
| Bend mode (Room 5) | Q | Bend button |

Three.js · TypeScript · esbuild · Web Audio API (procedural sounds, no files) · 851 tests
