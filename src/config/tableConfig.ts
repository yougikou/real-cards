export type ContainerType = 'deck' | 'playStack' | 'discardPile';

export interface ContainerConfig {
  id: ContainerType;
  label: string;
  shortLabel?: string;
  emptyText?: string;
  emptySubText?: string;
  actionButtonText?: string;
  disabledButtonText?: string;
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
  layoutOrder: ['discardPile', 'deck'],
  containers: {
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
      actionButtonText: 'Clear Area to Discard ↓',
      disabledButtonText: 'Clear to Discard (Area Empty)',
    },
    discardPile: {
      id: 'discardPile',
      label: 'Discard',
      shortLabel: 'Discard',
      emptyText: 'Drop here to clear',
    },
  },
};
