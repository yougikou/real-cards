import type { Card, Player } from '../types';

export const TABLE_EVENTS = {
  reset: 'table-reset',
  playersUpdated: 'players-updated',
  deckCountUpdated: 'deck-count-updated',
  discardCountUpdated: 'discard-count-updated',
  playStackUpdated: 'play-stack-updated',
  hostDealCard: 'host-deal-card',
  hostPopCard: 'host-pop-card',
  hostReturnPoppedCard: 'host-return-popped-card',
  hostDrawToTable: 'host-draw-to-table',
  hostDealToTable: 'host-deal-to-table',
  hostReturnBatch: 'host-return-batch',
  hostClearTable: 'host-clear-table',
  hostDragPublicCard: 'host-drag-public-card',
  hostReturnPublicCard: 'host-return-public-card',
  hostDiscardCard: 'host-discard-card',
} as const;

export interface TableEventDetailMap {
  [TABLE_EVENTS.reset]: undefined;
  [TABLE_EVENTS.playersUpdated]: { players: Record<string, Player> };
  [TABLE_EVENTS.deckCountUpdated]: { count: number };
  [TABLE_EVENTS.discardCountUpdated]: { count: number; topCard?: Pick<Card, 'rank' | 'suit'> | null };
  [TABLE_EVENTS.playStackUpdated]: { playStack: Card[][] };
  [TABLE_EVENTS.hostDealCard]: { playerId: string; cardData?: Card };
  [TABLE_EVENTS.hostPopCard]: { callback: (card: Card | null) => void };
  [TABLE_EVENTS.hostReturnPoppedCard]: { cardData: Card };
  [TABLE_EVENTS.hostDrawToTable]: undefined;
  [TABLE_EVENTS.hostDealToTable]: { cardData: Card };
  [TABLE_EVENTS.hostReturnBatch]: { toTop: boolean };
  [TABLE_EVENTS.hostClearTable]: undefined;
  [TABLE_EVENTS.hostDragPublicCard]: { cardData: Card; x: number; y: number };
  [TABLE_EVENTS.hostReturnPublicCard]: { cardData: Card };
  [TABLE_EVENTS.hostDiscardCard]: { cardData: Card };
}

type TableEventName = keyof TableEventDetailMap;

export function emitTableEvent<Name extends TableEventName>(
  name: Name,
  ...detail: TableEventDetailMap[Name] extends undefined ? [] : [TableEventDetailMap[Name]]
): void {
  if (detail.length === 0) {
    window.dispatchEvent(new Event(name));
    return;
  }
  window.dispatchEvent(new CustomEvent(name, { detail: detail[0] }));
}

export function onTableEvent<Name extends TableEventName>(
  name: Name,
  handler: (detail: TableEventDetailMap[Name]) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<TableEventDetailMap[Name]>).detail);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
