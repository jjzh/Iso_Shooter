export interface BendEffect {
  param: 'scale' | 'mass' | 'radius';
  operation: 'multiply' | 'set';
  value: number;
}

export interface RuleBend {
  id: string;
  name: string;
  description: string;
  icon: string;
  property: 'size' | 'adhesion' | 'durability';
  pole: 'positive' | 'negative';
  effects: BendEffect[];
  tintColor: number;
}

export const BENDS: RuleBend[] = [
  {
    id: 'enlarge',
    name: 'Enlarge',
    description: 'Scale up — bigger, heavier, more impact',
    icon: '⬆',
    property: 'size',
    pole: 'positive',
    effects: [
      { param: 'scale', operation: 'multiply', value: 2.5 },
      { param: 'mass', operation: 'multiply', value: 2 },
      { param: 'radius', operation: 'multiply', value: 2 },
    ],
    tintColor: 0x4488ff,
  },
  {
    id: 'shrink',
    name: 'Shrink',
    description: 'Scale down — tiny, light, flies on any push',
    icon: '⬇',
    property: 'size',
    pole: 'negative',
    effects: [
      { param: 'scale', operation: 'multiply', value: 0.3 },
      { param: 'mass', operation: 'multiply', value: 0.3 },
      { param: 'radius', operation: 'multiply', value: 0.3 },
    ],
    tintColor: 0xffcc44,
  },
];

export function getBendById(id: string): RuleBend | undefined {
  return BENDS.find(b => b.id === id);
}