import { useEffect, useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, X, ExternalLink, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchTransactionDetail } from '../api/mempool';
import type { TransactionDetail as TransactionDetailType } from '../api/types';

const MEMPOOL_TX_URL = 'https://mempool.space/tx';

function formatBtc(sats: number): string {
  const btc = sats / 1e8;
  if (btc >= 1) return btc.toFixed(4);
  if (btc >= 0.0001) return btc.toFixed(6);
  return btc.toFixed(8);
}

function formatTimeAgo(timestamp: number): string {
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (sec < 60) return `${sec} second${sec !== 1 ? 's' : ''} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min !== 1 ? 's' : ''} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

function truncate(str: string, head = 8, tail = 8): string {
  if (str.length <= head + tail) return str;
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
}

function deriveFeatures(tx: TransactionDetailType): string[] {
  const features: string[] = [];
  const hasWitness = tx.vin.some((v) => v.witness && v.witness.length > 0);
  if (hasWitness) features.push('SegWit');
  const hasRbf = tx.vin.some((v) => v.sequence != null && v.sequence < 0xfffffffe);
  if (hasRbf) features.push('RBF');
  const hasTaproot = tx.vout.some(
    (o) => o.scriptpubkey_type && (o.scriptpubkey_type.includes('p2tr') || o.scriptpubkey_type.includes('v1'))
  );
  if (hasTaproot) features.push('Taproot');
  const hasOpReturn = tx.vout.some(
    (o) => o.scriptpubkey_type && o.scriptpubkey_type.toLowerCase() === 'op_return'
  );
  if (hasOpReturn) features.push('OP_RETURN');
  return features;
}

interface TransactionDetailModalProps {
  txid: string | null;
  onClose: () => void;
}

export function TransactionDetailModal({ txid, onClose }: TransactionDetailModalProps) {
  const {
    data: tx,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['transactionDetail', txid],
    queryFn: () => fetchTransactionDetail(txid!),
    enabled: !!txid,
    refetchInterval: (query) => {
      const data = query.state.data as TransactionDetailType | undefined;
      if (!data?.status?.confirmed) return 15_000;
      return false;
    },
  });

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!txid) return;
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [txid, handleEscape]);

  useEffect(() => {
    setShowFullHex(false);
    setExpandedInputs(new Set());
    setExpandedOutputs(new Set());
  }, [txid]);

  const [showFullHex, setShowFullHex] = useState(false);
  const [expandedInputs, setExpandedInputs] = useState<Set<number>>(new Set());
  const [expandedOutputs, setExpandedOutputs] = useState<Set<number>>(new Set());

  const toggleInput = (i: number) => {
    setExpandedInputs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const toggleOutput = (i: number) => {
    setExpandedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (!txid) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl min-w-0 flex-col rounded-lg border border-mempool-border bg-mempool-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-mempool-border px-4 py-3">
          <h2 id="transaction-modal-title" className="text-sm font-semibold text-white">
            Transaction
          </h2>
          <div className="flex items-center gap-2">
            <a
              href={`${MEMPOOL_TX_URL}/${txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-gray-400 hover:bg-mempool-border hover:text-white"
              aria-label="View on mempool.space"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-mempool-border hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-mempool-accent border-t-transparent" />
            </div>
          )}

          {isError && (
            <div className="py-6 text-center">
              <p className="text-red-400">
                {error instanceof Error ? error.message : 'Failed to load transaction'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-2 rounded bg-mempool-border px-3 py-1.5 text-sm text-gray-200 hover:bg-mempool-accent"
              >
                Retry
              </button>
            </div>
          )}

          {tx && (
            <>
              {/* Header: txid + copy + status */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <code className="break-all text-xs text-gray-300">{tx.txid}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(tx.txid)}
                  className="rounded p-1 text-gray-400 hover:bg-mempool-border hover:text-white"
                  aria-label="Copy txid"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    tx.status?.confirmed ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {tx.status?.confirmed ? 'Confirmed' : 'Unconfirmed'}
                </span>
              </div>

              {/* Summary: first seen, ETA, features, fee, fee rate */}
              <div className="mb-4 min-w-0 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  {tx.firstSeen != null && (
                    <p className="text-sm text-gray-400">
                      First seen: <span className="text-white">{formatTimeAgo(tx.firstSeen)}</span>
                    </p>
                  )}
                  <p className="text-sm text-gray-400">
                    ETA:{' '}
                    <span className="text-white" title={tx.confirmationEta == null ? 'Estimated time until confirmation; not always available' : undefined}>
                      {tx.confirmationEta != null
                        ? `~${Math.round(tx.confirmationEta / 60)} min`
                        : '—'}
                    </span>
                    {tx.confirmationEta == null && (
                      <span className="ml-1 block text-xs text-gray-500">ETA not available for this transaction</span>
                    )}
                  </p>
                  {!tx.status?.confirmed && (
                    <p className="text-xs text-gray-500">Updating every 15s</p>
                  )}
                  {deriveFeatures(tx).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {deriveFeatures(tx).map((f) => (
                        <span
                          key={f}
                          className="rounded bg-green-600/20 px-2 py-0.5 text-xs text-green-400"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {tx.fee != null && (
                    <p className="text-sm text-gray-400">
                      Fee: <span className="text-white" title="Transaction fee in satoshis (1 sat = 0.00000001 BTC)">{tx.fee} sats</span>
                    </p>
                  )}
                  {tx.feePerVsize != null && (
                    <p className="text-sm text-gray-400">
                      Fee rate: <span className="text-white" title="Fee per virtual byte (sat/vB); higher = faster confirmation">{tx.feePerVsize.toFixed(2)} sat/vB</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Details block (Screenshot 1) */}
              <section className="mb-4 min-w-0">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Details
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded bg-mempool-bg/50 px-3 py-2">
                    <span className="text-xs text-gray-500" title="Transaction size in bytes">Size</span>
                    <p className="text-sm text-white">{tx.size != null ? `${tx.size} B` : '—'}</p>
                  </div>
                  <div className="rounded bg-mempool-bg/50 px-3 py-2">
                    <span className="text-xs text-gray-500" title="Virtual size in vB (virtual bytes); used for fee calculation">Virtual size</span>
                    <p className="text-sm text-white">
                      {tx.vsize != null ? `${tx.vsize} vB` : '—'}
                    </p>
                  </div>
                  <div className="rounded bg-mempool-bg/50 px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      Adjusted vsize
                      <span title="Adjusted virtual size for fee calculation (same as virtual size when available)">
                        <Info className="h-3 w-3" />
                      </span>
                    </span>
                    <p className="text-sm text-white">
                      {tx.vsize != null ? `${tx.vsize} vB` : '—'}
                    </p>
                  </div>
                  <div className="rounded bg-mempool-bg/50 px-3 py-2">
                    <span className="text-xs text-gray-500" title="Weight in WU (weight units); max 4M per block">Weight</span>
                    <p className="text-sm text-white">
                      {tx.weight != null ? `${tx.weight} WU` : '—'}
                    </p>
                  </div>
                  <div className="rounded bg-mempool-bg/50 px-3 py-2">
                    <span className="text-xs text-gray-500">Version</span>
                    <p className="text-sm text-white">{tx.version ?? '—'}</p>
                  </div>
                  <div className="rounded bg-mempool-bg/50 px-3 py-2">
                    <span className="text-xs text-gray-500">Locktime</span>
                    <p className="text-sm text-white">{tx.locktime ?? '—'}</p>
                  </div>
                  <div className="rounded bg-mempool-bg/50 px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      Sigops
                      <span title="Signature operations count; limit affects block validation">
                        <Info className="h-3 w-3" />
                      </span>
                    </span>
                    <p className="text-sm text-white">
                      {tx.sigops != null ? String(tx.sigops) : '—'}
                    </p>
                  </div>
                  <div className="rounded bg-mempool-bg/50 px-3 py-2 sm:col-span-2">
                    <span className="text-xs text-gray-500" title="Raw transaction in hexadecimal">Transaction hex</span>
                    <div className="mt-1 min-w-0">
                      {tx.hex ? (
                        <div className="flex flex-col gap-1">
                          <pre className="max-h-24 min-w-0 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-gray-400">
                            {showFullHex ? tx.hex : (tx.hex.length > 80 ? `${tx.hex.slice(0, 80)}…` : tx.hex)}
                          </pre>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowFullHex((v) => !v)}
                              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                            >
                              {showFullHex ? (
                                <>
                                  <ChevronDown className="h-3 w-3" />
                                  Show less
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="h-3 w-3" />
                                  Show full hex
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(tx.hex!)}
                              className="rounded px-1.5 py-0.5 text-xs text-sky-400 hover:bg-mempool-border"
                              title="Copy full hex"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Inputs & Outputs */}
              <section className="min-w-0 pt-2">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Inputs & Outputs
                </h3>
                <p className="mb-3 text-xs text-gray-500">
                  Amount and type shown; use &quot;Show technical details&quot; for scripts and witness data.
                </p>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="min-w-0 overflow-hidden">
                    <h4 className="mb-2 text-xs text-gray-500">Inputs</h4>
                    <div className="space-y-3">
                      {tx.vin.map((vin, i) => {
                        const hasTechnical =
                          (vin.witness && vin.witness.length > 0) ||
                          vin.sequence != null ||
                          (vin.prevout?.scriptpubkey_asm != null && vin.prevout.scriptpubkey_asm !== '');
                        const expanded = expandedInputs.has(i);
                        return (
                          <div
                            key={`${vin.txid}-${vin.vout}-${i}`}
                            className="min-w-0 overflow-hidden rounded border border-mempool-border bg-mempool-bg/30 p-3"
                          >
                            <p className="break-all text-xs text-sky-400">
                              {vin.prevout?.address ?? `${truncate(vin.txid)}:${vin.vout}`}
                            </p>
                            {vin.prevout?.value != null && (
                              <p className="mt-1 text-sm text-white">
                                {formatBtc(vin.prevout.value)} BTC
                              </p>
                            )}
                            {vin.prevout?.scriptpubkey_type != null && (
                              <p className="mt-0.5 text-xs text-gray-500">
                                Type: {vin.prevout.scriptpubkey_type}
                              </p>
                            )}
                            {hasTechnical && (
                              <button
                                type="button"
                                onClick={() => toggleInput(i)}
                                className="mt-2 flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                              >
                                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                {expanded ? 'Hide technical details' : 'Show technical details'}
                              </button>
                            )}
                            {expanded && (
                              <div className="mt-2 space-y-2 border-t border-mempool-border pt-2">
                                {vin.witness && vin.witness.length > 0 && (
                                  <div className="min-w-0 overflow-hidden">
                                    <span className="block text-xs text-gray-500" title="Witness data (signatures, etc.)">Witness</span>
                                    <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-gray-400">
                                      {vin.witness.join(' ')}
                                    </pre>
                                  </div>
                                )}
                                {vin.sequence != null && (
                                  <p className="text-xs text-gray-500">
                                    nSequence: 0x{vin.sequence.toString(16)}
                                  </p>
                                )}
                                {vin.prevout?.scriptpubkey_asm != null && vin.prevout.scriptpubkey_asm !== '' && (
                                  <div className="min-w-0 overflow-hidden">
                                    <span className="block text-xs text-gray-500">Previous output script (ASM)</span>
                                    <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-gray-400">
                                      {vin.prevout.scriptpubkey_asm}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <h4 className="mb-2 text-xs text-gray-500">Outputs</h4>
                    <div className="space-y-3">
                      {tx.vout.map((vout, i) => {
                        const hasTechnical =
                          (vout.scriptpubkey_asm != null && vout.scriptpubkey_asm !== '') ||
                          (vout.scriptpubkey != null && vout.scriptpubkey !== '');
                        const expanded = expandedOutputs.has(i);
                        return (
                          <div
                            key={`${i}-${vout.value}-${vout.scriptpubkey_type ?? ''}`}
                            className="min-w-0 overflow-hidden rounded border border-mempool-border bg-mempool-bg/30 p-3"
                          >
                            <p className="break-all text-xs text-sky-400">
                              {vout.scriptpubkey_type?.toLowerCase() === 'op_return'
                                ? 'OP_RETURN'
                                : vout.address ?? `Output ${i + 1}`}
                            </p>
                            <p className="mt-1 text-sm text-white">{formatBtc(vout.value)} BTC</p>
                            {vout.scriptpubkey_type != null && (
                              <p className="mt-0.5 text-xs text-gray-500">Type: {vout.scriptpubkey_type}</p>
                            )}
                            {hasTechnical && (
                              <button
                                type="button"
                                onClick={() => toggleOutput(i)}
                                className="mt-2 flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                              >
                                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                {expanded ? 'Hide technical details' : 'Show technical details'}
                              </button>
                            )}
                            {expanded && (
                              <div className="mt-2 space-y-2 border-t border-mempool-border pt-2">
                                {vout.scriptpubkey_asm != null && vout.scriptpubkey_asm !== '' && (
                                  <div className="min-w-0 overflow-hidden">
                                    <span className="block text-xs text-gray-500" title="Script in assembly form">ScriptPubKey (ASM)</span>
                                    <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-gray-400">
                                      {vout.scriptpubkey_asm}
                                    </pre>
                                  </div>
                                )}
                                {vout.scriptpubkey != null && vout.scriptpubkey !== '' && (
                                  <div className="min-w-0 overflow-hidden">
                                    <span className="block text-xs text-gray-500" title="Script in hexadecimal">ScriptPubKey (HEX)</span>
                                    <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-gray-400">
                                      {vout.scriptpubkey}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-sm text-sky-400">
                      Total: {formatBtc(tx.vout.reduce((s, o) => s + o.value, 0))} BTC
                    </p>
                  </div>
                </div>
              </section>

              <footer className="mt-4 border-t border-mempool-border pt-3">
                <a
                  href={`${MEMPOOL_TX_URL}/${tx.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300"
                >
                  View on mempool.space
                  <ExternalLink className="h-4 w-4" />
                </a>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
