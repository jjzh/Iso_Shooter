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

---

## Open Questions

- Which of the "parallel run" shapes is most prototypable? The within-run genre shift seems smallest in scope.
- How much exogenous context can a browser game actually access without being creepy or requiring complex permissions?
- Is the companion app idea worth prototyping separately, or is it too far from the current engine?
- Can the build convergence problem be addressed purely through exogenous context, or does the item/ability design itself need to be different?
- What's the minimum viable version of the DM layer? Is it just a rules engine mapping external inputs to game modifiers, or does it need actual LLM inference?

---

*Last updated: 2025-02-12*
