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

export type GameEventType =
  | 'JOIN'
  | 'DRAW'
  | 'PLAY'
  | 'RETURN'
  | 'DRAW_FROM_OTHER'
  | 'UNDO'
  | 'HOST_DEAL'
  | 'HOST_DRAW_TO_TABLE'
  | 'HOST_RETURN_BATCH'
  | 'HOST_CLEAR_TABLE'
  | 'HOST_DISCARD'
  | 'HOST_TAKE_FROM_TABLE'
  | 'HOST_RETURN_TO_TABLE';

export interface GameEvent {
  timestamp: number;
  type: GameEventType;
  playerName?: string;
  cards?: Card[];
  count?: number;
  targetPlayerName?: string;
}

export interface GameState {
  deckCount: number;
  discardPile: Card[];
  playStack: Card[][]; // Stack of played batches
  players: Record<string, Player>;
  eventLog: GameEvent[];
}

// Action sent from Client to Host
export type ClientAction =
  | { type: 'JOIN'; payload: { name: string } }
  | { type: 'DRAW'; payload: { count: number } }
  | { type: 'RETURN'; payload: { cards: Card[], toTop: boolean } }
  | { type: 'PLAY'; payload: { cards: Card[] } }
  | { type: 'TAKE_BACK'; payload: { cards: Card[] } } // Take back from current play stack top
  | { type: 'DRAW_FROM_OTHER'; payload: { targetPlayerId: string, cardId: string } }
  | { type: 'UNDO_LAST_ACTION'; payload: Record<string, never> }
  | { type: 'CLEAR_TABLE'; payload: Record<string, never> };

// Message sent from Host to Client
export type HostMessage =
  | { type: 'STATE_UPDATE'; payload: GameState }
  | { type: 'RECEIVE_CARDS'; payload: Card[] } // When Host gives cards to Client
  | { type: 'REMOVE_CARDS'; payload: string[] } // When Client's cards are drawn by someone else
  | { type: 'ERROR'; payload: string };
