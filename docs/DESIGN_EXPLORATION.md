# Design Exploration Log

> Captures the thinking, trade-offs, and ideas from open-ended design conversations. Organized by theme, not chronology. Referenced from `PROTOTYPE_THESIS.md`.

---

## The Cursed Problems of Action Roguelikes

Problems that every game in the genre fights against, where solutions tend to create new problems.

### 1. The Content Treadmill / Terminal Endpoint

**The curse:** Replayability comes from combinatoric variety (builds, encounters, items), but players eventually exhaust the possibility space. The game has a finite surprise budget. And it's not just finite content — players gravitate to a singular playstyle and builds get solved quickly.

**The Goldilocks tension:** Players want *some* reliability — the excitement of getting a weapon or item they know is strong. But if reliability wins, they stop exploring. The Athena deflect dash in Hades was almost always correct because iframes during your most-used verb is hard to beat. That's a tuning problem AND a structural problem.

**The ideal:** Players have a degree of reliability and excitement about familiar strategies, but are *sufficiently tempted* to try dramatically different builds, give up their weapon, go in a new direction and see where it goes. The game needs to make the unknown more compelling than the known, at least some of the time.

**What existing games do (and why it's insufficient):**
- Hades: Narrative drip-feed across runs. Brilliant but finite — expensive content, not a system.
- Slay the Spire: Ascension levels add difficulty. But higher ascension *narrows* viable builds, reducing variety.
- Vampire Survivors: Brute-force content additions. More characters, more weapons.

**Why traditional procedural generation doesn't solve it:** Proc-gen recombines authored pieces. The possibility space is still finite, just larger. Players still map it eventually.

**Generative solution direction:** Something that introduces context the game's design space didn't originally contain. Real-world inputs (weather, location, walking route, time of day, social graph) that modify run conditions from a source players can't datamine. The surprise budget becomes effectively infinite because it's sourced from outside the game.

### 2. The Knowledge Cliff

**The curse:** Deep games require knowledge to enjoy at depth, creating a barrier for new/returning players.

**Jeff's take:** This is an evergreen problem — it exists in League, Valorant, any game with depth. It probably requires a nuanced, genre-specific solution rather than a general one. Not worth over-investing in as a prototype focus.

**Interesting but store for later:** A context-aware helper system, like escape room hints. Each run you get N instances where you can ask the game for a recommendation. Treat it as a resource — the AI reads the game state and your history and offers guidance without flattening the decision space. Hard to prototype without knowing the specific game, but a good synergy to layer on later.

### 3. The Build Convergence / Meta Crystallization Problem

**The curse:** Optimal builds get discovered, the meta crystallizes, players either follow it (killing exploration) or play suboptimally (feels bad). Any stable ruleset will be solved.

**The framing Jeff likes:** You're at a neutral power level by default. By embracing circumstances *outside the traditional game world* — taking some action, responding to some external context — you can reach a more optimized state. You're temporarily strong. The optimization path runs through engaging with the novel, not through following a wiki.

**Generative solution direction:** The synergy relationships between items/abilities shift based on exogenous context. Not "the numbers change" (that's just tuning) but "what combos with what changes." The meta can't crystallize because the possibility space keeps shifting from a source players can't control.

### 4. The Pacing Plateau (Mid-Run Sag)

**The curse:** Early run is exciting (building), late run is exciting (payoff). Mid-run sags — you've made core decisions but haven't reached the payoff.

**Potential solution — genre shifting within a run:** What if the mid-run introduces a *different kind of challenge*? Not more combat rooms, but a genre shift. You've been doing action combat, now you're in a stealth sequence, or a puzzle that uses your build in a non-combat way. Genre hybridization as a *pacing tool within a single run*, not just across prototypes.

This connects directly to the parallel/interleaved run idea below.

### 5. The Solo Experience Problem

**The curse:** Most action roguelikes are solo. Social connection is the strongest retention mechanism in gaming, and the genre largely leaves it on the table.

**Asynchronous social influence:** Your friend's runs affect your world. "Your friend died to this boss — their ghost fights alongside you, but the boss learned a new pattern from killing them." The social graph becomes a generative input.

**Synchronous social influence:** See "The Parallel Run Idea" below.

---

## Big Ideas

### Exogenous Context as Game Input

**Core concept:** The game's state space is partially determined by factors the designer didn't author and the player can't fully control. Not procedural generation (recombining authored pieces) but genuinely external context.

**Possible inputs for a browser game:**
- Time of day, day of week
- Weather (via geolocation + weather API)
- Walking route / step count (phone companion, or Health API)
- Real-world events (sports scores, news, trending topics)
- Player's social graph (friends' recent runs, play patterns)
- Player behavior fingerprint (cross-run tendencies)

**What it solves:**
- Content treadmill: Surprise budget sourced from outside the game = infinite
- Build convergence: Synergy relationships shift based on external context = unsolvable meta
- Retention: Reason to come back tomorrow that isn't "new patch dropped"

**What it risks:**
- Feeling arbitrary or unfair ("I lost because of the weather?")
- Being cosmetic rather than mechanical (gimmick check)
- Requiring always-online / API dependencies
- Players feeling manipulated rather than surprised

**The bar:** Does the exogenous context create moments the designer couldn't have pre-built? Does it change *decisions*, not just aesthetics?

### The Parallel / Interleaved Run Idea

**Core concept:** Multiple gameplay modes (action, stealth, puzzle, etc.) that affect each other within or across sessions. Actions in one mode modify conditions in another.

**Inspirations:**
- Haze Light (It Takes Two, Split Fiction) — co-op where each player's actions affect the other's experience
- The heist/action hybrid Jeff described — disabling traps in control room = fewer traps in action run; eliminating enemies in action = fewer enemies in heist

**Shapes this could take:**

1. **Within a single run (pacing tool):** Genre shifts mid-run. Combat rooms → stealth room → combat rooms. What you do in the stealth room changes what you face in subsequent combat rooms. Solves the mid-run pacing sag.

2. **Across sequential runs (progression tool):** Run 1 is action, Run 2 is stealth in the same "world." Enemies you killed in Run 1 aren't in Run 2. Traps you mapped in Run 2 are visible in Run 1. Each run type feeds the other.

3. **Solo with both modes:** Player plays both roles, switching between them. Like playing both sides of a Haze Light game.

4. **Co-op with split roles:** One player does the action run, the other does the heist/control run simultaneously. Real-time decisions affect each other. "I just disabled the laser grid — go now!"

5. **Companion app (ambient mode):** As you walk through the day, your phone collects encounters/resources. When you sit down for a "real" session, those encounters inform your run. You could sequence/arrange them to modify room order. The ambient gameplay is a different genre (collection, light strategy) feeding the core gameplay (action roguelike).

**What's exciting about this:**
- Creates semantic interest — the connection between modes gives actions *meaning beyond their immediate context*
- Pacing naturally varies because the modes are different genres
- Co-op version has real interdependence (not just "same game but with friends")
- Solo version still works (you play both sides)
- The companion app version creates a daily rhythm of engagement

**What's hard:**
- Designing two interleaved systems that feel good independently AND affect each other meaningfully
- Preventing one mode from feeling like homework for the other
- The companion app is a separate build target (mobile)
- Balancing the influence between modes so neither feels dominant

### Exogenous Context — Practical Feasibility for Prototyping

**Key insight from Jeff:** You don't need real data to prototype exogenous context. Fake it. Hard-code "it's raining" and "it's nighttime" as presets and see if the mechanical differences change decisions. If they don't, real data won't save the idea.

**Tier list for prototyping:**
- **Prototype now (zero friction):** Time, session history, player behavior across runs. Also anything you can fake with hard-coded presets.
- **Prototype soon (one permission):** Geolocation → weather, device orientation
- **Prototype later (backend needed):** Social graph, friends' runs
- **Prototype someday (companion app):** Step count, walking route, ambient collection

**The framing that matters for prototyping:** Does the mechanical difference between "preset A" and "preset B" create different player decisions? If yes, then making the data source real (weather API, geolocation) is just an engineering task. If no, the idea is cosmetic.

### Exogenous Context Twist Candidates

**A. "The Shifting Meta" — Time-Based Synergy Rotation**
Synergy relationships between ability categories rotate on a real-world clock. Not numbers — *interactions* change. Fire+speed combo on Monday, ice+area on Tuesday. Creates a "what's strong today?" check-in loop. Risk: feels arbitrary without diegetic framing.

**B. "Ghost Runs" — Past Self as Encounter Modifier**
Previous run behavior creates ghost data (where you fought, what you used, how you died). Next run: rooms where you lingered get harder, enemies that killed you appear earlier with a tell (revenge opportunity), unexplored paths get bonus rewards. Pushes you away from comfort zones and toward the unknown. Solves content treadmill AND the Goldilocks problem. Zero-friction (LocalStorage). Can extend to social (friends' ghosts) later.

**C. "Behavioral Drift" — Game Reads and Pushes Against Your Playstyle**
Multi-run profiling of tendencies (aggressive vs. cautious, ranged vs. melee, dash frequency). Game tilts encounters to challenge your defaults. Framing matters enormously: "enemies learned to fear your dash" (cool) vs. "dash is worse now" (feels bad).

**D. "Weather Runs" — Real-World Weather Modifies the Dungeon**
Rain = flooded corridors, ice stronger, fire creates steam. Sun = open arenas, enemies aggressive. Night = stealth rooms, limited vision. Most diegetically natural version of exogenous context. Risk: players in constant-weather climates get less variety.

**E. "Local Legends" — Geolocation Shapes Mythology**
Geographic region influences enemy types, themes, mechanics. Coastal = sea themes, mountain = earth/stone. Creates identity ("I'm a coastal player"). More social/sharing than personal variety.

**F. "Haunted Dungeon" — Friends' Deaths Shape Your World**
Async multiplayer through ghost data. Friend dies → their death creates an event in your dungeon (obstacle, power-up, or powered-up enemy). Avenge friends for bonus rewards. Dark Souls bloodstains proved this works.

**G. "The Companion Walk" — Ambient Collection Feeds Core Runs**
Walking through your day collects encounters (route-based). Sit down for a session → those encounters become your dungeon rooms, in the order you choose. Two different genres (ambient collection + action roguelike) feeding each other. Biggest scope.

**Composability:**
- B + C = "the dungeon remembers you" — past self shapes dungeon AND game reads tendencies
- A + D = weather *explains* synergy shifts — less arbitrary feeling
- B + F = solo ghosts first, social ghosts later — same underlying system
- D + E = "your real world is the game world" full package

### Two Layers of Twist (Key Insight)

**A prototype needs BOTH a gameplay twist AND a generative twist.** The generative twist alone doesn't make the game feel different to play moment-to-moment. The gameplay twist alone doesn't solve the structural/retention problems. They compose.

**Gameplay twist** = what makes the moment-to-moment combat feel different from standard isometric action. This is what makes someone play for 5 minutes and say "that's interesting."

**Generative twist** = what makes the run-to-run structure feel alive. This is what makes someone come back tomorrow.

For prototyping, the generative twist can be faked — hard-coded presets are fine. The gameplay twist has to be real because you're evaluating *feel*.

### Gameplay Twist Candidates

**A. Bullet Time / Near-Miss System**
Proximity to danger triggers a power state (time slows, you move faster). Meter-based — bullet time drains it, kills refill it. Changes combat rhythm from "dodge away, dart in, dodge away" (Hades) to "lean into danger, exploit power state, chain kills." Lots of knobs for generative context (trigger threshold, meter capacity, abilities during BT, refill rate).
Reference: Superhot, Katana Zero, My Friend Pedro.

**B. Ricochet / Geometry Combat**
Projectiles bounce off walls. Direct hits = normal damage, ricochets = bonus damage or special effects. Room geometry becomes part of your weapon — playing billiards with bullets. Every room is a puzzle-within-combat. Generative context changes room geometry properties (ice = reflective, rain = absorptive).
Reference: Hotline Miami, Peggle, Noita.

**C. Momentum / Combo Velocity**
Momentum meter builds as you chain actions. Higher momentum = faster movement, more damage, abilities unlock at thresholds. Taking damage or stopping resets to zero. The game is about maintaining flow state. Generative context shifts what maintains/breaks momentum.
Reference: DMC style meter, Doom Eternal, Tony Hawk combo chains.

**D. Echo / Delayed Clone**
Actions are recorded and replayed by a ghost 3 seconds later. Always planning two time-states. Setting up crossfires with your past self. So novel that the generative layer can be simple — different echo configs (delay, count, what's copied) create radically different play.
Reference: Braid, The Swapper, Cursor*10.

**E. Absorb / Redirect**
Instead of dodging projectiles, absorb them. Absorbed projectiles charge your abilities and change their properties — absorb fire, your next attack is fire-element. You're eating the enemy's kit and throwing it back. Every enemy is a resource, not just an obstacle. Layers onto existing effect system.
Reference: Kirby copy abilities, Mega Man boss weapons.

### Gameplay × Generative Pairing Matrix

| Gameplay Twist | Best Generative Pairing | Why They Compose |
|---------------|------------------------|-----------------|
| Bullet Time | Ghost Runs — past deaths modify trigger thresholds and BT abilities | Previous failures shape your power state. Die to archers → BT triggers easier on projectiles. Learning conversation between runs. |
| Ricochet | Weather-Shifted Synergies — weather changes room geometry properties | The puzzle-within-combat shifts based on something external. Today's weather = today's geometry meta. |
| Momentum | Behavioral Drift — game profiles playstyle, shifts what maintains momentum | Always use ranged? Maintaining momentum starts requiring melee. Pushes you out of comfort zone through the system you care most about. |
| Echo/Clone | Fake it — hard-code daily modifier variations of echo config | Mechanic is already so novel that simple config shifts create radically different play. |
| Absorb/Redirect | Ghost Runs — enemies you died to have new projectile types = new absorption options | Death creates new tools. Enemy that killed you spawns with unique attack you've never absorbed. Worst run = most interesting toolkit. |

### The DM Layer

**Core concept:** AI (LLM) as the connective tissue that interprets player context and adapts the game meaningfully. Inspired by how a D&D DM bends rules to accommodate player creativity.

**Where it could live:**
- Interpreting exogenous context (translating weather/location/time into game modifiers)
- The knowledge cliff helper (N hints per run, reads game state + player history)
- Generating encounter descriptions or narrative flavor that responds to what's happening
- Adapting difficulty/pacing based on player behavior within a run

**Current assessment:** Powerful concept, but probably a layer to add *after* the core mechanical twist is working. The DM layer amplifies a good system; it doesn't replace one.

---

## Design Principles (Emerging)

1. **The twist should solve a cursed problem, not just be novel.** "What if X?" is weaker than "X solves the problem that Y has always had."

2. **Genre is scaffolding.** Build the minimum viable genre shell to evaluate the twist. Don't recreate the reference game.

3. **Generative surfaces must change decisions, not just aesthetics.** The bar: moments a designer couldn't have pre-built.

4. **The learning is human, the implementation is parallelizable.** Claude Code builds scaffolding and implements twists. Jeff plays, evaluates, synthesizes.

5. **Reliability AND exploration must coexist.** Players want the comfort of familiar strategies AND the temptation of the unknown. The twist should make the unknown more compelling, not remove the familiar.

6. **External context should feel like opportunity, not randomness.** "The weather made new synergies available" (opportunity) vs. "the weather nerfed my build" (punishment). Frame as additive, not subtractive.

7. **A prototype needs both a gameplay twist and a generative twist.** The gameplay twist makes the game feel different moment-to-moment. The generative twist makes the structure feel alive run-to-run. Neither works alone.

8. **Fake the data, test the design.** For generative twists, hard-code presets ("it's raining," "it's nighttime") and test whether the mechanical differences change decisions. If they don't change decisions with fake data, they won't change decisions with real data either. Real APIs are engineering, not design validation.

9. **A good gameplay twist creates knobs for the generative system to turn.** "You have a double jump" has few knobs. "Near-miss bullet time with a meter, refill on kills" has many knobs (threshold, capacity, abilities, refill rate). Prefer twists with high generative surface area.

---

## Phasing Decision (Hades Prototype)

### Phase 1: Genre Scaffolding — "Does the base game feel like an action roguelike?"
Build the minimum viable action roguelike. No twist yet — just the shell.

**Scope:**
- Pure melee combat (click-to-attack, replacing auto-fire projectile). Dash remains.
- One hand-coded room with enclosed arena geometry (reference Hades room screenshots)
- Room clear detection → transition to second hand-coded room
- Basic enemy encounters in each room
- Death → restart

**Decision: hand-coded rooms first, level editor later.** Start with a few rooms referencing Hades room geometry. A level editor is durable cross-prototype infrastructure (not just for Hades) and goes on main eventually, but not the first investment.

**Decision: pure melee to start.** No ranged weapon. Keeps the verb set simple for evaluating feel. Ranged can come back later as a weapon variant.

**"Done" looks like:** One room with melee combat that feels responsive → clear room → transition to second room. Playable in ~1 minute.

### Phase 2: Gameplay Twist — "Does the twist make combat feel different?"
Layer the chosen gameplay twist on top of the scaffolding. Strongest candidates: Bullet Time, Absorb/Redirect.

**Twist choice is deferred** until Phase 1 feels right. Playing the base game will inform which twist direction is most interesting.

### Phase 3: Generative Structural Twist — "Does the run-to-run structure feel alive?"
Add the generative layer. Fake the data (hard-coded presets). Test whether the mechanical differences change decisions.

**The generative twist should interact with the gameplay twist's knobs.** This is why Phase 2 has to land first — you need to know what knobs exist before you can design a system that turns them.

---

## Open Questions

- Which of the "parallel run" shapes is most prototypable? The within-run genre shift seems smallest in scope.
- Is the companion app idea worth prototyping separately, or is it too far from the current engine?
- Can the build convergence problem be addressed purely through exogenous context, or does the item/ability design itself need to be different?
- What's the minimum viable version of the DM layer? Is it just a rules engine mapping external inputs to game modifiers, or does it need actual LLM inference?
- Which gameplay twist × generative twist pairing should be the first prototype? Current strongest candidates: Bullet Time + Ghost Runs, Absorb/Redirect + Ghost Runs.
- For the gameplay twist: does the twist need to replace the existing verb set (dash/shoot/push) or augment it?
- What does the level editor look like? Should it live on main as shared infrastructure? What's the minimum viable version? (Deferred until after hand-coded rooms prove the concept.)

---

*Last updated: 2025-02-12*
