import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import PhaserTable from './PhaserTable';
import { playShuffleSound } from '../utils/audio/shuffle';
import { useLocale, t } from '../i18n/LocaleProvider';
import dict from '../i18n/translations';
import type { Locale } from '../i18n/LocaleProvider';
import { TABLE_EVENTS, emitTableEvent } from '../bridge/tableBridge';

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

function getStatusStyles(status: keyof typeof STATUS_STYLES) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.starting;
}

export default function Host() {
  const { status, error, retry, peerId, gameState, resetGame } = useHost();
  const { locale, setLocale } = useLocale();

  const joinUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname}#/client/${peerId}`,
    [peerId],
  );

  const statusStyles = getStatusStyles(status);
  const playerCount = Object.keys(gameState.players).length;
  const [panelOpen, setPanelOpen] = useState(true);

  const statusLabel =
    status === 'ready' ? t(locale, dict, 'host.statusReady') :
    status === 'starting' ? t(locale, dict, 'host.statusStarting') :
    status === 'reconnecting' ? t(locale, dict, 'host.statusReconnecting') :
    t(locale, dict, 'host.statusFailed');

  useEffect(() => {
    emitTableEvent(TABLE_EVENTS.playersUpdated, { players: gameState.players });
  }, [gameState.players]);

  useEffect(() => {
    emitTableEvent(TABLE_EVENTS.deckCountUpdated, { count: gameState.deckCount });
  }, [gameState.deckCount]);

  useEffect(() => {
    const topCard = gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1] : null;
    emitTableEvent(TABLE_EVENTS.discardCountUpdated, {
      count: gameState.discardPile.length,
      topCard: topCard ? { rank: topCard.rank, suit: topCard.suit } : null,
    });
  }, [gameState.discardPile]);

  useEffect(() => {
    emitTableEvent(TABLE_EVENTS.playStackUpdated, { playStack: gameState.playStack });
  }, [gameState.playStack]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 z-0">
        <PhaserTable initialDeckCount={gameState.deckCount} />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.08),transparent_30%),linear-gradient(to_bottom,rgba(2,6,23,0.1),rgba(2,6,23,0.3))]" />

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">

        {/* Centered modal for host panel (QR code, room info) */}
        {panelOpen && (
          <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPanelOpen(false)}>
            <div className="mx-4 w-full max-w-[32rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPanelOpen(false)}
                className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${statusStyles.panel}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${statusStyles.dot}`} />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45">{t(locale, dict, 'host.tableLabel')}</div>
                    <div className="text-lg font-semibold text-white">{statusLabel}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.3em] text-white/60">
                    {status === 'ready' ? t(locale, dict, 'host.live') : t(locale, dict, 'host.standby')}
                  </div>
                  <span className="text-white/40">✕</span>
                </div>
              </button>

              <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
                {status === 'ready' && peerId ? (
                  <div className="rounded-2xl border border-white/10 bg-white p-2 shadow-lg">
                    <QRCodeSVG value={joinUrl} size={104} />
                  </div>
                ) : (
                  <div className="flex h-[124px] w-[124px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-center text-xs font-medium uppercase tracking-[0.25em] text-white/35">
                    {t(locale, dict, 'host.waitingRoom')}
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-sm font-medium text-white/65">
                    {status === 'ready' && peerId
                      ? t(locale, dict, 'host.scanHint')
                      : status === 'failed'
                        ? t(locale, dict, 'host.connectionNeeded')
                        : t(locale, dict, 'host.preparing')}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85">
                      {t(locale, dict, 'host.room')}: <span className="font-mono text-white">{peerId ? peerId.slice(0, 12) : '—'}</span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85">
                      {t(locale, dict, 'host.players')}: <span className="font-mono text-white">{playerCount}</span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85">
                      {t(locale, dict, 'host.deck')}: <span className="font-mono text-white">{gameState.deckCount}</span>
                    </span>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-relaxed text-white/65">
                    {status === 'failed' && error ? error : t(locale, dict, 'host.helper')}
                  </div>
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
                        ? 'bg-white/20 text-white'
                        : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
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
            <div className="pointer-events-auto absolute left-0 top-0 z-10 flex h-14 w-14 items-center justify-center">
              <button
                onClick={() => setPanelOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 shadow-[0_8px_32px_rgba(2,6,23,0.5)] backdrop-blur-xl transition-transform hover:scale-110 active:scale-95"
              >
                <span className={`block h-2.5 w-2.5 rounded-full ${statusStyles.dot}`} />
              </button>
            </div>
          )}

          {/* Player count - top right corner gap */}
          <div className="pointer-events-auto absolute right-0 top-0 z-10 flex h-14 w-14 flex-col items-center justify-center gap-0">
            <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/45">{t(locale, dict, 'host.players')}</span>
            <span className="text-lg font-semibold text-white/90">{playerCount}</span>
          </div>


{/* Clear play stack - below center area */}
          {gameState.playStack.flat().length > 0 && (
            <div className="pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2" style={{ bottom: '22%' }}>
              <button
                onClick={() => emitTableEvent(TABLE_EVENTS.hostClearTable)}
                className="rounded-lg border border-rose-300/20 bg-rose-950/70 px-2.5 py-1.5 text-[11px] font-bold text-rose-200/90 shadow-[0_4px_16px_rgba(2,6,23,0.4)] transition-all hover:bg-rose-900/70 active:scale-95"
              >
                {t(locale, dict, 'tableConfig.playStackAction')}
              </button>
            </div>
          )}

          {/* Reset shuffle - bottom left corner gap */}
          <div className="pointer-events-auto absolute bottom-0 left-0 z-10 flex h-14 w-14 items-center justify-center">
            <button
              onClick={() => { resetGame(); playShuffleSound(); }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/30 bg-gradient-to-b from-rose-950/85 to-red-900/80 text-sm shadow-[0_8px_30px_rgba(2,6,23,0.35)] transition-transform hover:from-rose-900 hover:to-red-800 active:scale-95"
            >
              ↺
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
