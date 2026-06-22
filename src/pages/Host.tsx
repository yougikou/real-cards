import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router-dom';
import { useHost } from '../hooks/useHost';
import PhaserTable from './PhaserTable';
import PhoneHost from './PhoneHost';
import { playShuffleSound } from '../utils/audio/shuffle';
import { useLocale, t } from '../i18n/LocaleProvider';
import dict from '../i18n/translations';
import type { Locale } from '../i18n/LocaleProvider';
import { emitTableSnapshot, onHostCommand } from '../bridge/tableBridge';

const STATUS_STYLES: Record<string, { panel: string; dot: string }> = {
  ready: {
    panel: 'border-emerald-400/30 bg-emerald-950/60 text-emerald-50',
    dot: 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]',
  },
  starting: {
    panel: 'border-sky-400/30 bg-sky-950/60 text-sky-50',
    dot: 'bg-sky-400 animate-pulse shadow-[0_0_14px_rgba(56,189,248,0.55)]',
  },
  reconnecting: {
    panel: 'border-amber-400/30 bg-amber-950/60 text-amber-50',
    dot: 'bg-amber-400 animate-pulse shadow-[0_0_14px_rgba(251,191,36,0.55)]',
  },
  failed: {
    panel: 'border-rose-400/30 bg-rose-950/60 text-rose-50',
    dot: 'bg-rose-400 shadow-[0_0_14px_rgba(248,113,113,0.55)]',
  },
};

const LOCALES: { code: Locale; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
];

type DangerAction = 'clear' | 'reset';

function getStatusStyles(status: keyof typeof STATUS_STYLES) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.starting;
}

export default function Host() {
  const [searchParams] = useSearchParams();
  const [useCompactHost] = useState(shouldUseCompactHostDefault);
  const forcedDesktop = searchParams.get('desktop') === 'true';
  const forcedPhone = searchParams.get('phone') === 'true';

  if ((useCompactHost && !forcedDesktop) || forcedPhone) {
    return <PhoneHost />;
  }

  return <DesktopHost />;
}

function shouldUseCompactHostDefault() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 900 || window.innerHeight < 620;
}

