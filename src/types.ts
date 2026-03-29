export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'none';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER';

export interface Card {
  id: string; // unique identifier
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string; // peer ID
  name: string;
  handCount: number; // For others to know how many cards
}

export interface GameState {
  deckCount: number;
  discardPile: Card[];
  playStack: Card[][]; // Stack of played batches
  players: Record<string, Player>;
}

// Action sent from Client to Host
export type ClientAction =
  | { type: 'JOIN'; payload: { name: string } }
  | { type: 'DRAW'; payload: { count: number } }
  | { type: 'RETURN'; payload: { cards: Card[], toTop: boolean } }
  | { type: 'PLAY'; payload: { cards: Card[] } }
  | { type: 'TAKE_BACK'; payload: { cards: Card[] } } // Take back from current play stack top
  | { type: 'DRAW_FROM_OTHER'; payload: { targetPlayerId: string, cardId: string } };

// Message sent from Host to Client
export type HostMessage =
  | { type: 'STATE_UPDATE'; payload: GameState }
  | { type: 'RECEIVE_CARDS'; payload: Card[] } // When Host gives cards to Client
  | { type: 'REMOVE_CARDS'; payload: string[] } // When Client's cards are drawn by someone else
  | { type: 'ERROR'; payload: string };
