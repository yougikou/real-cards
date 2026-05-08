import { useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import PhaserTable from './PhaserTable';
import { playShuffleSound } from '../utils/audio/shuffle';
import { DEFAULT_SANDBOX_PACK } from '../config/tableConfig';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
  none: '🃏',
};

const STATUS_STYLES: Record<string, { panel: string; dot: string; label: string }> = {
  ready: {
    panel: 'border-emerald-400/30 bg-emerald-950/60 text-emerald-50',
    dot: 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]',
    label: 'Host Ready',
  },
  starting: {
    panel: 'border-sky-400/30 bg-sky-950/60 text-sky-50',
    dot: 'bg-sky-400 animate-pulse shadow-[0_0_14px_rgba(56,189,248,0.55)]',
    label: 'Starting Host',
  },
  reconnecting: {
    panel: 'border-amber-400/30 bg-amber-950/60 text-amber-50',
    dot: 'bg-amber-400 animate-pulse shadow-[0_0_14px_rgba(251,191,36,0.55)]',
    label: 'Reconnecting',
  },
  failed: {
    panel: 'border-rose-400/30 bg-rose-950/60 text-rose-50',
    dot: 'bg-rose-400 shadow-[0_0_14px_rgba(248,113,113,0.55)]',
    label: 'Connection Failed',
  },
};

function getStatusStyles(status: keyof typeof STATUS_STYLES) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.starting;
}

function SuitGlyph({ suit }: { suit: string }) {
  return <>{SUIT_SYMBOLS[suit] ?? '🃏'}</>;
}

