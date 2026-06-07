import type { Card, Player } from '../types';

export type TableBridgeSource = 'react-host' | 'phaser-table';
export type TableBridgeTarget = 'react-host' | 'phaser-table';

const TABLE_BRIDGE_CHANNELS = {
  hostCommand: 'real-cards:table-bridge:host-command',
  tableSnapshot: 'real-cards:table-bridge:table-snapshot',
} as const;

export interface TableBridgeEnvelope<
  Kind extends keyof typeof TABLE_BRIDGE_CHANNELS,
  Name extends string,
  Detail,
> {
  id: string;
  kind: Kind;
  name: Name;
  source: TableBridgeSource;
  target: TableBridgeTarget;
  detail: Detail;
  createdAt: number;
}

export interface HostCommandDetailMap {
  assignPlayerToSeat: { playerId: string; seatId: string };
  dealCardToPlayer: { playerId: string; cardData?: Card };
  popDeckCardForDrag: { callback: (card: Card | null) => void };
  returnPoppedDeckCard: { cardData: Card };
  drawDeckCardToTable: undefined;
  revealDeckCardToTable: { cardData: Card };
  returnTableBatchToDeck: { toTop: boolean };
  clearTableToDiscard: undefined;
  takePublicCardForDrag: { cardData: Card; pointer: { x: number; y: number } };
  returnPublicCardToTable: { cardData: Card };
  discardPublicCard: { cardData: Card };
}

export interface TableSnapshotDetailMap {
  reset: undefined;
  seatAssignmentMode: { playerId: string | null; playerName?: string };
  players: { players: Record<string, Player> };
  deckCount: { count: number };
  discardPile: { count: number; topCard?: Pick<Card, 'rank' | 'suit'> | null };
  playStack: { playStack: Card[][] };
}

export type HostCommandName = keyof HostCommandDetailMap;
export type TableSnapshotName = keyof TableSnapshotDetailMap;

export type HostCommandEnvelope<Name extends HostCommandName = HostCommandName> =
  TableBridgeEnvelope<'hostCommand', Name, HostCommandDetailMap[Name]>;

export type TableSnapshotEnvelope<Name extends TableSnapshotName = TableSnapshotName> =
  TableBridgeEnvelope<'tableSnapshot', Name, TableSnapshotDetailMap[Name]>;

function createBridgeId(source: TableBridgeSource, target: TableBridgeTarget, name: string) {
  return `${source}->${target}:${name}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function emitBridgeEvent<
  Kind extends keyof typeof TABLE_BRIDGE_CHANNELS,
  Name extends string,
  Detail,
>(
  channel: Kind,
  envelope: TableBridgeEnvelope<Kind, Name, Detail>,
) {
  window.dispatchEvent(new CustomEvent(TABLE_BRIDGE_CHANNELS[channel], { detail: envelope }));
}

function onBridgeEvent<
  Kind extends keyof typeof TABLE_BRIDGE_CHANNELS,
  Name extends string,
  Detail,
>(
  channel: Kind,
  handler: (envelope: TableBridgeEnvelope<Kind, Name, Detail>) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<TableBridgeEnvelope<Kind, Name, Detail>>).detail);
  };
  window.addEventListener(TABLE_BRIDGE_CHANNELS[channel], listener);
  return () => window.removeEventListener(TABLE_BRIDGE_CHANNELS[channel], listener);
}

export function emitHostCommand<Name extends HostCommandName>(
  name: Name,
  ...detail: HostCommandDetailMap[Name] extends undefined ? [] : [HostCommandDetailMap[Name]]
): void {
  emitBridgeEvent('hostCommand', {
    id: createBridgeId('phaser-table', 'react-host', name),
    kind: 'hostCommand',
    name,
    source: 'phaser-table',
    target: 'react-host',
    detail: detail[0] as HostCommandDetailMap[Name],
    createdAt: Date.now(),
  });
}

export function onHostCommand<Name extends HostCommandName>(
  name: Name,
  handler: (detail: HostCommandDetailMap[Name], envelope: HostCommandEnvelope<Name>) => void,
): () => void {
  return onBridgeEvent<'hostCommand', Name, HostCommandDetailMap[Name]>('hostCommand', envelope => {
    if (envelope.name !== name) return;
    handler(envelope.detail, envelope as HostCommandEnvelope<Name>);
  });
}

export function emitTableSnapshot<Name extends TableSnapshotName>(
  name: Name,
  ...detail: TableSnapshotDetailMap[Name] extends undefined ? [] : [TableSnapshotDetailMap[Name]]
): void {
  emitBridgeEvent('tableSnapshot', {
    id: createBridgeId('react-host', 'phaser-table', name),
    kind: 'tableSnapshot',
    name,
    source: 'react-host',
    target: 'phaser-table',
    detail: detail[0] as TableSnapshotDetailMap[Name],
    createdAt: Date.now(),
  });
}

export function onTableSnapshot<Name extends TableSnapshotName>(
  name: Name,
  handler: (detail: TableSnapshotDetailMap[Name], envelope: TableSnapshotEnvelope<Name>) => void,
): () => void {
  return onBridgeEvent<'tableSnapshot', Name, TableSnapshotDetailMap[Name]>('tableSnapshot', envelope => {
    if (envelope.name !== name) return;
    handler(envelope.detail, envelope as TableSnapshotEnvelope<Name>);
  });
}
