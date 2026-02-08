export const BOSS = {
  name: 'The Warden',
  health: 300,
  speed: 2.0,
  damage: 30,
  size: { radius: 0.8, height: 2.0 },
  color: 0xff8800,
  emissive: 0xff4400,
  phases: [
    { healthThreshold: 1.0, behavior: 'chase', attackRate: 1000 },
    { healthThreshold: 0.5, behavior: 'enrage', attackRate: 600, speed: 3.0, spawnMinions: { type: 'goblin', count: 3 } },
  ]
};
