import type { Card, Suit, Rank } from '../types';

export function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        id: `${suit}-${rank}-${Math.random().toString(36).substring(7)}`,
        suit,
        rank,
      });
    }
  }

  // Add Jokers
  deck.push({ id: `joker-red-${Math.random().toString(36).substring(7)}`, suit: 'none', rank: 'JOKER' });
  deck.push({ id: `joker-black-${Math.random().toString(36).substring(7)}`, suit: 'none', rank: 'JOKER' });

  return shuffle(deck);
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
