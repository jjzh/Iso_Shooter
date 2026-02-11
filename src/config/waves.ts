import { WaveDefinition } from '../types/index';

export const WAVES: WaveDefinition[] = [
  {
    wave: 1,
    message: 'Wave 1 — The dungeon stirs...',
    groups: [
      {
        id: 'w1g1',
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: [
          { type: 'goblin', x: 5, z: 2 },
          { type: 'goblin', x: 11, z: 0 },
          { type: 'goblin', x: 0, z: 5 },
          { type: 'iceMortarImp', x: 7, z: -11 },
          { type: 'iceMortarImp', x: -10, z: 9 },
        ],
      },
      {
        id: 'w1g2',
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: [
          { type: 'goblin', x: -2, z: -9 },
          { type: 'goblin', x: -10, z: -3 },
          { type: 'goblin', x: -10, z: 0 },
        ],
      },
    ]
  },
  {
    wave: 2,
    message: 'Wave 2 — Watch the big ones',
    groups: [
      {
        id: 'w2g1',
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 150,
        spawns: [
          { type: 'goblin', x: 14, z: 0 },
          { type: 'stoneGolem', x: 12, z: 2 },
          { type: 'goblin', x: 12, z: -2 },
          { type: 'goblin', x: -14, z: 0 },
          { type: 'goblin', x: -12, z: 2 },
          { type: 'stoneGolem', x: -12, z: -1 },
          { type: 'goblin', x: 6, z: -7 },
          { type: 'goblin', x: -6, z: 6 },
        ],
      },
      {
        id: 'w2g2',
        triggerDelay: 3000,
        telegraphDuration: 2000,
        stagger: 400,
        spawns: [
          { type: 'skeletonArcher', x: 12, z: 12 },
          { type: 'skeletonArcher', x: -12, z: -12 },
          { type: 'skeletonArcher', x: -12, z: 12 },
        ],
      },
    ]
  },
  {
    wave: 3,
    message: 'Wave 3 — Final wave?',
    groups: [
      {
        id: 'w3g1',
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 100,
        spawns: [
          { type: 'goblin', x: 15, z: 5 },
          { type: 'goblin', x: 15, z: -5 },
          { type: 'goblin', x: -15, z: 5 },
          { type: 'goblin', x: -15, z: -5 },
          { type: 'goblin', x: 5, z: 15 },
          { type: 'goblin', x: -5, z: 15 },
        ],
      },
      {
        id: 'w3g2',
        triggerDelay: 2000,
        telegraphDuration: 2000,
        stagger: 300,
        spawns: [
          { type: 'skeletonArcher', x: 14, z: 10 },
          { type: 'skeletonArcher', x: -14, z: 10 },
          { type: 'skeletonArcher', x: 0, z: -16 },
          { type: 'skeletonArcher', x: 14, z: -10 },
        ],
      },
      {
        id: 'w3g3',
        triggerDelay: 6000,
        telegraphDuration: 2500,
        stagger: 500,
        spawns: [
          { type: 'stoneGolem', x: 0, z: 15 },
          { type: 'stoneGolem', x: -15, z: -5 },
          { type: 'stoneGolem', x: 15, z: -5 },
        ],
      },
      {
        id: 'w3g4',
        triggerDelay: 7000,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: [
          { type: 'iceMortarImp', x: -13, z: 0 },
          { type: 'iceMortarImp', x: -3, z: -12 },
          { type: 'iceMortarImp', x: 12, z: 1 },
          { type: 'iceMortarImp', x: -5, z: 11 },
        ],
      },
    ]
  },
];
