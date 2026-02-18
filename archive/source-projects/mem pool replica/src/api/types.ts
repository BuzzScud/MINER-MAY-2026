export interface RecommendedFees {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export interface DifficultyAdjustment {
  progressPercent: number;
  difficultyChange: number;
  estimatedRetargetDate: number;
  remainingBlocks: number;
  remainingTime: number;
  previousRetarget: number;
  nextRetargetHeight: number;
  timeAvg: number;
  adjustedTimeAvg: number;
  timeOffset: number;
}

export interface MempoolStats {
  count: number;
  vsize: number;
  total_fee?: number;
  fee_histogram?: Array<[number, number]>; // [feeRate sat/vB, cumulative vsize]
}

export interface MempoolInfo {
  loaded: boolean;
  size: number;
  bytes: number;
  usage: number;
  maxmempool: number;
  mempoolminfee: number;
  minrelaytxfee: number;
}

export interface MempoolBlock {
  blockSize: number;
  blockVSize: number;
  nTx: number;
  totalFees: number;
  medianFee: number;
  feeRange: number[];
}

export interface MempoolTransaction {
  txid: string;
  fee: number;
  vsize: number;
  feePerVsize?: number;
  value?: number;
  status?: { confirmed: boolean };
}

export interface RbfReplacement {
  txid: string;
  previous_fee?: number;
  new_fee?: number;
  fullRbf?: boolean;
}

export interface Prices {
  USD: number;
  EUR?: number;
  GBP?: number;
  CAD?: number;
  CHF?: number;
  AUD?: number;
  JPY?: number;
  time?: number;
}

export interface ConfirmedBlockPool {
  id?: number;
  name: string;
  slug: string;
  minerNames?: string[] | null;
}

export interface ConfirmedBlockExtras {
  totalFees?: number;
  medianFee?: number;
  feeRange?: number[];
  pool?: ConfirmedBlockPool;
  reward?: number;
}

export interface ConfirmedBlock {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
  extras?: ConfirmedBlockExtras;
}

/** Prevout or scriptpubkey info for vin/vout. */
export interface TransactionPrevout {
  scriptpubkey?: string;
  scriptpubkey_asm?: string;
  scriptpubkey_type?: string;
  value?: number;
  address?: string;
}

export interface TransactionVinDetail {
  txid: string;
  vout: number;
  sequence?: number;
  prevout?: TransactionPrevout;
  scriptsig?: string;
  scriptsig_asm?: string;
  witness?: string[];
  inner_redeemscript_asm?: string;
  inner_witnessscript_asm?: string;
}

export interface TransactionVoutDetail {
  scriptpubkey?: string;
  scriptpubkey_asm?: string;
  scriptpubkey_type?: string;
  value: number;
  address?: string;
}

/** Rich transaction for modal; API may return snake_case, normalized to camelCase where used. */
export interface TransactionDetail {
  txid: string;
  version?: number;
  locktime?: number;
  size?: number;
  weight?: number;
  vsize?: number;
  fee?: number;
  feePerVsize?: number;
  sigops?: number;
  status?: { confirmed: boolean; block_height?: number; block_hash?: string; block_time?: number };
  firstSeen?: number;
  /** ETA in seconds until next block (if provided by API). */
  confirmationEta?: number;
  hex?: string;
  vin: TransactionVinDetail[];
  vout: TransactionVoutDetail[];
}
