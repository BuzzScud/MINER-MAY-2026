/**
 * @typedef {Object} SavedProjection
 * @property {string} id                    // uuid or timestamp-based
 * @property {string} timestamp             // ISO string
 * @property {string} ticker
 * @property {string} name                  // user-editable title
 * @property {number} currentPrice
 * @property {number} firstTargetPrice
 * @property {number} percentToTarget
 * @property {number} confidence
 * @property {number} crystallineScore
 * @property {number} crystallineTrend
 * @property {number} crystallineVol
 * @property {number} crystallineRisk
 * @property {string} clockLatticePosition
 * @property {number} swingLow
 * @property {number} swingHigh
 * @property {Array<{label: string, bullish: number, bearish: number}>} keyPhiTargets
 * @property {Array<{ratio: number, bullish: number, bearish: number}>} phiExtensionTable
 * @property {string} [note]
 *
 * Chart snapshot fields (stored at save time for full replay):
 * @property {string[]} chartHistoricalDates
 * @property {number[]} chartHistoricalPrices
 * @property {string[]} chartPredictedDates
 * @property {number[]} chartPredictedPrices
 * @property {number[] | null} chartUpperBand
 * @property {number[] | null} chartLowerBand
 * @property {Record<string, number> | null} fibLevelsDict
 *
 * Extended summary fields:
 * @property {boolean | null} onPrime
 * @property {boolean | null} piPhiResonance
 * @property {string | null} fibAnchorDate
 * @property {boolean | null} fibAnchorBullish
 * @property {boolean | null} fibBullConfluence
 * @property {boolean | null} fibBearConfluence
 * @property {number | null} riskRatio
 * @property {number | null} volatilityAnnual
 * @property {string | null} summary
 * @property {string | null} direction
 */

export {};
