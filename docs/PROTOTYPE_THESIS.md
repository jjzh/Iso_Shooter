# Prototype Thesis

> This document lives on `main`. It's the top-level map of what we're exploring across all prototype branches, why, and what we're learning.

---

## Core Belief

### The Point Isn't Remaking Genres

Rebuilding Hades or Dark Souls without the requisite art, narrative, and polish isn't particularly valuable. The genre is **scaffolding** — it provides enough surrounding game to evaluate a specific twist or generative idea. The prototype exists to answer: *does this idea actually play well, or does it just sound cool in my head?*

### Two Sources of Novel Ideas

**1. Genre Collisions — Twist Through Hybridization**
Take a mechanic from genre A, put it in genre B, see what happens. The interesting prototypes aren't "isometric Hades" — they're "isometric action game where [specific twist from another genre or a novel idea] changes the core loop." The shared engine foundation makes it cheap to test these collisions.

**2. Generative Surfaces — The Player Brings Something In**
Games where players contribute context from outside the game that meaningfully shapes how it plays — not cosmetically, but mechanically. A song that becomes a level. A photo that becomes a tool. A behavior pattern that the game adapts to.

The bar: does the player-contributed context create moments a designer couldn't have pre-built? If yes, it's a real generative surface. If no, it's a gimmick.

AI (LLMs, audio processing, image recognition) is what makes generative surfaces *responsive* rather than just *receptive*. The AI is the DM layer — interpreting player input and adapting the game world meaningfully.

### The Process

1. **Identify a twist** — a specific mechanic, generative surface, or hybridization idea
2. **Build the minimum genre scaffolding** needed to evaluate the twist (Claude Code does this in parallel)
3. **Implement the twist** on top of the scaffolding
4. **Play it** — Jeff evaluates whether the idea actually produces fun or just sounds clever
5. **Synthesize** — update the handoff, capture cross-pollination insights, decide: deepen, pivot, or move on
6. **Port general systems back to main** — the scaffolding that's reusable becomes shared infrastructure

The learning can't be parallelized — it requires living in the prototype. But the implementation can be, which means more ideas get to the "playable and evaluable" stage faster.

---

## Active Prototypes

| Branch | Genre Scaffolding | The Twist | Generative Surface | Slice Length | Status |
|--------|------------------|-----------|-------------------|-------------|--------|
| `explore/hades` | Action roguelike | [fill in] | [fill in] | [fill in] | Active |
| `explore/souls` | Souls-like combat | [fill in] | [fill in] | [fill in] | Planned |
| `explore/heist` | Stealth/heist | [fill in] | [fill in] | [fill in] | Planned |

> Add rows as new prototypes spin up. Remove or archive when a prototype is retired.
> **Slice Length** = how long someone needs to play to evaluate the twist. Varies per prototype — combat feel tests might be 30s, pacing tests need 3-5 min.

---

## Prototype Ideas (Backlog)

Candidates that haven't been started yet. When one feels ripe, create a branch and HANDOFF.md. Each idea leads with the twist, not the genre.

### Rhythm Battler — "Your music library is your difficulty curve"
- **The twist:** Combat where rhythm emerges *reactively* from the fight (not prescribed like NecroDancer's grid-lock), and the player's own music shapes encounter intensity
- **Genre scaffolding:** Isometric action combat (reuse existing player rig + enemies)
- **Generative surface:** Player imports a song → stems extracted → BPM/energy curve drives encounter intensity, melodic patterns map to enemy attack rhythms
- **What to evaluate:** Does reactive rhythm feel like a *system* or just a cosmetic overlay? Does personal music create meaningfully different encounters or just aesthetic variation?
- **Technical questions:** Stem separation quality (client-side vs API), latency of beat detection, irregular time signatures

### MOBA-lite — "PvE lane pressure through objective-seeking AI"
- **The twist:** MOBA-style strategic pressure (lane management, objective contention) works in PvE if enemies pursue objectives rather than just aggroing on the player
- **Genre scaffolding:** Ability-based combat, simple lane/node map
- **Generative surface:** TBD — possibly team composition reshapes the world
- **What to evaluate:** Does PvE objective pressure create the same decision tension as PvP? Or does it collapse into "just kill everything"?
- **Jeff's edge:** Supervive experience — knows what makes ability interactions and team coordination interesting

### Obstacle Course — "Real-world context as puzzle solutions"
- **The twist:** Player captures real-world context (photos, voice descriptions) that gets interpreted into in-game tools or solutions
- **Genre scaffolding:** Traversal challenges, physics-based interactions (BotW-style systemic)
- **Generative surface:** "Photograph a bridge near you to build one in-game" — the player's environment becomes their toolkit
- **What to evaluate:** Does real-world input create genuinely novel solutions, or does it just feel like a gimmick with extra steps? Is the constraint meaningful?
- **Technical questions:** Image interpretation fidelity, how to prevent "anything works" (the challenge has to survive the openness)

---

## Cross-Pollination Log

Observations about mechanics that could transfer between prototypes. Updated as discoveries happen.

- [date] — [observation, e.g., "The stealth tension/release cycle could drive encounter pacing in the roguelike — alternating 'predator rooms' where you hunt and 'prey rooms' where you're hunted"]

---

## Generative Surface Patterns

As you explore generative surfaces across prototypes, catalog the patterns here. Over time this becomes a design vocabulary.

| Pattern | Player Brings | Game Transforms Into | Example |
|---------|--------------|---------------------|---------|
| Media as Level | Audio, image, video | Level structure, pacing, aesthetics | Song → rhythm level |
| Real-World Context | Photos, location, time of day | Puzzle tools, environmental conditions | Photo of bridge → in-game bridge |
| Behavioral Fingerprint | Play history, choices, tendencies | Enemy AI, difficulty, narrative | Boss "learns" from your previous runs |
| Creative Intent | Text prompts, drawings, descriptions | Encounters, characters, objectives | "I want to steal the crown jewels" → generated heist |

---

## Shared Foundation (on main)

Systems available to all prototypes. See MEMORY.md for technical details.

- Event Bus — typed pub/sub
- Audio — procedural Web Audio synthesis
- Particles — pooled mesh particles with config-driven bursts
- Tuning Panel — runtime parameter sliders
- Effect System — GAS-inspired buff/debuff/zone system
- Enemy Types — goblin, skeletonArcher, iceMortarImp, stoneGolem
- Player Rig — bipedal animated character with dash, shoot, force push

### Foundation Gaps
Systems that multiple prototypes will likely need but don't exist yet:
- [ ] Room/encounter transition system (roguelike needs rooms, heist needs zones)
- [ ] AI behavior tree or state machine (stealth needs patrol AI, roguelike needs varied attack patterns)
- [ ] Camera system with multiple modes (iso fixed, iso follow, over-shoulder for souls)
- [ ] Progression/meta system (even simple: "you cleared 3 rooms, here are upgrade choices")

---

## How to Start a New Prototype

1. `git checkout main && git pull`
2. `git checkout -b explore/[name]`
3. Copy `docs/HANDOFF_TEMPLATE.md` → `HANDOFF.md` at branch root
4. Fill in: Design Hypothesis, Genre Core, Reference Games, Generative Surface
5. Add row to Active Prototypes table in this doc (on main)
6. Start building — update HANDOFF.md as you go
