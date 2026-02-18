import { fetchApi, fetchApiText } from './client';

export async function fetchRecommendedFees() {
  return fetchApi('/v1/fees/recommended');
}

export async function fetchPrices() {
  return fetchApi('/v1/prices');
}

export async function fetchDifficultyAdjustment() {
  return fetchApi('/v1/difficulty-adjustment');
}

export async function fetchMempool() {
  return fetchApi('/mempool');
}

export async function fetchMempoolRecent() {
  return fetchApi('/mempool/recent');
}

export async function fetchMempoolRbf() {
  try {
    const raw = await fetchApi('/v1/mempool/rbf');
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      const fullRbfRaw = item.fullRbf ?? item.full_rbf;
      return {
        txid: String(item.txid ?? ''),
        previous_fee: item.previous_fee != null ? Number(item.previous_fee) : undefined,
        new_fee: item.new_fee != null ? Number(item.new_fee) : undefined,
        fullRbf: fullRbfRaw === undefined ? undefined : Boolean(fullRbfRaw),
      };
    });
  } catch {
    return [];
  }
}

export async function fetchMempoolBlocks() {
  return fetchApi('/v1/fees/mempool-blocks');
}

export async function fetchRecentBlocks(startHeight) {
  const path = startHeight != null ? `/v1/blocks/${startHeight}` : '/v1/blocks';
  return fetchApi(path);
}

export async function fetchTransaction(txid) {
  return fetchApi(`/tx/${txid}`);
}

export async function fetchTransactionStatus(txid) {
  return fetchApi(`/tx/${txid}/status`);
}

export async function fetchTransactionHex(txid) {
  return fetchApiText(`/tx/${txid}/hex`);
}

function mapPrevout(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    scriptpubkey: typeof raw.scriptpubkey === 'string' ? raw.scriptpubkey : undefined,
    scriptpubkey_asm: typeof raw.scriptpubkey_asm === 'string' ? raw.scriptpubkey_asm : undefined,
    scriptpubkey_type: typeof raw.scriptpubkey_type === 'string' ? raw.scriptpubkey_type : undefined,
    value: typeof raw.value === 'number' ? raw.value : undefined,
    address: typeof raw.address === 'string' ? raw.address : undefined,
  };
}

function mapVin(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const prevout = o.prevout && typeof o.prevout === 'object' ? mapPrevout(o.prevout) : undefined;
  const witness = Array.isArray(o.witness) ? o.witness : undefined;
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

function mapVout(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    scriptpubkey: typeof o.scriptpubkey === 'string' ? o.scriptpubkey : undefined,
    scriptpubkey_asm: typeof o.scriptpubkey_asm === 'string' ? o.scriptpubkey_asm : undefined,
    scriptpubkey_type: typeof o.scriptpubkey_type === 'string' ? o.scriptpubkey_type : undefined,
    value: typeof o.value === 'number' ? o.value : 0,
    address: typeof o.address === 'string' ? o.address : undefined,
  };
}

export async function fetchTransactionDetail(txid) {
  const [txRaw, hex, status] = await Promise.all([
    fetchApi(`/tx/${txid}`),
    fetchTransactionHex(txid).catch(() => undefined),
    fetchTransactionStatus(txid).catch(() => undefined),
  ]);

  const vin = Array.isArray(txRaw.vin) ? txRaw.vin.map(mapVin) : [];
  const vout = Array.isArray(txRaw.vout) ? txRaw.vout.map(mapVout) : [];

  const fee = typeof txRaw.fee === 'number' ? txRaw.fee : undefined;
  const size = typeof txRaw.size === 'number' ? txRaw.size : undefined;
  const weight = typeof txRaw.weight === 'number' ? txRaw.weight : undefined;
  const vsizeFromApi =
    typeof txRaw.vsize === 'number'
      ? txRaw.vsize
      : typeof txRaw.virtual_size === 'number'
        ? txRaw.virtual_size
        : undefined;
  const vsize = vsizeFromApi ?? (weight != null ? Math.ceil(weight / 4) : undefined);
  const feePerVsize = fee != null && vsize != null && vsize > 0 ? fee / vsize : undefined;
  const sigops = typeof txRaw.sigops === 'number' ? txRaw.sigops : undefined;

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
    status: status ?? (txRaw.status && typeof txRaw.status === 'object' ? txRaw.status : undefined),
    firstSeen: typeof txRaw.first_seen === 'number' ? txRaw.first_seen : undefined,
    confirmationEta: typeof txRaw.confirmation_eta === 'number' ? txRaw.confirmation_eta : undefined,
    hex,
    vin,
    vout,
  };
}