export default function Host() {
  const { status, error, retry, peerId, gameState, resetGame } = useHost();

  const joinUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname}#/client/${peerId}`,
    [peerId],
  );

  const statusStyles = getStatusStyles(status);
  const playerCount = Object.keys(gameState.players).length;
  const stackCardCount = gameState.playStack.reduce((acc, batch) => acc + batch.length, 0);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('players-updated', { detail: { players: gameState.players } }));
  }, [gameState.players]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 z-0">
        <PhaserTable />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.08),transparent_30%),linear-gradient(to_bottom,rgba(2,6,23,0.1),rgba(2,6,23,0.3))]" />

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
        <header className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
          <div className="pointer-events-auto w-full max-w-[32rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/55 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${statusStyles.panel}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${statusStyles.dot}`} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45">Host Table</div>
                  <div className="text-lg font-semibold text-white">{statusStyles.label}</div>
                </div>
              </div>

              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.3em] text-white/60">
                {status === 'ready' ? 'Live session' : 'Standby'}
              </div>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
              {status === 'ready' && peerId ? (
                <div className="rounded-2xl border border-white/10 bg-white p-2 shadow-lg">
                  <QRCodeSVG value={joinUrl} size={104} />
                </div>
              ) : (
                <div className="flex h-[124px] w-[124px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-center text-xs font-medium uppercase tracking-[0.25em] text-white/35">
                  Waiting
                  <br />
                  for room
                </div>
              )}

              <div className="min-w-0">
                <div className="text-sm font-medium text-white/65">
                  {status === 'ready' && peerId
                    ? 'Scan to join from a phone or another device.'
                    : status === 'failed'
                      ? 'Connection needs attention before the table is available.'
                      : 'Preparing the host room and signaling connection.'}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85">
                    Room: <span className="font-mono text-white">{peerId ? peerId.slice(0, 12) : '—'}</span>
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85">
                    Players: <span className="font-mono text-white">{playerCount}</span>
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85">
                    Deck: <span className="font-mono text-white">{gameState.deckCount}</span>
                  </span>
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed text-white/65">
                  {status === 'failed' && error ? error : 'Drag cards directly on the table. Use the stack only when you need to reshuffle, recenter, or recover a batch.'}
                </div>
              </div>
            </div>

            {status !== 'ready' && (
              <div className="border-t border-white/10 px-4 py-3">
                <button
                  onClick={retry}
                  className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 active:scale-95"
                >
                  Retry Connection
                </button>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex flex-wrap gap-3 md:justify-end">
            <div className="flex min-w-[8.5rem] flex-col rounded-[1.35rem] border border-white/10 bg-slate-950/55 px-4 py-3 shadow-[0_20px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl">
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">Players</span>
              <span className="mt-2 text-3xl font-semibold text-white">{playerCount}</span>
              <span className="text-xs text-white/50">Connected seats</span>
            </div>

            <div className="flex min-w-[8.5rem] flex-col rounded-[1.35rem] border border-white/10 bg-slate-950/55 px-4 py-3 shadow-[0_20px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl">
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">Deck</span>
              <span className="mt-2 text-3xl font-semibold text-white">{gameState.deckCount}</span>
              <span className="text-xs text-white/50">Cards remaining</span>
            </div>

            <div className="flex min-w-[8.5rem] flex-col rounded-[1.35rem] border border-white/10 bg-slate-950/55 px-4 py-3 shadow-[0_20px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl">
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">Discard</span>
              <span className="mt-2 text-3xl font-semibold text-white">{gameState.discardPile.length}</span>
              <span className="text-xs text-white/50">In the discard pile</span>
            </div>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center px-4 pb-28 pt-4 md:pb-24">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-[32rem] w-[32rem] max-w-[82vw] -translate-y-1/2 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative flex h-72 w-72 items-center justify-center md:h-80 md:w-80">
            <div className="pointer-events-none absolute inset-0 rounded-full border border-emerald-300/10 bg-emerald-950/10 shadow-[0_0_100px_rgba(16,185,129,0.15)]" />
            <div className="pointer-events-none absolute inset-6 rounded-full border border-white/5" />

            {gameState.playStack.map((batch, batchIndex) => {
              const offsetX = batchIndex * 10;
              const offsetY = batchIndex * -10;
              const rotation = (batchIndex % 3 - 1) * 5;
              const isTopBatch = batchIndex === gameState.playStack.length - 1;

              return (
                <div
                  key={batchIndex}
                  className={`absolute transition-all duration-300 ${isTopBatch ? 'z-20' : 'opacity-80'}`}
                  style={{
                    transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
                    zIndex: isTopBatch ? 100 : batchIndex,
                  }}
                >
                  {isTopBatch && (
                    <div className="absolute -top-14 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
                      <div className="rounded-full border border-amber-200/30 bg-amber-300 px-3 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-black shadow-lg">
                        Latest Batch
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('host-return-batch', { detail: { toTop: true } }));
                          }}
                          className="rounded-full border border-sky-300/40 bg-sky-500/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-lg transition-colors hover:bg-sky-400 active:scale-95"
                        >
                          Return to Deck Top
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('host-return-batch', { detail: { toTop: false } }));
                          }}
                          className="rounded-full border border-white/15 bg-slate-700/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-lg transition-colors hover:bg-slate-600 active:scale-95"
                        >
                          Return to Deck Bottom
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex -space-x-12">
                    {batch.map((card, cardIndex) => {
                      const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-slate-950';
                      return (
                        <div
                          key={card.id}
                          className="relative flex h-36 w-24 cursor-pointer flex-col justify-between rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_30px_rgba(15,23,42,0.25)] transition-transform hover:-translate-y-2 hover:shadow-[0_24px_45px_rgba(15,23,42,0.3)]"
                          style={{ zIndex: cardIndex }}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('host-drag-public-card', {
                              detail: {
                                cardData: card,
                                x: e.clientX,
                                y: e.clientY,
                                pointerId: e.pointerId,
                              },
                            }));
                          }}
                        >
                          <div className={`text-sm font-bold ${color}`}>{card.rank}</div>
                          <div className={`text-2xl self-center ${color}`}>
                            <SuitGlyph suit={card.suit} />
                          </div>
                          <div className={`text-sm font-bold rotate-180 ${color}`}>{card.rank}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {gameState.playStack.length === 0 && (
              <div className="rounded-[1.75rem] border border-dashed border-emerald-300/20 bg-black/20 px-10 py-12 text-center text-emerald-100/60 shadow-[0_18px_45px_rgba(2,6,23,0.25)] backdrop-blur-sm">
                <div className="text-2xl font-semibold uppercase tracking-[0.35em] text-emerald-200/55">
                  {DEFAULT_SANDBOX_PACK.containers.playStack.emptyText}
                </div>
                <div
                  className="mt-3 text-sm leading-relaxed text-emerald-100/30"
                  dangerouslySetInnerHTML={{ __html: DEFAULT_SANDBOX_PACK.containers.playStack.emptySubText || '' }}
                />
              </div>
            )}

            <div className="absolute -bottom-20 flex flex-col items-center text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.38em] text-white/45">
                {DEFAULT_SANDBOX_PACK.containers.playStack.label}
              </div>
              <div className="mt-2 text-xs text-white/45">
                {stackCardCount} cards in stack
              </div>
              {gameState.playStack.length > 0 ? (
                <button
                  onClick={() => {
                    window.dispatchEvent(new Event('host-clear-table'));
                    playShuffleSound();
                  }}
                  className="pointer-events-auto mt-4 rounded-full border border-amber-200/30 bg-gradient-to-b from-amber-300 to-amber-500 px-6 py-2 text-sm font-extrabold uppercase tracking-[0.18em] text-black shadow-[0_0_24px_rgba(245,158,11,0.28)] transition-transform hover:from-amber-200 hover:to-amber-400 active:scale-95"
                >
                  {DEFAULT_SANDBOX_PACK.containers.playStack.actionButtonText}
                </button>
              ) : (
                <div className="pointer-events-auto mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                  {DEFAULT_SANDBOX_PACK.containers.playStack.disabledButtonText}
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-auto absolute right-4 top-4 flex flex-col gap-4">
            {DEFAULT_SANDBOX_PACK.layoutOrder.map((containerId) => {
              if (containerId === 'discardPile') {
                return (
                  <div
                    key="discardPile"
                    className={`flex h-48 w-32 flex-col items-center justify-center rounded-[1.5rem] border shadow-[0_20px_55px_rgba(2,6,23,0.35)] backdrop-blur-xl transition-opacity ${gameState.discardPile.length > 0 ? 'border-white/10 bg-slate-950/70 opacity-100' : 'border-white/10 bg-slate-950/55 opacity-70'}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45">{DEFAULT_SANDBOX_PACK.containers.discardPile.label}</div>
                    <div className="mt-2 text-4xl font-semibold text-white">{gameState.discardPile.length}</div>

                    {gameState.discardPile.length > 0 ? (
                      <div className="mt-4 flex h-20 w-16 flex-col items-center justify-center rounded-lg bg-white p-1 shadow-md rotate-6">
                        <span className={`text-sm font-bold ${gameState.discardPile[gameState.discardPile.length - 1].suit === 'hearts' || gameState.discardPile[gameState.discardPile.length - 1].suit === 'diamonds' ? 'text-red-600' : 'text-slate-950'}`}>
                          {gameState.discardPile[gameState.discardPile.length - 1].rank}
                        </span>
                        <span className={`text-xl ${gameState.discardPile[gameState.discardPile.length - 1].suit === 'hearts' || gameState.discardPile[gameState.discardPile.length - 1].suit === 'diamonds' ? 'text-red-600' : 'text-slate-950'}`}>
                          <SuitGlyph suit={gameState.discardPile[gameState.discardPile.length - 1].suit} />
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 text-xs font-medium text-white/40">{DEFAULT_SANDBOX_PACK.containers.discardPile.emptyText}</div>
                    )}
                  </div>
                );
              }

              if (containerId === 'deck') {
                return (
                  <div
                    key="deck"
                    className={`flex h-48 w-32 flex-col items-center justify-center rounded-[1.5rem] border shadow-[0_20px_55px_rgba(2,6,23,0.35)] ring-1 ring-blue-400/20 transition-colors ${gameState.deckCount > 0 ? 'border-blue-300/40 bg-gradient-to-b from-blue-950/90 to-sky-950/80' : 'border-white/10 bg-slate-950/55 opacity-70'}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/55">{DEFAULT_SANDBOX_PACK.containers.deck.label}</div>
                    <div className="mt-2 text-4xl font-semibold text-white">{gameState.deckCount}</div>
                  </div>
                );
              }

              return null;
            })}

            <button
              onClick={() => {
                resetGame();
                playShuffleSound();
              }}
              className="flex h-48 w-32 flex-col items-center justify-center rounded-[1.5rem] border border-rose-300/30 bg-gradient-to-b from-rose-950/85 to-red-900/80 text-white shadow-[0_20px_55px_rgba(2,6,23,0.35)] transition-transform hover:from-rose-900 hover:to-red-800 active:scale-95"
            >
              <div className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-white/95 px-3">
                Reset & Shuffle
              </div>
              <div className="mt-3 text-2xl">↺</div>
            </button>
          </div>

          <footer className="pointer-events-auto absolute bottom-4 left-4 right-4 flex flex-col gap-3 rounded-[1.4rem] border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white/85 shadow-[0_20px_60px_rgba(2,6,23,0.38)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-200">
                🃏 Drag center cards to deal
              </span>
              <span className="text-white/45">Pan with drag, zoom with wheel</span>
            </div>

            <button
              onClick={() => window.dispatchEvent(new Event('table-recenter'))}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/10 px-4 py-2 font-medium text-white transition-colors hover:bg-white/15 active:scale-95"
            >
              Recenter View
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
