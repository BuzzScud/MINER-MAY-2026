import { fetchApi, fetchApiText } from './client';
import type {
  RecommendedFees,
  Prices,
  DifficultyAdjustment,
  MempoolStats,
  MempoolTransaction,
  MempoolBlock,
  RbfReplacement,
  ConfirmedBlock,
  TransactionDetail,
  TransactionVinDetail,
  TransactionVoutDetail,
  TransactionPrevout,
} from './types';

export async function fetchRecommendedFees(): Promise<RecommendedFees> {
  return fetchApi<RecommendedFees>('/v1/fees/recommended');
}

export async function fetchPrices(): Promise<Prices> {
  return fetchApi<Prices>('/v1/prices');
}

export async function fetchDifficultyAdjustment(): Promise<DifficultyAdjustment> {
  return fetchApi<DifficultyAdjustment>('/v1/difficulty-adjustment');
}

export async function fetchMempool(): Promise<MempoolStats> {
  return fetchApi<MempoolStats>('/mempool');
}

export async function fetchMempoolRecent(): Promise<MempoolTransaction[]> {
  return fetchApi<MempoolTransaction[]>('/mempool/recent');
}

/** RBF endpoint: /v1/mempool/rbf per mempool.space REST docs. Graceful degradation: return [] on failure so the tab stays usable. */
export async function fetchMempoolRbf(): Promise<RbfReplacement[]> {
  try {
    const raw = await fetchApi<unknown>('/v1/mempool/rbf');
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Record<string, unknown>>).map((item) => {
      const fullRbfRaw = item.fullRbf ?? item.full_rbf;
      return {
        txid: String(item.txid ?? ''),
        previous_fee: item.previous_fee != null ? Number(item.previous_fee) : undefined,
        new_fee: item.new_fee != null ? Number(item.new_fee) : undefined,
        fullRbf: fullRbfRaw === undefined ? undefined : Boolean(fullRbfRaw),
      } as RbfReplacement;
    });
  } catch {
    return [];
  }
}

export async function fetchMempoolBlocks(): Promise<MempoolBlock[]> {
  return fetchApi<MempoolBlock[]>('/v1/fees/mempool-blocks');
}

export async function fetchRecentBlocks(startHeight?: number): Promise<ConfirmedBlock[]> {
  const path = startHeight != null ? `/v1/blocks/${startHeight}` : '/v1/blocks';
  return fetchApi<ConfirmedBlock[]>(path);
}

export interface FullTransaction {
  txid: string;
  vin: Array<{ txid: string; vout: number }>;
  vout: Array<{
    scriptpubkey_type: string;
    value: number;
  }>;
  status?: { confirmed: boolean };
}

export async function fetchTransaction(txid: string): Promise<FullTransaction> {
  return fetchApi<FullTransaction>(`/tx/${txid}`);
}

export interface TransactionStatusResponse {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

export async function fetchTransactionStatus(txid: string): Promise<TransactionStatusResponse> {
  return fetchApi<TransactionStatusResponse>(`/tx/${txid}/status`);
}

export async function fetchTransactionHex(txid: string): Promise<string> {
  return fetchApiText(`/tx/${txid}/hex`);
}

function mapPrevout(raw: Record<string, unknown> | undefined): TransactionPrevout | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    scriptpubkey: typeof raw.scriptpubkey === 'string' ? raw.scriptpubkey : undefined,
    scriptpubkey_asm: typeof raw.scriptpubkey_asm === 'string' ? raw.scriptpubkey_asm : undefined,
    scriptpubkey_type: typeof raw.scriptpubkey_type === 'string' ? raw.scriptpubkey_type : undefined,
    value: typeof raw.value === 'number' ? raw.value : undefined,
    address: typeof raw.address === 'string' ? raw.address : undefined,
  };
}

function mapVin(raw: unknown): TransactionVinDetail {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const prevout = o.prevout && typeof o.prevout === 'object' ? mapPrevout(o.prevout as Record<string, unknown>) : undefined;
  const witness = Array.isArray(o.witness) ? (o.witness as string[]) : undefined;
  return {
    txid: String(o.txid ?? ''),
    vout: Number(o.vout ?? 0),
    sequence: typeof o.sequence === 'number' ? o.sequence : undefined,
    prevout,
    scriptsig: typeof o.scriptsig === 'string' ? o.scriptsig : undefined,
    scriptsig_asm: typeof o.scriptsig_asm === 'string' ? o.scriptsig_asm : undefined,
    witness,
  };
}

function mapVout(raw: unknown): TransactionVoutDetail {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    scriptpubkey: typeof o.scriptpubkey === 'string' ? o.scriptpubkey : undefined,
    scriptpubkey_asm: typeof o.scriptpubkey_asm === 'string' ? o.scriptpubkey_asm : undefined,
    scriptpubkey_type: typeof o.scriptpubkey_type === 'string' ? o.scriptpubkey_type : undefined,
    value: typeof o.value === 'number' ? o.value : 0,
    address: typeof o.address === 'string' ? o.address : undefined,
  };
}

/** Fetches full transaction detail for the modal; merges /tx, /tx/hex, /tx/status. */
export async function fetchTransactionDetail(txid: string): Promise<TransactionDetail> {
  const [txRaw, hex, status] = await Promise.all([
    fetchApi<Record<string, unknown>>(`/tx/${txid}`),
    fetchTransactionHex(txid).catch(() => undefined),
    fetchTransactionStatus(txid).catch(() => undefined),
  ]);

  const vin = Array.isArray(txRaw.vin) ? (txRaw.vin as unknown[]).map(mapVin) : [];
  const vout = Array.isArray(txRaw.vout) ? (txRaw.vout as unknown[]).map(mapVout) : [];

  const fee = typeof txRaw.fee === 'number' ? txRaw.fee : undefined;
  const size = typeof txRaw.size === 'number' ? txRaw.size : undefined;
  const weight = typeof txRaw.weight === 'number' ? txRaw.weight : undefined;
  const vsizeFromApi =
    typeof txRaw.vsize === 'number'
      ? txRaw.vsize
      : typeof (txRaw as { virtual_size?: number }).virtual_size === 'number'
        ? (txRaw as { virtual_size: number }).virtual_size
        : undefined;
  const vsize = vsizeFromApi ?? (weight != null ? Math.ceil(weight / 4) : undefined);
  const feePerVsize = fee != null && vsize != null && vsize > 0 ? fee / vsize : undefined;
  const sigops =
    typeof (txRaw as { sigops?: number }).sigops === 'number'
      ? (txRaw as { sigops: number }).sigops
      : undefined;

  return {
    txid: String(txRaw.txid ?? txid),
    version: typeof txRaw.version === 'number' ? txRaw.version : undefined,
    locktime: typeof txRaw.locktime === 'number' ? txRaw.locktime : undefined,
    size,
    weight,
    vsize,
    fee,
    feePerVsize,
    sigops,
    status: status ?? (txRaw.status && typeof txRaw.status === 'object' ? (txRaw.status as TransactionDetail['status']) : undefined),
    firstSeen: typeof (txRaw as { first_seen?: number }).first_seen === 'number' ? (txRaw as { first_seen: number }).first_seen : undefined,
    confirmationEta:
      typeof (txRaw as { confirmation_eta?: number }).confirmation_eta === 'number'
        ? (txRaw as { confirmation_eta: number }).confirmation_eta
        : undefined,
    hex,
    vin,
    vout,
  };
}
