import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSearchParams } from 'react-router-dom';
import { useHost } from '../hooks/useHost';
import { ConnectedClient } from './Client';
import { playShuffleSound } from '../utils/audio/shuffle';
import { useLocale, t } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/LocaleProvider';
import dict from '../i18n/translations';

type DangerAction = 'clear' | 'reset';

function getStatusLabel(locale: Locale, status: string) {
  if (status === 'ready') return t(locale, dict, 'host.statusReady');
  if (status === 'starting') return t(locale, dict, 'host.statusStarting');
  if (status === 'reconnecting') return t(locale, dict, 'host.statusReconnecting');
  return t(locale, dict, 'host.statusFailed');
}

export default function PhoneHost() {
  const {
    status,
    error,
    retry,
    peerId,
    gameState,
    resetGame,
    clearTableToDiscard,
    dealCardsToPlayer,
    assignSeat,
    approvePendingAction,
    rejectPendingAction,
    seatIds,
  } = useHost();
  const { locale } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftName, setDraftName] = useState(searchParams.get('name') || '');
  const [panelOpen, setPanelOpen] = useState(false);
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null);
  const [seatPlayerId, setSeatPlayerId] = useState<string | null>(null);

  const playerName = searchParams.get('name') || '';
  const joinUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname}#/client/${peerId}`,
    [peerId],
  );
  const hostPendingActions = Object.values(gameState.pendingActions).filter(action => action.confirmationMode === 'host');
  const activeHostPendingAction = hostPendingActions[0];
  const playStackCount = gameState.playStack.flat().length;
  const selectedSeatPlayer = seatPlayerId ? gameState.players[seatPlayerId] : undefined;

  const seatLabel = (seatId?: string) => {
    if (!seatId) return t(locale, dict, 'host.unseated');
    const parts = seatId.split('_');
    return `${t(locale, dict, 'host.seat')} ${parts[1]} ${parts[2]}`;
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

  const confirmName = () => {
    const cleanName = draftName.trim();
    if (!cleanName) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('phone', 'true');
      next.set('name', cleanName);
      return next;
    });
  };

  if (!playerName) {
    return (
      <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#020617_70%)] p-5 text-white">
        <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-sm flex-col justify-center">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="mb-2 text-xs font-black uppercase tracking-[0.24em] text-emerald-200">{t(locale, dict, 'phoneHost.mode')}</div>
            <div className="mb-5 text-2xl font-black text-white">{t(locale, dict, 'phoneHost.nameTitle')}</div>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmName();
              }}
              placeholder={t(locale, dict, 'home.yourName')}
              className="mb-4 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-center text-base font-bold text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-emerald-400/60"
              autoFocus
            />
            <button
              onClick={confirmName}
              disabled={!draftName.trim()}
              className="w-full rounded-2xl bg-emerald-400 py-3 font-black text-slate-950 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {t(locale, dict, 'phoneHost.startAsPlayer')}
            </button>
          </div>

          <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-4 text-center">
            <div className="text-sm font-black text-white">{getStatusLabel(locale, status)}</div>
            <div className="mt-1 text-xs text-white/50">
              {status === 'failed' && error ? error : `${t(locale, dict, 'host.room')}: ${peerId ? peerId.slice(0, 12) : '...'}`}
            </div>
            {status === 'failed' && (
              <button onClick={retry} className="mt-3 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white">
                {t(locale, dict, 'host.retry')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-[#07111f]">
      {status === 'ready' && peerId ? (
        <ConnectedClient hostId={peerId} playerName={playerName} isPreview={false} />
      ) : (
        <div className="flex h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#020617_70%)] p-5 text-center text-white">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="text-xl font-black">{getStatusLabel(locale, status)}</div>
            <div className="mt-2 text-sm text-white/55">{status === 'failed' && error ? error : t(locale, dict, 'host.preparing')}</div>
            {status === 'failed' && (
              <button onClick={retry} className="mt-4 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950">
                {t(locale, dict, 'host.retry')}
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="absolute right-3 top-3 z-[70] rounded-full border border-emerald-300/25 bg-slate-950/85 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 shadow-[0_12px_34px_rgba(0,0,0,0.45)] backdrop-blur"
      >
        {t(locale, dict, 'phoneHost.hostControls')}
      </button>

      {activeHostPendingAction && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-amber-300/25 bg-slate-950 p-5 shadow-2xl">
            <div className="mb-2 text-center text-xs font-black uppercase tracking-[0.22em] text-amber-200">{t(locale, dict, 'host.tableConfirm')}</div>
            <div className="mb-5 text-center text-base font-black leading-relaxed text-white">{pendingActionText()}</div>
            <div className="flex gap-3">
              <button onClick={() => rejectPendingAction(activeHostPendingAction.id)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white">
                {t(locale, dict, 'host.reject')}
              </button>
              <button onClick={() => approvePendingAction(activeHostPendingAction.id)} className="flex-1 rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950">
                {t(locale, dict, 'host.approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="absolute inset-0 z-[75] bg-black/60 backdrop-blur-sm" onClick={() => setPanelOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-y-auto rounded-t-[1.5rem] border-t border-white/10 bg-slate-950 p-4 text-white shadow-[0_-18px_70px_rgba(0,0,0,0.55)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">{t(locale, dict, 'phoneHost.mode')}</div>
                <div className="text-lg font-black">{t(locale, dict, 'phoneHost.hostControls')}</div>
              </div>
              <button onClick={() => setPanelOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-white/70">
                {t(locale, dict, 'event.close')}
              </button>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center gap-3">
                  {status === 'ready' && peerId ? (
                    <div className="rounded-xl bg-white p-2"><QRCodeSVG value={joinUrl} size={92} /></div>
                  ) : (
                    <div className="flex h-[108px] w-[108px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                      {t(locale, dict, 'host.waitingRoom')}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white">{getStatusLabel(locale, status)}</div>
                    <div className="mt-1 break-all font-mono text-xs text-white/65">{peerId || '...'}</div>
                    <div className="mt-2 text-xs text-white/45">{t(locale, dict, 'phoneHost.shareHint')}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{t(locale, dict, 'host.players')}</div>
                  <div className="text-xl font-black">{Object.keys(gameState.players).length}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{t(locale, dict, 'host.deck')}</div>
                  <div className="text-xl font-black">{gameState.deckCount}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{t(locale, dict, 'client.playStack')}</div>
                  <div className="text-xl font-black">{playStackCount}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDangerAction('clear')}
                  disabled={playStackCount === 0}
                  className="rounded-xl border border-rose-300/20 bg-rose-400/15 px-3 py-3 text-sm font-black text-rose-100 disabled:opacity-35"
                >
                  {t(locale, dict, 'tableConfig.playStackAction')}
                </button>
                <button
                  onClick={() => setDangerAction('reset')}
                  className="rounded-xl border border-amber-300/20 bg-amber-400/15 px-3 py-3 text-sm font-black text-amber-100"
                >
                  {t(locale, dict, 'host.resetShuffle')}
                </button>
              </div>

              {Object.values(gameState.players).length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">{t(locale, dict, 'host.players')}</div>
                  <div className="grid gap-2">
                    {Object.values(gameState.players).map(player => (
                      <div key={player.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-2">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-white">{player.name}</div>
                            <div className="text-[10px] font-semibold text-white/45">{seatLabel(player.seatId)} · {player.handCount} {t(locale, dict, 'client.cards')}</div>
                          </div>
                          <button
                            onClick={() => dealCardsToPlayer(player.id, 1)}
                            disabled={gameState.deckCount === 0}
                            className="rounded-lg bg-emerald-400 px-2.5 py-1.5 text-[10px] font-black text-slate-950 disabled:opacity-35"
                          >
                            {t(locale, dict, 'phoneHost.dealOne')}
                          </button>
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <button
                            onClick={() => setSeatPlayerId(prev => prev === player.id ? null : player.id)}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-black text-white"
                          >
                            {selectedSeatPlayer?.id === player.id ? t(locale, dict, 'host.cancelSeatAssign') : t(locale, dict, 'host.assignSeat')}
                          </button>
                          <button
                            onClick={() => assignSeat(player.id, undefined)}
                            disabled={!player.seatId}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-black text-white disabled:opacity-35"
                          >
                            {t(locale, dict, 'host.releaseSeat')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedSeatPlayer && (
                <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3">
                  <div className="mb-2 text-xs font-black text-amber-100">{t(locale, dict, 'phoneHost.chooseSeat', { name: selectedSeatPlayer.name })}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {seatIds.map(seatId => (
                      <button
                        key={seatId}
                        onClick={() => {
                          assignSeat(selectedSeatPlayer.id, seatId);
                          setSeatPlayerId(null);
                        }}
                        className="rounded-lg border border-amber-300/20 bg-slate-900 px-2 py-2 text-xs font-black text-amber-100"
                      >
                        {seatLabel(seatId)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {dangerAction && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-amber-300/20 bg-slate-950 p-5 text-center text-white">
            <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-rose-200">{t(locale, dict, 'host.dangerConfirm')}</div>
            <div className="mb-5 text-base font-black">{dangerActionText()}</div>
            <div className="flex gap-3">
              <button onClick={() => setDangerAction(null)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black">
                {t(locale, dict, 'client.cancel')}
              </button>
              <button
                onClick={confirmDangerAction}
                className="flex-1 rounded-xl bg-rose-400 px-4 py-3 text-sm font-black text-slate-950"
              >
                {t(locale, dict, 'client.confirmUndo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
