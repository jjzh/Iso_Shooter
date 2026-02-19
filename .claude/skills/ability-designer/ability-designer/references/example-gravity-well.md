# Gravity Well — Design Card

## 1. Fantasy & Feel

You conjure a point of crushing gravitational force — a sphere of dark energy that slowly sucks enemies toward its center. The moment when clustered enemies begin sliding helplessly inward, only to slam together at the center, is the highlight reel. The ability feels like controlled environment domination: you're not attacking directly, you're reshaping the battlefield.

## 2. Core Mechanic

**Input:** Tap (instant cast)
**Timing:** Instant cast. Effect lingers for duration.
**Shape:** Ring telegraph (visual indicator of pull zone), centered on cast point
**Primary Effect:** Enemies in radius experience constant pull acceleration toward center. Pull strength and range are tunable. Effect dissipates after duration or when no enemies remain.

Key inputs:
- **Cast point:** Where player aims/releases (could be directional from player position, or click-to-target style)
- **Radius:** Tunable pull zone (start: 6 units, scales via slider)
- **Pull acceleration:** How fast enemies move inward (start: 2 units/sec²)
- **Duration:** How long the well lasts (start: 3 seconds)
- **Cooldown:** 6000ms (can't spam)

## 3. Physics Interactions

### Enemies
- While in radius, enemy velocity is dampened and pulls toward center point each frame
- Pull is proportional to distance (stronger at edge, weaker as enemy reaches center)
- Enemies collide with each other at center—chain reactions possible
- Pull continues even while enemy is stunned/slowed (can override crowd control to some extent)

### Walls/Obstacles
- Gravity well ignores walls—it pulls through obstacles (this is the power fantasy)
- If wall blocks direct path to center, enemy slides around it while being pulled
- Enemy can get pinned against wall by pull + wall collision = potential wall-splat setup
- Good for setup plays: "pull enemy into corner, they ping against wall while centered"

### Pits
- **Critical interaction:** If well is cast near pit edge, enemies pulled over the edge fall to death
- Creates high-risk/high-reward positioning gameplay
- Player can't self-cast near own position on pit edge (would risk pulling self in)
- Natural counter: "place well at pit entrance, watch enemies get sucked in"

### Other Enemies
- Multiple enemies in same well create collision chains
- Enemy A pulled in hits Enemy B, Enemy B gets displaced, creates cascading stun opportunity
- Heavy enemies (Golem) resist pull more (slow movement) but still get pulled
- Archers in well have harder time aiming (target moving toward center)

### Ice Patches
- Enemies on ice patches slide faster toward gravity center (already frictionless + pull = 1.5x pull speed)
- Well on ice patch = efficiency amplification
- Skeleton archers on ice slide uncontrollably inward = dangerous for them

### Existing Effects
- **Slow:** Gravity pull + slow stacks multiplicatively. Slowed enemies still get pulled but at reduced speed.
- **Stun:** Stunned enemies don't move, but pull "queues"—when stun ends, they snap toward center (feels good)
- **Fire:** Fire burns while enemy is pulled inward—duration stacking (no special interaction)
- **Knockback:** Competing forces. Knockback pushes out, well pulls in. Design choice: knockback takes priority (player agency), or they blend (knockback slows pull, pull continues after knockback ends). Recommend: knockback takes priority for 0.5 sec, then pull resumes.

## 4. Enemy Type Interactions

### Goblin Rushers
- Gravity well counters their rush playstyle: they charge in and get pulled sideways
- If near pit, goblin rushing toward player gets pulled aside into pit = skill expression moment
- Goblin can escape by leaping out if positioned right—timing matters

### Skeleton Archers
- Archers hate being pulled in—they want range. Gravity well removes that advantage.
- Pulled archer has reduced accuracy while moving. Crowd control payoff: less damage incoming.
- Good for shutting down archer spam waves

### Ice Mortar Imps
- Mortar imps already create ice patches. Gravity well on ice creates super-efficient pulls.
- Imp can throw mortars while being pulled inward—still dangerous, but slower trajectory
- Tactical depth: "pull imp into corner to block mortar angles"

### Crystal Golems
- Golem has high mass, resists pull strongly (moves at 50% pull speed)
- Golem shield blocks pull (shield is "anchoring"? design choice needed)
- If you can get Golem to center with other enemies, shield breaks in collision chain
- Golem becomes slower threat, not stationary

## 5. Edge Cases & Risks

### Unfair Moments
- **Pit + well near edge:** If well is too close to pit edge on narrow path, can feel unavoidable. Mitigate: player sees telegraph ring ahead of time, can dodge before cast lands.
- **Multiple wells stacking:** If player double-casts (cooldown expires), do wells interact? Probably not (only one active at a time, or they merge). Flag as tuning question.
- **Golem charge + well:** Golem charges into well. Charge is interrupted or slowed? Recommend: charge takes priority, pull resumes after charge ends (0.3 sec).

### Confusing Interactions
- **Push + pull:** If force push is used on enemy already pulled by well, which wins? Recommend: push always wins immediately, then pull resumes.
- **Stun while pulled:** Does pulled enemy appear to be stunned or pulled? Visual clarity: pulled enemies have distinct animation (sliding), stunned enemies freeze. If both apply, pulled animation takes priority.

### Potential Exploits
- **Infinite center damage:** If enemies stack at center and collide repeatedly, does damage loop? Recommend: collision damage only triggers once per pair per frame (not infinite).
- **Well + ice patch spam:** Ice mortar imp + well on ice = enemies slide in too fast, uncontrollable. Tuning: slow down pull on ice to 1.2x instead of 1.5x, or reduce ice duration near well.
- **Player self-pull:** Can player cast well on self and get pulled inward? No—well only affects enemies, not player.

## 6. Tuning Levers

| Parameter | Suggested Start | Range | What It Controls |
|-----------|-----------------|-------|------------------|
| `radius` | 6 units | 4–10 units | Pull zone size; affects how many enemies drawn in |
| `pullAcceleration` | 2 units/sec² | 1–4 units/sec² | How fast enemies move inward; higher = snappier feel |
| `duration` | 3000 ms | 2000–5000 ms | How long well persists; longer = more setup time |
| `cooldown` | 6000 ms | 5000–8000 ms | Ability recharge time |
| `damagePerSecond` | 0 | 0–15 dmg/sec | Optional: does well damage enemies as they're pulled? (probably not—crowd control is the payoff) |
| `golemResistMult` | 0.5 | 0.3–0.7 | Golem moves at this % of normal pull speed |
| `pullOnIceAmp` | 1.2x | 1.0–1.5x | Pull speed multiplier when enemy on ice patch |
| `pullThroughWallsEnabled` | true | — | Does well pull through walls or not? (core mechanic) |

All values are live-tunable via the right-side slider panel and URL params.

## 7. Implementation Map

### Config Entry (`config/abilities.js`)
```javascript
gravityWell: {
  name: 'Gravity Well',
  key: 'Q',  // or adjust per input scheme
  radius: 6,
  pullAcceleration: 2,
  duration: 3000,
  cooldown: 6000,
  damagePerSecond: 0,
  golemResistMult: 0.5,
  pullOnIceAmp: 1.2,
  pullThroughWallsEnabled: true,
  // Telegraph visual
  telegraphColor: 0x4B0082,  // indigo
  telegraphOpacity: 0.3,
}
```

### Effect Type (if damage is added later): `config/effectTypes.js`
```javascript
'gravityPull': {
  name: 'Gravity Pull',
  modifiers: {
    speedMult: 0.3,  // 30% slow while pulled (visual clarity)
    knockbackMult: 0.5,  // resist knockback while pulled
    canAct: true,  // enemies can still act while pulled
  },
  stacking: {
    maxStacks: 1,
    rule: 'replace',
  },
  duration: 3000,
  targets: { enemies: true },
  visual: { zone: { color: 0x4B0082, opaque: true } },
}
```

### State Variables (`entities/player.js`)
```javascript
// Add to player state:
gravityWellActive = false;
gravityWellX = 0;
gravityWellZ = 0;
gravityWellTimer = 0;
gravityWellCooldown = 0;
```

### Input Handling (`entities/player.js` > `updatePlayer()`)
```javascript
// Pseudo-code in input check:
if (inputQPressed && gravityWellCooldown <= 0) {
  // Cast well at aimed position or relative to player
  gravityWellActive = true;
  gravityWellX = targetX;
  gravityWellZ = targetZ;
  gravityWellTimer = config.abilities.gravityWell.duration;
  gravityWellCooldown = config.abilities.gravityWell.cooldown;

  // Spawn telegraph ring
  applyAoeEffect({
    x: gravityWellX,
    z: gravityWellZ,
    radius: config.abilities.gravityWell.radius,
    durationMs: config.abilities.gravityWell.duration,
    color: config.abilities.gravityWell.telegraphColor,
    effectFn: null,  // no instant effect; pull is continuous
    gameState,
  });
}
```

### Update Logic (`entities/player.js` > `updatePlayer()`)
```javascript
// Tick cooldown
if (gravityWellCooldown > 0) {
  gravityWellCooldown -= dt;
}

// Tick active well
if (gravityWellActive) {
  gravityWellTimer -= dt;
  if (gravityWellTimer <= 0) {
    gravityWellActive = false;
  }
}
```

### Pull Physics (`engine/physics.js` or `engine/game.js` in enemy update)
**In the enemy update loop (after collision resolution):**
```javascript
// For each enemy, check if it's in gravity well radius
if (player.gravityWellActive) {
  const dx = enemy.x - player.gravityWellX;
  const dz = enemy.z - player.gravityWellZ;
  const dist = Math.sqrt(dx*dx + dz*dz);

  if (dist < config.abilities.gravityWell.radius) {
    // Calculate pull direction (toward center)
    const pullDir = {
      x: -dx / dist,
      z: -dz / dist,
    };

    // Apply pull acceleration (with resistance for Golem)
    let pullAcc = config.abilities.gravityWell.pullAcceleration;
    if (enemy.type === 'golem') {
      pullAcc *= config.abilities.gravityWell.golemResistMult;
    }

    // If on ice, amplify pull
    if (isEnemyOnIcePatch(enemy)) {
      pullAcc *= config.abilities.gravityWell.pullOnIceAmp;
    }

    // Add pull to velocity (frame-by-frame accumulation)
    enemy.velocity.x += pullDir.x * pullAcc * (dt / 1000);
    enemy.velocity.z += pullDir.z * pullAcc * (dt / 1000);
  }
}
```

### Visual Feedback
- **Telegraph:** Ring AoE displayed when well is cast, using `applyAoeEffect()` with indigo color
- **Mesh effect:** Optional spiral vortex mesh at center to reinforce gravitational theme (can be added later)
- **Enemy feedback:** Enemies slide visually toward center—friction feel. No special damage indicator needed unless damage is added.
- **Sound:** Whirlwind loop sfx for duration (placeholder: reuse slow/stun effect sfx)

### New Engine Work
**Minimal—gravity well uses existing systems with one new physics rule:**

1. **Pull acceleration rule:** Needs to be added to enemy physics update. Can live in `engine/physics.js` or be a simple check in enemy update loop (recommended: keep in `updateEnemies()` alongside other ability checks).

2. **Through-walls pull:** Mark gravity well as "wall-permeable" in physics (don't raycast for obstacles when pulling). This is new but low-cost (flag in physics check).

3. **Telegraph:** Uses existing `applyAoeEffect()` with ring shape—no new code needed.

**No new effect types strictly required** (pull is physics-based, not effect-based). If you want status effect feedback (slight slow while pulled), add the `gravityPull` effect type above. This is optional for feel.

## 8. Open Questions

### Design Choices Still Unresolved

1. **Cast aiming:** How does player target the well location?
   - **Option A:** Click-to-cast (mouse or touch position)
   - **Option B:** Fixed direction from player (always straight ahead, like force push)
   - **Option C:** Radial menu or hold-to-aim
   - **Recommendation:** Click-to-cast for precision, fits isometric view well. Force push already uses charged direction, so this adds variety.

2. **Multiple wells:** Can player have multiple wells active at once?
   - **Option A:** Only one well at a time (second cast cancels first)
   - **Option B:** Multiple wells can coexist (costs more resources, tuning nightmare)
   - **Recommendation:** One well at a time. Simpler, cleaner counterplay.

3. **Knockback priority:** When knockback and pull both apply, who wins?
   - **Option A:** Knockback overrides pull completely
   - **Option B:** Knockback pauses pull for 0.5 sec, then pull resumes
   - **Option C:** They blend (knockback reduces pull speed)
   - **Recommendation:** Option B. Respects player agency (knockback from force push escapes the well) but well eventually recaptures.

4. **Damage:** Does the well deal damage, or only crowd control?
   - **Option A:** No damage—pure crowd control tool
   - **Option B:** Low DoT as enemies are pulled in
   - **Option C:** Collision damage when enemies hit each other at center
   - **Recommendation:** Start with Option A (no damage). Well is the utility ability—force push is damage. Keeps roles clear. Add collision damage in iteration if needed.

5. **Wall-pierce interaction:** Thematic but risky. Can well pull through closed doors or impassable walls?
   - **Option A:** Well pulls through all terrain (core fantasy)
   - **Option B:** Well respects wall obstacles (more physics-grounded)
   - **Recommendation:** Option A (pulls through). This is the unique identity. But test carefully with arena layouts to avoid trivializing boss patterns.

6. **Self-casting:** Can player cast well on their own position for defensive utility?
   - **Option A:** Yes—player can stand in well to prevent being pushed (all pushes reduced)
   - **Option B:** No—well is purely offensive
   - **Recommendation:** No (Option B). Prevents defensive stalling. Well is for repositioning enemies, not protection.

---

## Summary

**Gravity Well** is a positioning/crowd-control ability that reshapes combat around a fixed point. Its design space thrives on **interaction with terrain, pits, and other enemies**, not raw damage. The skill expression moment is predicting where enemies will cluster and timing the well placement for maximum chaos.

**Start tuning:** Radius 6, pull acceleration 2, duration 3 sec, cooldown 6 sec. Use the slider panel to feel the difference between 1.5x and 3x pull speed. **Test heavily with pits**—this interaction is the main payoff and the biggest balance risk.
