import { useQuery } from '@tanstack/react-query';
import { fetchMempoolRecent, fetchTransaction } from '../api/mempool';

function classifyTransaction(tx) {
  const vinCount = tx.vin?.length ?? 0;
  const voutCount = tx.vout?.length ?? 0;

  const hasOpReturn = tx.vout?.some(
    (o) =>
      o.scriptpubkey_type === 'op_return' ||
      o.scriptpubkey_type === 'nulldata' ||
      (o.scriptpubkey_type && o.scriptpubkey_type.toLowerCase().includes('op_return'))
  );

  if (hasOpReturn) return 'data';
  if (vinCount >= 5 && voutCount <= 2) return 'consolidation';
  if (vinCount >= 5 && voutCount >= 5) return 'coinjoin';

  return null;
}

async function fetchAndClassify(filter) {
  const recent = await fetchMempoolRecent();
  const results = [];

  for (const tx of recent.slice(0, 25)) {
    await new Promise((r) => setTimeout(r, 120));
    try {
      const full = await fetchTransaction(tx.txid);
      if (classifyTransaction(full) === filter) {
        const feePerVsize = tx.vsize > 0 ? tx.fee / tx.vsize : 0;
        results.push({
          txid: tx.txid,
          vsize: tx.vsize,
          fee: tx.fee,
          feePerVsize,
        });
      }
    } catch {
      // Skip failed fetches
    }
  }

  return results;
}

export function useClassifiedTransactions(filter) {
  return useQuery({
    queryKey: ['classifiedTransactions', filter],
    queryFn: () => (filter ? fetchAndClassify(filter) : Promise.resolve([])),
    enabled: !!filter,
    staleTime: 60_000,
  });
}