function DesktopHost() {
  const {
    status,
    error,
    retry,
    peerId,
    gameState,
    resetGame,
    clearTableToDiscard,
    assignSeat,
    removeOfflinePlayer,
    approvePendingAction,
    rejectPendingAction,
  } = useHost();
  const { locale, setLocale } = useLocale();

  const joinUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname}#/client/${peerId}`,
    [peerId],
  );

  const statusStyles = getStatusStyles(status);
  const playerCount = Object.keys(gameState.players).length;
  const playStackCount = gameState.playStack.flat().length;
  const [panelOpen, setPanelOpen] = useState(true);
  const [seatAssignmentPlayerId, setSeatAssignmentPlayerId] = useState<string | null>(null);
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null);
  const hostPendingActions = Object.values(gameState.pendingActions).filter(action => action.confirmationMode === 'host');
  const activeHostPendingAction = hostPendingActions[0];

  const statusLabel =
    status === 'ready' ? t(locale, dict, 'host.statusReady') :
    status === 'starting' ? t(locale, dict, 'host.statusStarting') :
    status === 'reconnecting' ? t(locale, dict, 'host.statusReconnecting') :
    t(locale, dict, 'host.statusFailed');

  const latestEvent = gameState.eventLog[gameState.eventLog.length - 1];

  const seatLabel = (seatId?: string) => {
    if (!seatId) return t(locale, dict, 'host.unseated');
    const parts = seatId.split('_');
    return `${t(locale, dict, 'host.seat')} ${parts[1]} ${parts[2]}`;
  };

  const seatAssignmentPlayer = seatAssignmentPlayerId ? gameState.players[seatAssignmentPlayerId] : undefined;
  const activeSeatAssignmentPlayerId = seatAssignmentPlayer ? seatAssignmentPlayerId : null;

  const latestEventText = () => {
    if (!latestEvent) return t(locale, dict, 'event.empty');
    if (latestEvent.type === 'SEAT_ASSIGNED') {
      return `${latestEvent.playerName ?? ''} -> ${seatLabel(latestEvent.seatId)}`;
    }
    if (latestEvent.type === 'PLAYER_REMOVED') {
      return t(locale, dict, 'event.playerRemoved', { player: latestEvent.playerName ?? '', n: String(latestEvent.count ?? 0) });
    }
    return `${latestEvent.type}${latestEvent.playerName ? ` · ${latestEvent.playerName}` : ''}${latestEvent.count ? ` · ${latestEvent.count}` : ''}`;
  };

  const moveText = (move: (typeof gameState.moveLedger)[number]) => {
    const actor = move.actorName || move.targetName || t(locale, dict, 'host.player');
    const cardCount = move.cards.length;
    const undone = move.undone ? ` · ${t(locale, dict, 'host.moveUndone')}` : '';
    return `${move.action} · ${actor} · ${move.from} → ${move.to} · ${cardCount}${undone}`;
  };

  const pendingActionText = () => {
    if (!activeHostPendingAction) return '';
    const requester = activeHostPendingAction.requestedByName ?? t(locale, dict, 'host.player');
    return activeHostPendingAction.type === 'UNDO'
      ? t(locale, dict, 'host.confirmUndoRequest', { name: requester })
      : t(locale, dict, 'host.confirmMoveRequest', { name: requester });
  };

  const dangerActionText = () => {
    if (dangerAction === 'clear') {
      return t(locale, dict, 'host.confirmClearTable', { n: String(playStackCount) });
    }
    if (dangerAction === 'reset') {
      return t(locale, dict, 'host.confirmResetGame');
    }
    return '';
  };

  const confirmDangerAction = () => {
    const action = dangerAction;
    setDangerAction(null);
    if (action === 'clear') {
      clearTableToDiscard();
    } else if (action === 'reset') {
      resetGame();
      playShuffleSound();
    }
  };

  useEffect(() => {
    emitTableSnapshot('players', { players: gameState.players });
  }, [gameState.players]);

  useEffect(() => {
    emitTableSnapshot('deckCount', { count: gameState.deckCount });
  }, [gameState.deckCount]);

  useEffect(() => {
    const topCard = gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1] : null;
    emitTableSnapshot('discardPile', {
      count: gameState.discardPile.length,
      topCard: topCard ? { rank: topCard.rank, suit: topCard.suit } : null,
    });
  }, [gameState.discardPile]);

  useEffect(() => {
    emitTableSnapshot('playStack', { playStack: gameState.playStack });
  }, [gameState.playStack]);

  useEffect(() => {
    emitTableSnapshot('seatAssignmentMode', {
      playerId: activeSeatAssignmentPlayerId,
      playerName: seatAssignmentPlayer?.name,
    });
  }, [activeSeatAssignmentPlayerId, seatAssignmentPlayer?.name]);

  useEffect(() => onHostCommand('assignPlayerToSeat', () => {
    setSeatAssignmentPlayerId(null);
  }), []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 z-0">
        <PhaserTable initialDeckCount={gameState.deckCount} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.14),transparent_35%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.1),transparent_30%),linear-gradient(to_bottom,rgba(2,6,23,0.36),rgba(2,6,23,0.58))]" />

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">

        {activeHostPendingAction && (
          <div className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-amber-300/25 bg-slate-950 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.62)]">
              <div className="text-center">
                <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-amber-200">{t(locale, dict, 'host.tableConfirm')}</div>
                <div className="mb-5 text-base font-black leading-relaxed text-white">{pendingActionText()}</div>
                <div className="flex gap-3">
                  <button
                    onClick={() => rejectPendingAction(activeHostPendingAction.id)}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition-all active:scale-[0.98]"
                  >
                    {t(locale, dict, 'host.reject')}
                  </button>
                  <button
                    onClick={() => approvePendingAction(activeHostPendingAction.id)}
                    className="flex-1 rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 transition-all active:scale-[0.98]"
                  >
                    {t(locale, dict, 'host.approve')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {dangerAction && (
          <div className="pointer-events-auto absolute inset-0 z-[72] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-rose-300/25 bg-slate-950 p-5 text-center shadow-[0_28px_90px_rgba(0,0,0,0.62)]">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-rose-200">{t(locale, dict, 'host.dangerConfirm')}</div>
              <div className="mb-5 text-base font-black leading-relaxed text-white">{dangerActionText()}</div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDangerAction(null)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition-all active:scale-[0.98]"
                >
                  {t(locale, dict, 'client.cancel')}
                </button>
                <button
                  onClick={confirmDangerAction}
                  className="flex-1 rounded-xl bg-rose-400 px-4 py-3 text-sm font-black text-slate-950 transition-all active:scale-[0.98]"
                >
                  {t(locale, dict, 'client.confirmUndo')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Centered modal for host panel (QR code, room info) */}
        {panelOpen && (
          <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md" onClick={() => setPanelOpen(false)}>
            <div className="mx-4 w-full max-w-[32rem] overflow-hidden rounded-[1.75rem] border border-white/20 bg-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.62)] backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label={t(locale, dict, 'host.tableLabel')}
                className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${statusStyles.panel}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${statusStyles.dot}`} />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">{t(locale, dict, 'host.tableLabel')}</div>
                    <div className="text-lg font-semibold text-white">{statusLabel}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/85">
                    {status === 'ready' ? t(locale, dict, 'host.live') : t(locale, dict, 'host.standby')}
                  </div>
                  <span className="text-white/70">✕</span>
                </div>
              </button>

              <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
                {status === 'ready' && peerId ? (
                  <div className="rounded-2xl border border-white/10 bg-white p-2 shadow-lg">
                    <QRCodeSVG value={joinUrl} size={104} />
                  </div>
                ) : (
                  <div className="flex h-[124px] w-[124px] items-center justify-center rounded-2xl border border-white/20 bg-slate-900/90 text-center text-xs font-semibold uppercase tracking-[0.25em] text-white/70">
                    {t(locale, dict, 'host.waitingRoom')}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-sm font-medium text-white/85">
                    {status === 'ready' && peerId
                      ? t(locale, dict, 'host.scanHint')
                      : status === 'failed'
                        ? t(locale, dict, 'host.connectionNeeded')
                        : t(locale, dict, 'host.preparing')}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/95">
                      {t(locale, dict, 'host.room')}: <span className="font-mono text-white">{peerId ? peerId.slice(0, 12) : '—'}</span>
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/95">
                      {t(locale, dict, 'host.players')}: <span className="font-mono text-white">{playerCount}</span>
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/95">
                      {t(locale, dict, 'host.deck')}: <span className="font-mono text-white">{gameState.deckCount}</span>
                    </span>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/20 bg-black/45 px-3 py-2 text-xs font-medium leading-relaxed text-white/80">
                    {status === 'failed' && error ? error : t(locale, dict, 'host.helper')}
                  </div>

                  {playerCount > 0 && (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">{t(locale, dict, 'host.seats')}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                          {gameState.moveLedger.length} {t(locale, dict, 'host.moves')}
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Object.values(gameState.players).map(player => (
                          <div
                            key={player.id}
                            className={`rounded-xl border p-2 transition-colors ${
                              seatAssignmentPlayerId === player.id
                                ? 'border-amber-300/55 bg-amber-400/10'
                                : 'border-white/10 bg-black/30'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-white">{player.name}</div>
                                <div className={`text-[10px] font-semibold ${player.online === false ? 'text-amber-300' : 'text-emerald-300'}`}>
                                  {player.online === false ? t(locale, dict, 'host.offline') : t(locale, dict, 'host.live')} · {player.handCount} {t(locale, dict, 'client.cards')}
                                </div>
                              </div>
                              <div className="shrink-0 text-[10px] font-semibold text-white/45">{seatLabel(player.seatId)}</div>
                            </div>
	                        <div className="grid grid-cols-[1fr_auto] gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSeatAssignmentPlayerId(prev => prev === player.id ? null : player.id);
                                  setPanelOpen(false);
                                }}
                                className={`rounded-lg px-2 py-1.5 text-xs font-black transition-all active:scale-[0.98] ${
                                  seatAssignmentPlayerId === player.id
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'border border-white/10 bg-slate-900 text-white'
                                }`}
                              >
                                {seatAssignmentPlayerId === player.id ? t(locale, dict, 'host.cancelSeatAssign') : t(locale, dict, 'host.assignSeat')}
                              </button>
	                              <button
	                                type="button"
	                                onClick={() => {
	                                  assignSeat(player.id, undefined);
	                                  if (seatAssignmentPlayerId === player.id) setSeatAssignmentPlayerId(null);
                                }}
                                disabled={!player.seatId}
                                className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs font-black text-white transition-all active:scale-[0.98] disabled:opacity-35"
                              >
	                                {t(locale, dict, 'host.releaseSeat')}
	                              </button>
	                            </div>
                              {player.online === false && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    removeOfflinePlayer(player.id);
                                    if (seatAssignmentPlayerId === player.id) setSeatAssignmentPlayerId(null);
                                  }}
                                  className="mt-2 w-full rounded-lg border border-rose-300/20 bg-rose-400/15 px-2 py-1.5 text-xs font-black text-rose-100 transition-all active:scale-[0.98]"
                                >
                                  {t(locale, dict, 'host.kickOffline')}
                                </button>
                              )}
	                          </div>
	                        ))}
	                      </div>
                      {seatAssignmentPlayer && (
                        <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-100">
                          {t(locale, dict, 'host.seatAssignHint', { name: seatAssignmentPlayer.name })}
	                        </div>
	                      )}
                      {gameState.moveLedger.length > 0 && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">{t(locale, dict, 'host.ledgerTimeline')}</div>
                          <div className="grid max-h-32 gap-1 overflow-y-auto pr-1">
                            {gameState.moveLedger.slice(-6).reverse().map(move => (
                              <div key={move.id} className="truncate rounded-lg bg-white/[0.04] px-2 py-1.5 font-mono text-[10px] text-white/65">
                                {moveText(move)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
	                    </div>
	                  )}
                </div>
              </div>

              {status !== 'ready' && (
                <div className="border-t border-white/10 px-4 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); retry(); }}
                    className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 active:scale-95"
                  >
                    {t(locale, dict, 'host.retry')}
                  </button>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-3">
                {LOCALES.map(({ code, label }) => (
                  <button
                    key={code}
                    onClick={(e) => { e.stopPropagation(); setLocale(code); }}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      locale === code
                        ? 'border border-white/20 bg-white/20 text-white'
                        : 'border border-white/10 bg-white/10 text-white/75 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="relative flex flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-[32rem] w-[32rem] max-w-[82vw] -translate-y-1/2 rounded-full bg-emerald-400/10 blur-3xl" />

          {/* Host ready button - top left corner gap */}
          {!panelOpen && (
            <div className="pointer-events-auto absolute left-2 top-2 z-10 flex h-14 w-14 items-center justify-center">
              <button
                onClick={() => setPanelOpen(true)}
                aria-label={t(locale, dict, 'host.tableLabel')}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-slate-950/85 shadow-[0_8px_32px_rgba(0,0,0,0.58)] backdrop-blur-xl transition-transform hover:scale-110 active:scale-95"
              >
                <span className={`block h-2.5 w-2.5 rounded-full ${statusStyles.dot}`} />
              </button>
            </div>
          )}

          {/* Player count - top right corner gap */}
          <div className="pointer-events-auto absolute right-2 top-2 z-10 flex min-w-16 flex-col items-center justify-center gap-0 rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/70">{t(locale, dict, 'host.players')}</span>
            <span className="text-xl font-bold text-white">{playerCount}</span>
          </div>

          <div className="pointer-events-auto absolute left-1/2 top-2 z-10 w-[min(28rem,calc(100vw-8rem))] -translate-x-1/2 rounded-lg border border-white/15 bg-slate-950/80 px-3 py-2 text-center shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{t(locale, dict, 'host.latestMove')}</div>
            <div className="truncate text-xs font-semibold text-white/85">{latestEventText()}</div>
          </div>

          {seatAssignmentPlayer && (
            <div className="pointer-events-auto absolute left-1/2 top-20 z-10 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-300/35 bg-amber-400 px-4 py-3 text-center text-sm font-black text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.34)]">
              {t(locale, dict, 'host.tapSeatForPlayer', { name: seatAssignmentPlayer.name })}
            </div>
          )}


{/* Clear play stack - below center area */}
          {playStackCount > 0 && (
            <div className="pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2" style={{ bottom: '22%' }}>
              <button
                onClick={() => setDangerAction('clear')}
                className="rounded-lg border border-rose-200/35 bg-rose-950/90 px-3 py-2 text-xs font-bold text-rose-100 shadow-[0_8px_24px_rgba(0,0,0,0.48)] transition-all hover:bg-rose-900 active:scale-95"
              >
                {t(locale, dict, 'tableConfig.playStackAction')}
              </button>
            </div>
          )}

          {/* Reset shuffle - bottom left corner gap */}
          <div className="pointer-events-auto absolute bottom-2 left-2 z-10 flex h-14 w-14 items-center justify-center">
            <button
              onClick={() => setDangerAction('reset')}
              aria-label={t(locale, dict, 'host.resetShuffle')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-200/40 bg-gradient-to-b from-rose-950 to-red-900 text-base font-bold text-white shadow-[0_8px_30px_rgba(0,0,0,0.48)] transition-transform hover:from-rose-900 hover:to-red-800 active:scale-95"
            >
              ↺
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
