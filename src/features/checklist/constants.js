/**
 * Preset checklist categories and item IDs for the Market Checklist.
 */
export const CATEGORIES = [
  {
    id: 'pre',
    label: 'Pre-Market',
    items: [
      { id: 'pre-check-futures', label: 'Check index futures (ES/NQ)' },
      { id: 'pre-overnight-news', label: 'Review overnight news' },
      { id: 'pre-premarket-movers', label: 'Scan pre-market movers' },
      { id: 'pre-economic-calendar', label: 'Check economic calendar' },
    ],
  },
  {
    id: 'ta',
    label: 'Technical Analysis',
    items: [
      { id: 'ta-support-resistance', label: 'Review key support/resistance levels' },
      { id: 'ta-indicators', label: 'Check technical indicators' },
      { id: 'ta-volume-profiles', label: 'Analyze volume profiles' },
      { id: 'ta-watchlist-setups', label: 'Review watchlist setups' },
    ],
  },
  {
    id: 'fund',
    label: 'Fundamentals',
    items: [
      { id: 'fund-earnings-calendar', label: 'Check earnings calendar' },
      { id: 'fund-economic-data', label: 'Review economic data releases' },
      { id: 'fund-fed', label: 'Monitor Fed/central bank announcements' },
      { id: 'fund-sector-rotation', label: 'Scan sector rotation' },
    ],
  },
  {
    id: 'risk',
    label: 'Risk Management',
    items: [
      { id: 'risk-stops', label: 'Set stop-losses on open positions' },
      { id: 'risk-position-sizing', label: 'Verify position sizing' },
      { id: 'risk-exposure', label: 'Review portfolio exposure' },
      { id: 'risk-pnl-targets', label: 'Check P&L targets' },
    ],
  },
  {
    id: 'journal',
    label: 'Trade Journal',
    items: [
      { id: 'journal-log-trades', label: 'Log trade entries and exits' },
      { id: 'journal-review-mistakes', label: 'Review mistakes from last session' },
      { id: 'journal-lessons', label: 'Note lessons learned' },
      { id: 'journal-update-rules', label: 'Update strategy rules' },
    ],
  },
  {
    id: 'post',
    label: 'Post-Market',
    items: [
      { id: 'post-review-trades', label: 'Review day\'s trades' },
      { id: 'post-update-watchlist', label: 'Update watchlist for next session' },
      { id: 'post-plan-tomorrow', label: 'Plan tomorrow\'s setups' },
      { id: 'post-record-observations', label: 'Record market observations' },
    ],
  },
];

export const ALL_PRESET_IDS = CATEGORIES.flatMap((c) => c.items.map((i) => i.id));

export function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
