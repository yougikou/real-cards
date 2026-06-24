import type { DeckPresetId, GameSettings } from '../types';

export type ContainerType =
  | 'deck'
  | 'playStack'
  | 'discardPile'
  | 'roleZone'
  | 'characterZone'
  | 'equipmentZone'
  | 'judgmentZone'
  | 'playerPublicZone';

export interface ContainerConfig {
  id: ContainerType;
  owner: 'table' | 'player';
  label: string;
  shortLabel?: string;
  emptyText?: string;
  emptySubText?: string;
  actionButtonText?: string;
  disabledButtonText?: string;
  acceptedCategories?: string[];
  visibility?: 'public' | 'private' | 'owner';
}

export interface GamePackConfig {
  id: string;
  name: string;
  deckPresets: DeckPresetId[];
  defaultDeckPresetId: DeckPresetId;
  layoutOrder: ContainerType[];
  containers: Record<ContainerType, ContainerConfig>;
}

export interface DeckPresetConfig {
  id: DeckPresetId;
  name: string;
  cardCount: number;
  includesJokers: boolean;
}

export const DECK_PRESETS: Record<DeckPresetId, DeckPresetConfig> = {
  'standard-52': {
    id: 'standard-52',
    name: 'Standard 52',
    cardCount: 52,
    includesJokers: false,
  },
  'standard-54': {
    id: 'standard-54',
    name: 'Standard 54',
    cardCount: 54,
    includesJokers: true,
  },
  'hero-duel-prototype': {
    id: 'hero-duel-prototype',
    name: 'Hero Duel Prototype',
    cardCount: 75,
    includesJokers: false,
  },
};

export const DEFAULT_SANDBOX_PACK: GamePackConfig = {
  id: 'standard-sandbox',
  name: 'Standard Sandbox',
  deckPresets: ['standard-52', 'standard-54'],
  defaultDeckPresetId: 'standard-54',
  layoutOrder: ['discardPile', 'deck'],
  containers: {
    deck: {
      id: 'deck',
      owner: 'table',
      label: 'Deck Count',
      shortLabel: 'Deck',
      acceptedCategories: ['standard', 'joker', 'custom'],
      visibility: 'public',
    },
    playStack: {
      id: 'playStack',
      owner: 'table',
      label: 'Public Play History',
      emptyText: 'Public Table',
      emptySubText: 'Played cards will<br/>appear here',
      actionButtonText: 'Clear Area to Discard ↓',
      disabledButtonText: 'Clear to Discard (Area Empty)',
      acceptedCategories: ['standard', 'joker', 'basic', 'tactic', 'equipment', 'custom'],
      visibility: 'public',
    },
    discardPile: {
      id: 'discardPile',
      owner: 'table',
      label: 'Discard',
      shortLabel: 'Discard',
      emptyText: 'Drop here to clear',
      acceptedCategories: ['standard', 'joker', 'basic', 'tactic', 'equipment', 'custom'],
      visibility: 'public',
    },
    roleZone: {
      id: 'roleZone',
      owner: 'player',
      label: 'Role',
      shortLabel: 'Role',
      emptyText: 'Hidden role',
      acceptedCategories: ['role'],
      visibility: 'owner',
    },
    characterZone: {
      id: 'characterZone',
      owner: 'player',
      label: 'Character',
      shortLabel: 'Hero',
      emptyText: 'Choose character',
      acceptedCategories: ['character'],
      visibility: 'public',
    },
    equipmentZone: {
      id: 'equipmentZone',
      owner: 'player',
      label: 'Equipment',
      shortLabel: 'Equip',
      emptyText: 'No equipment',
      acceptedCategories: ['equipment'],
      visibility: 'public',
    },
    judgmentZone: {
      id: 'judgmentZone',
      owner: 'player',
      label: 'Judgment',
      shortLabel: 'Judge',
      emptyText: 'No judgment cards',
      acceptedCategories: ['tactic'],
      visibility: 'public',
    },
    playerPublicZone: {
      id: 'playerPublicZone',
      owner: 'player',
      label: 'Player Public Area',
      shortLabel: 'Public',
      emptyText: 'No public cards',
      acceptedCategories: ['basic', 'tactic', 'equipment', 'custom'],
      visibility: 'public',
    },
  },
};

export const HERO_DUEL_PACK: GamePackConfig = {
  id: 'hero-duel-prototype',
  name: 'Hero Duel Prototype',
  deckPresets: ['hero-duel-prototype'],
  defaultDeckPresetId: 'hero-duel-prototype',
  layoutOrder: ['roleZone', 'characterZone', 'equipmentZone', 'judgmentZone', 'playerPublicZone', 'discardPile', 'deck'],
  containers: DEFAULT_SANDBOX_PACK.containers,
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  gamePackId: DEFAULT_SANDBOX_PACK.id,
  deckPresetId: DEFAULT_SANDBOX_PACK.defaultDeckPresetId,
  startingHandCount: 0,
  allowDrawFromOthers: true,
  allowClientClearTable: false,
  revealCardFacesInEvents: true,
  allowPlayerUndo: true,
};

export function getGamePackIdForDeckPreset(deckPresetId: DeckPresetId): string {
  if (deckPresetId === HERO_DUEL_PACK.defaultDeckPresetId) return HERO_DUEL_PACK.id;
  return DEFAULT_SANDBOX_PACK.id;
}
