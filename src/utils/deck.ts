import type { Card, CardCategory, DeckPresetId, Suit, Rank } from '../types';

const STANDARD_SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const STANDARD_RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(presetId: DeckPresetId = 'standard-54'): Card[] {
  if (presetId === 'hero-duel-prototype') {
    return shuffle(createHeroDuelDeck());
  }

  const deck: Card[] = [];

  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      deck.push({
        id: `${suit}-${rank}-${Math.random().toString(36).substring(7)}`,
        suit,
        rank,
      });
    }
  }

  if (presetId === 'standard-54') {
    deck.push({ id: `joker-red-${Math.random().toString(36).substring(7)}`, suit: 'none', rank: 'JOKER' });
    deck.push({ id: `joker-black-${Math.random().toString(36).substring(7)}`, suit: 'none', rank: 'JOKER' });
  }

  return shuffle(deck);
}

function createHeroDuelDeck(): Card[] {
  const deck: Card[] = [];
  const pushCopies = (
    faceId: string,
    title: string,
    category: CardCategory,
    count: number,
    tags: string[] = [],
  ) => {
    for (let i = 0; i < count; i++) {
      deck.push({
        id: `${faceId}-${i + 1}-${Math.random().toString(36).substring(7)}`,
        suit: 'none',
        rank: 'CUSTOM',
        packId: 'hero-duel-prototype',
        faceId,
        title,
        category,
        tags,
      });
    }
  };

  pushCopies('basic-strike', 'Strike', 'basic', 18, ['attack']);
  pushCopies('basic-guard', 'Guard', 'basic', 12, ['defense']);
  pushCopies('basic-recover', 'Recover', 'basic', 8, ['heal']);
  pushCopies('tactic-duel', 'Duel', 'tactic', 6, ['single-target']);
  pushCopies('tactic-ruse', 'Ruse', 'tactic', 8, ['trick']);
  pushCopies('tactic-rally', 'Rally', 'tactic', 4, ['group']);
  pushCopies('equipment-weapon', 'Weapon', 'equipment', 6, ['weapon']);
  pushCopies('equipment-armor', 'Armor', 'equipment', 4, ['armor']);
  pushCopies('role-leader', 'Leader Role', 'role', 1, ['identity']);
  pushCopies('role-loyalist', 'Ally Role', 'role', 2, ['identity']);
  pushCopies('role-rebel', 'Rival Role', 'role', 3, ['identity']);
  pushCopies('role-renegade', 'Solo Role', 'role', 1, ['identity']);
  pushCopies('character-vanguard', 'Vanguard', 'character', 1, ['character']);
  pushCopies('character-strategist', 'Strategist', 'character', 1, ['character']);

  return deck;
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
