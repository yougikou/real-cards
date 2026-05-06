export type ContainerType = 'deck' | 'playStack' | 'discardPile' | 'equipmentZone';

export interface ContainerConfig {
  id: ContainerType;
  label: string;
  shortLabel?: string;
  emptyText?: string;
  emptySubText?: string;
  clearAction?: string;
  clearActionEmpty?: string;
}

export interface GamePackConfig {
  id: string;
  name: string;
  layoutOrder: ContainerType[];
  containers: Record<ContainerType, ContainerConfig>;
}

export const DEFAULT_SANDBOX_PACK: GamePackConfig = {
  id: 'standard-sandbox',
  name: 'Standard Sandbox',
  layoutOrder: ['equipmentZone', 'discardPile', 'deck'],
  containers: {
    equipmentZone: {
      id: 'equipmentZone',
      label: 'Equipment',
      shortLabel: 'Equip',
      emptyText: 'Drop to equip',
    },
    deck: {
      id: 'deck',
      label: 'Deck Count',
      shortLabel: 'Deck',
    },
    playStack: {
      id: 'playStack',
      label: 'Public Play History',
      emptyText: 'Public Table',
      emptySubText: 'Played cards will<br/>appear here',
      clearAction: 'Clear Area to Discard ↓',
      clearActionEmpty: 'Clear to Discard (Area Empty)',
    },
    discardPile: {
      id: 'discardPile',
      label: 'Discard',
      shortLabel: 'Discard',
      emptyText: 'Drop here to clear',
    },
  },
};
