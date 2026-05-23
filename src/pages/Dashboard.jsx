import { useState, useEffect } from 'react';
import { Presentation, LineChart, BadgeDollarSign, Twitter, Youtube, ExternalLink } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useSettings } from '../contexts/SettingsContext';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { calculateUniversalDayNumber, getNumerologyForecast } from '../utils/numerology';

// Helper function to check if US market is currently open
const isMarketOpen = () => {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = easternTime.getHours();
  const minutes = easternTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Market is closed on weekends
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Regular market hours: 9:30 AM - 4:00 PM ET (930 - 960 minutes)
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
};

// Helper function to determine market state
const getMarketState = (meta, fallbackToTimeCheck = true) => {
  // First, try to use the marketState from the API
  if (meta.marketState) {
    const state = meta.marketState.toUpperCase();
    // Yahoo Finance uses: REGULAR, PRE, POST, CLOSED, PREPRE, POSTPOST
    if (state === 'REGULAR') return 'REGULAR';
    if (state === 'PRE' || state === 'PREPRE') return 'PRE';
    if (state === 'POST' || state === 'POSTPOST') return 'POST';
    if (state === 'CLOSED') return 'CLOSED';
  }
  
  // Fallback: check if market is open based on current time
  if (fallbackToTimeCheck) {
    const marketOpen = isMarketOpen();
    return marketOpen ? 'REGULAR' : 'CLOSED';
  }
  
  return 'UNKNOWN';
};


// Helper function to get current stock price
const getStockPrice = async (symbol) => {
  try {
    // Use 5m interval to get more recent data when market is open
    // This helps get the latest price instead of just previous close
    const interval = isMarketOpen() ? '5m' : '1d';
    const range = isMarketOpen() ? '1d' : '1d';
    
    // Import fetchMarketData which handles both Yahoo and Finnhub
    const { fetchMarketData } = await import('../services/monitorService');
    const response = await fetchMarketData(symbol, interval, range);
    
    if (!response || !response.data) {
      throw new Error('Invalid response format');
    }
    
    const data = response.data;
    const source = response.source;
    
    // Handle Finnhub data format (flat object with c, pc, h, l, o, v)
    if (source === 'finnhub') {
      const currentPrice = data.c || 0;
      const previousClose = data.pc || currentPrice;
      const change = currentPrice - previousClose;
      const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;
      
      // Finnhub doesn't provide market state, check by time
      const marketState = isMarketOpen() ? 'REGULAR' : 'CLOSED';
      
      return {
        symbol,
        price: currentPrice,
        change,
        changePercent,
        previousClose: previousClose,
        marketState: marketState,
        volume: data.v || 0,
      };
    }
    
    // Handle Yahoo Finance data format
    if (!data?.chart?.result?.[0]) {
      throw new Error('Invalid data format: missing chart result');
    }
    
    const result = data.chart.result[0];
    
    if (!result.meta) {
      throw new Error('Invalid data format: missing meta data');
    }
    
    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0];
    
    // Get previous close first (this should always be available)
    const previousClose = meta.previousClose || meta.close || 0;
    
    // Get current price - prioritize real-time data when market is open
    let currentPrice = 0;
    
    // Priority 1: Use regularMarketPrice if available (most accurate for current price)
    if (meta.regularMarketPrice && meta.regularMarketPrice > 0) {
      currentPrice = meta.regularMarketPrice;
    }
    
    // Priority 2: Try to get the most recent price from quote data
    if ((!currentPrice || currentPrice === 0) && quotes && quotes.close && quotes.close.length > 0) {
      // Get the last non-null close price from the array
      for (let i = quotes.close.length - 1; i >= 0; i--) {
        const price = quotes.close[i];
        if (price !== null && price !== undefined && price > 0) {
          currentPrice = price;
          break;
        }
      }
    }
    
    // Priority 3: Try chartPreviousClose or other meta fields
    if (!currentPrice || currentPrice === 0) {
      currentPrice = meta.chartPreviousClose || meta.close || 0;
    }
    
    // Priority 4: If still no current price, use previousClose as last resort
    // But only if we're sure it's different (market closed scenario)
    if (!currentPrice || currentPrice === 0) {
      currentPrice = previousClose || meta.close || 0;
    }
    
    if (!currentPrice || currentPrice === 0) {
      throw new Error('Invalid data format: no valid price data');
    }
    
    // Calculate change - always compare current price to previous close
    let change = 0;
    let changePercent = 0;
    
    if (previousClose && previousClose > 0) {
      change = currentPrice - previousClose;
      changePercent = (change / previousClose) * 100;
    }
    
    // Determine market state with fallback to time-based check
    const marketState = getMarketState(meta, true);
    
    // Get volume data
    let volume = 0;
    if (meta.regularMarketVolume && meta.regularMarketVolume > 0) {
      volume = meta.regularMarketVolume;
    } else if (quotes && quotes.volume && quotes.volume.length > 0) {
      // Get the most recent non-null volume
      for (let i = quotes.volume.length - 1; i >= 0; i--) {
        const vol = quotes.volume[i];
        if (vol !== null && vol !== undefined && vol > 0) {
          volume = vol;
          break;
        }
      }
    }
    
    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      previousClose: previousClose,
      marketState: marketState,
      volume: volume,
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    
    // If API fails, try to determine market state from time
    const marketState = isMarketOpen() ? 'REGULAR' : 'CLOSED';
    
    return {
      symbol,
      price: null,
      change: 0,
      changePercent: 0,
      previousClose: 0,
      marketState: marketState,
      volume: 0,
      error: 'Failed to fetch data. Please try again.',
    };
  }
};

// Sortable World Clock Component
function SortableWorldClock({ id, timezone, city, country }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formatted = formatter.formatToParts(time);
  const timeStr = formatted.find(p => p.type === 'hour').value + ':' + 
                  formatted.find(p => p.type === 'minute').value + ':' + 
                  formatted.find(p => p.type === 'second').value + ' ' + 
                  formatted.find(p => p.type === 'dayPeriod').value;
  const dateStr = formatted.find(p => p.type === 'month').value + ' ' + 
                  formatted.find(p => p.type === 'day').value + ', ' + 
                  formatted.find(p => p.type === 'year').value;

  // Calculate numerology for the date in this timezone
  // Extract date components from the formatted parts
  const monthName = formatted.find(p => p.type === 'month').value;
  const day = parseInt(formatted.find(p => p.type === 'day').value);
  const year = parseInt(formatted.find(p => p.type === 'year').value);
  
  // Convert month name to number (Jan=1, Feb=2, etc.)
  const monthMap = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
  };
  const month = monthMap[monthName] || 1;
  
  // Create a date object for numerology calculation
  const localDate = new Date(year, month - 1, day);
  const universalDayNumber = calculateUniversalDayNumber(localDate);
  const forecast = getNumerologyForecast(universalDayNumber);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-move touch-none"
      {...attributes}
      {...listeners}
    >
      <div className="text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{city}</h3>
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">{country}</p>
        <div className="text-lg font-bold text-gray-900 dark:text-white mb-1 font-mono">
          {timeStr}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {dateStr}
        </div>
        
        {/* Daily Global Numerology Forecast */}
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {forecast.number}
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-white">
              {forecast.title}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {forecast.description}
          </p>
        </div>
      </div>
    </div>
  );
}

// World Clock Component (non-sortable, for backwards compatibility)
function WorldClock({ timezone, city, country }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formatted = formatter.formatToParts(time);
  const timeStr = formatted.find(p => p.type === 'hour').value + ':' + 
                  formatted.find(p => p.type === 'minute').value + ':' + 
                  formatted.find(p => p.type === 'second').value + ' ' + 
                  formatted.find(p => p.type === 'dayPeriod').value;
  const dateStr = formatted.find(p => p.type === 'month').value + ' ' + 
                  formatted.find(p => p.type === 'day').value + ', ' + 
                  formatted.find(p => p.type === 'year').value;

  // Calculate numerology for the date in this timezone
  // Extract date components from the formatted parts
  const monthName = formatted.find(p => p.type === 'month').value;
  const day = parseInt(formatted.find(p => p.type === 'day').value);
  const year = parseInt(formatted.find(p => p.type === 'year').value);
  
  // Convert month name to number (Jan=1, Feb=2, etc.)
  const monthMap = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
  };
  const month = monthMap[monthName] || 1;
  
  // Create a date object for numerology calculation
  const localDate = new Date(year, month - 1, day);
  const universalDayNumber = calculateUniversalDayNumber(localDate);
  const forecast = getNumerologyForecast(universalDayNumber);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <div className="text-center">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{city}</h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">{country}</p>
        <div className="text-lg font-bold text-gray-900 dark:text-white mb-1 font-mono">
          {timeStr}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {dateStr}
        </div>
        
        {/* Daily Global Numerology Forecast */}
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {forecast.number}
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-white">
              {forecast.title}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {forecast.description}
          </p>
        </div>
      </div>
    </div>
  );
}

// Sortable Section Component
function SortableSection({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative mb-4"
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute -top-2 left-0 right-0 h-8 cursor-move touch-none flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-10 group"
      >
        <div className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
          <span className="text-xs text-gray-500 dark:text-gray-400">Drag to reorder section</span>
        </div>
      </div>
      <div className="pt-2">
        {children}
      </div>
    </div>
  );
}

// Volume Tooltip Component
function VolumeTooltip({ volume, symbol }) {
  if (!volume || volume === 0) {
    return null;
  }

  // Format volume with appropriate suffix
  const formatVolume = (vol) => {
    if (vol >= 1000000000) {
      return `${(vol / 1000000000).toFixed(2)}B`;
    } else if (vol >= 1000000) {
      return `${(vol / 1000000).toFixed(2)}M`;
    } else if (vol >= 1000) {
      return `${(vol / 1000).toFixed(2)}K`;
    }
    return vol.toLocaleString();
  };

  return (
    <div className="absolute z-50 w-48 px-3 py-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 bottom-full left-1/2 transform -translate-x-1/2 mb-3">
      <div className="text-[10px] font-semibold mb-1 text-gray-500 dark:text-gray-400 uppercase tracking-wider">{symbol} Volume</div>
      <div className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">{formatVolume(volume)}</div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400">Total shares traded</div>
      {/* Arrow pointing down */}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-white dark:border-t-gray-800"></div>
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-gray-200 dark:border-t-gray-700 absolute top-[1px]"></div>
      </div>
    </div>
  );
}

// Sortable Stock Info Card Component
function SortableStockCard({ id, symbol, data, loading, onRemove, showTooltips = true }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (loading) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-move touch-none"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{symbol}</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-sky-200 dark:border-sky-800 border-t-sky-400"></div>
            {onRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title={showTooltips ? 'Remove symbol' : undefined}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (data?.error || data?.price === null) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-move touch-none"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{symbol}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded">
              Error
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title={showTooltips ? 'Remove symbol' : undefined}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {data?.error || 'Unable to fetch data'}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-move touch-none"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{symbol}</h3>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title={showTooltips ? 'Remove symbol' : undefined}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  const isPositive = data.change >= 0;
  
  // DXY and VIX don't use dollar signs
  const isIndex = symbol === 'DXY' || symbol === 'VIX';
  const pricePrefix = isIndex ? '' : '$';
  
  // Determine market status with better logic
  let marketStatus = 'Closed';
  let statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
  
  if (data.marketState === 'REGULAR') {
    marketStatus = 'Open';
    statusColor = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
  } else if (data.marketState === 'PRE' || data.marketState === 'PREPRE') {
    marketStatus = 'Pre-Market';
    statusColor = 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
  } else if (data.marketState === 'POST' || data.marketState === 'POSTPOST') {
    marketStatus = 'After Hours';
    statusColor = 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400';
  } else if (data.marketState === 'CLOSED') {
    marketStatus = 'Closed';
    statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
  } else {
    // Fallback: check if market should be open based on time
    const marketOpen = isMarketOpen();
    if (marketOpen) {
      marketStatus = 'Open';
      statusColor = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
    } else {
      marketStatus = 'Closed';
      statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-move touch-none"
      {...attributes}
      {...listeners}
    >
      {/* Volume Tooltip */}
      {showTooltips && data && data.volume > 0 && (
        <VolumeTooltip volume={data.volume} symbol={symbol} />
      )}
      
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{symbol}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>
            {marketStatus}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title={showTooltips ? 'Remove symbol' : undefined}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="mb-2">
        <p className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">
          {pricePrefix}{data.price.toFixed(2)}
        </p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {data.change !== 0 ? (
              `${isPositive ? '+' : ''}${pricePrefix}${Math.abs(data.change).toFixed(2)}`
            ) : (
              `${pricePrefix}0.00`
            )}
          </span>
          <span className={`text-xs font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {data.changePercent !== 0 ? (
              `(${isPositive ? '+' : ''}${Math.abs(data.changePercent).toFixed(2)}%)`
            ) : (
              '(0.00%)'
            )}
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Previous Close</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {pricePrefix}{(data.previousClose || (data.price - data.change)).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Stock Info Card Component
function StockInfoCard({ symbol, data, loading, onRemove }) {
  if (loading) {
    return (
      <div className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{symbol}</h3>
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-sky-200 dark:border-sky-800 border-t-sky-400"></div>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title={showTooltips ? 'Remove symbol' : undefined}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (data?.error || data?.price === null) {
    return (
      <div className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{symbol}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 rounded">
              Error
            </span>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title={showTooltips ? 'Remove symbol' : undefined}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {data?.error || 'Unable to fetch data'}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{symbol}</h3>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title={showTooltips ? 'Remove symbol' : undefined}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  const isPositive = data.change >= 0;
  
  // DXY and VIX don't use dollar signs
  const isIndex = symbol === 'DXY' || symbol === 'VIX';
  const pricePrefix = isIndex ? '' : '$';
  
  // Determine market status with better logic
  let marketStatus = 'Closed';
  let statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
  
  if (data.marketState === 'REGULAR') {
    marketStatus = 'Open';
    statusColor = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
  } else if (data.marketState === 'PRE' || data.marketState === 'PREPRE') {
    marketStatus = 'Pre-Market';
    statusColor = 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
  } else if (data.marketState === 'POST' || data.marketState === 'POSTPOST') {
    marketStatus = 'After Hours';
    statusColor = 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400';
  } else if (data.marketState === 'CLOSED') {
    marketStatus = 'Closed';
    statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
  } else {
    // Fallback: check if market should be open based on time
    const marketOpen = isMarketOpen();
    if (marketOpen) {
      marketStatus = 'Open';
      statusColor = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
    } else {
      marketStatus = 'Closed';
      statusColor = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
    }
  }

  return (
    <div className="relative group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Volume Tooltip */}
      {showTooltips && data && data.volume > 0 && (
        <VolumeTooltip volume={data.volume} symbol={symbol} />
      )}
      
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{symbol}</h3>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>
            {marketStatus}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title={showTooltips ? 'Remove symbol' : undefined}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="mb-2">
        <p className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">
          {pricePrefix}{data.price.toFixed(2)}
        </p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {data.change !== 0 ? (
              `${isPositive ? '+' : ''}${pricePrefix}${Math.abs(data.change).toFixed(2)}`
            ) : (
              `${pricePrefix}0.00`
            )}
          </span>
          <span className={`text-xs font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {data.changePercent !== 0 ? (
              `(${isPositive ? '+' : ''}${Math.abs(data.changePercent).toFixed(2)}%)`
            ) : (
              '(0.00%)'
            )}
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Previous Close</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {pricePrefix}{(data.previousClose || (data.price - data.change)).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

const DASHBOARD_QUICK_LINKS = [
  {
    id: 'google-slides',
    label: 'Google Slides',
    href: 'https://docs.google.com/presentation/u/0/',
    Icon: Presentation,
    iconBg: 'bg-amber-500',
  },
  {
    id: 'topstep',
    label: 'TopStep',
    href: 'https://dashboard.topstep.com/dashboard/accounts',
    Icon: LineChart,
    iconBg: 'bg-sky-600',
  },
  {
    id: 'ftmo',
    label: 'FTMO',
    href: 'https://trader.ftmo.oanda.com/accounts-overview',
    Icon: BadgeDollarSign,
    iconBg: 'bg-emerald-600',
  },
  {
    id: 'x',
    label: 'X',
    href: 'https://x.com/home',
    Icon: Twitter,
    iconBg: 'bg-gray-900 dark:bg-gray-100',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    href: 'https://www.youtube.com',
    Icon: Youtube,
    iconBg: 'bg-red-600',
  },
];

function Dashboard() {
  // Default symbols with their display names and API symbols
  const defaultSymbols = [
    { display: 'QQQ', api: 'QQQ' },
    { display: 'SPY', api: 'SPY' },
    { display: 'DXY', api: 'DX-Y.NYB' },
    { display: 'VIX', api: '^VIX' },
  ];

  // Default world clocks
  const defaultWorldClocks = [
    { id: 'clock-ny', timezone: 'America/New_York', city: 'New York', country: 'United States' },
    { id: 'clock-london', timezone: 'Europe/London', city: 'London', country: 'United Kingdom' },
    { id: 'clock-tokyo', timezone: 'Asia/Tokyo', city: 'Tokyo', country: 'Japan' },
    { id: 'clock-sydney', timezone: 'Australia/Sydney', city: 'Sydney', country: 'Australia' },
  ];

  // Default section order
  const defaultSectionOrder = ['quick-links', 'world-clocks', 'market'];

  const { getItem, setItem } = useStorage();
  const [symbols, setSymbols] = useState(defaultSymbols);
  const [worldClocks, setWorldClocks] = useState(defaultWorldClocks);
  const [sectionOrder, setSectionOrder] = useState(defaultSectionOrder);

  const [stockData, setStockData] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [addingSymbol, setAddingSymbol] = useState(false);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    Promise.all([
      getItem(STORAGE_KEYS.DASHBOARD_SYMBOLS),
      getItem(STORAGE_KEYS.DASHBOARD_WORLD_CLOCKS),
      getItem(STORAGE_KEYS.DASHBOARD_SECTION_ORDER),
    ]).then(([sym, wc, so]) => {
      if (Array.isArray(sym) && sym.length > 0) setSymbols(sym);
      if (Array.isArray(wc) && wc.length > 0) setWorldClocks(wc);
      if (Array.isArray(so) && so.length > 0) {
        const filtered = so.filter((id) => id !== 'todo-list');
        if (filtered.length > 0) {
          const withQuickLinks = filtered.includes('quick-links')
            ? filtered
            : ['quick-links', ...filtered];
          setSectionOrder(withQuickLinks);
        }
      }
    });
  }, [getItem]);

  useEffect(() => {
    setItem(STORAGE_KEYS.DASHBOARD_WORLD_CLOCKS, worldClocks).catch(() => {});
  }, [worldClocks, setItem]);
  useEffect(() => {
    setItem(STORAGE_KEYS.DASHBOARD_SECTION_ORDER, sectionOrder).catch(() => {});
  }, [sectionOrder, setItem]);
  useEffect(() => {
    setItem(STORAGE_KEYS.DASHBOARD_SYMBOLS, symbols).catch(() => {});
  }, [symbols, setItem]);

  const loadStockData = async () => {
    setLoading(true);
    try {
      // Fetch all symbols in parallel with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 15000)
      );
      
      const dataPromises = symbols.map(symbolConfig => 
        getStockPrice(symbolConfig.api).then(data => ({
          ...data,
          displaySymbol: symbolConfig.display,
        })).catch(error => ({
          symbol: symbolConfig.display,
          displaySymbol: symbolConfig.display,
          price: null,
          change: 0,
          changePercent: 0,
          previousClose: 0,
          marketState: isMarketOpen() ? 'REGULAR' : 'CLOSED',
          error: 'Failed to fetch data. Please try again.',
        }))
      );
      
      const results = await Promise.race([
        Promise.all(dataPromises),
        timeoutPromise
      ]);
      
      // Convert results to object keyed by display symbol
      const dataMap = {};
      results.forEach((data, index) => {
        const displaySymbol = symbols[index].display;
        dataMap[displaySymbol] = {
          ...data,
          symbol: displaySymbol,
        };
      });
      
      setStockData(dataMap);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading stock data:', error);
      // Set error state for any missing data
      const errorData = {};
      symbols.forEach(symbolConfig => {
        if (!stockData[symbolConfig.display]) {
          errorData[symbolConfig.display] = {
            symbol: symbolConfig.display,
            price: null,
            change: 0,
            changePercent: 0,
            previousClose: 0,
            marketState: isMarketOpen() ? 'REGULAR' : 'CLOSED',
            error: 'Failed to fetch data. Please try again.',
          };
        }
      });
      setStockData(prev => ({ ...prev, ...errorData }));
    } finally {
      setLoading(false);
    }
  };

  const { generalSettings, refreshInterval } = useSettings();
  const autoRefresh = generalSettings?.autoRefresh ?? true;
  const showTooltips = generalSettings?.showTooltips ?? true;
  const intervalMs = (refreshInterval ?? 30) * 1000;

  useEffect(() => {
    loadStockData();
    if (!autoRefresh) return;
    const id = setInterval(loadStockData, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.length, autoRefresh, intervalMs]);

  const addSymbol = async () => {
    const symbolToAdd = newSymbolInput.trim().toUpperCase();
    if (!symbolToAdd) {
      return;
    }

    // Check if symbol already exists
    if (symbols.some(s => s.display === symbolToAdd || s.api === symbolToAdd)) {
      alert('Symbol already exists');
      setNewSymbolInput('');
      return;
    }

    setAddingSymbol(true);
    try {
      // Test if symbol is valid by trying to fetch it
      const testData = await getStockPrice(symbolToAdd);
      if (testData.error || testData.price === null) {
        alert(`Invalid symbol: ${symbolToAdd}. Please check the symbol and try again.`);
        setAddingSymbol(false);
        return;
      }

      // Add the symbol
      const newSymbol = { display: symbolToAdd, api: symbolToAdd };
      setSymbols([...symbols, newSymbol]);
      setNewSymbolInput('');
      
      // Immediately fetch data for the new symbol
      const newData = await getStockPrice(symbolToAdd);
      setStockData(prev => ({
        ...prev,
        [symbolToAdd]: {
          ...newData,
          symbol: symbolToAdd,
        },
      }));
    } catch (error) {
      console.error('Error adding symbol:', error);
      alert(`Failed to add symbol: ${symbolToAdd}. Please check the symbol and try again.`);
    } finally {
      setAddingSymbol(false);
    }
  };

  const removeSymbol = (displaySymbol) => {
    if (symbols.length <= 1) {
      alert('You must have at least one symbol on the dashboard');
      return;
    }
    setSymbols(symbols.filter(s => s.display !== displaySymbol));
    setStockData(prev => {
      const updated = { ...prev };
      delete updated[displaySymbol];
      return updated;
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !addingSymbol) {
      addSymbol();
    }
  };

  // Handle drag end for world clocks
  const handleWorldClocksDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWorldClocks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Handle drag end for stock cards
  const handleStockCardsDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSymbols((items) => {
        const oldIndex = items.findIndex((item) => item.display === active.id);
        const newIndex = items.findIndex((item) => item.display === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Handle drag end for sections
  const handleSectionsDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSectionOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Render sections based on order
  const renderSection = (sectionId) => {
    switch (sectionId) {
      case 'quick-links':
        return (
          <SortableSection key={sectionId} id={sectionId}>
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                Quick Links
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {DASHBOARD_QUICK_LINKS.map((link) => {
                  const { Icon } = link;
                  const iconIsLightOnDark = link.id === 'x';
                  return (
                    <a
                      key={link.id}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${link.label} in a new tab`}
                      className="group flex flex-col items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 text-center transition-colors hover:border-sky-400 dark:hover:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 min-h-[44px]"
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${link.iconBg} shadow-sm`}
                      >
                        <Icon
                          className={`h-5 w-5 ${iconIsLightOnDark ? 'text-white dark:text-gray-900' : 'text-white'}`}
                          aria-hidden
                        />
                      </span>
                      <span className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                        {link.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-500 group-hover:text-sky-400 dark:text-sky-400">
                        <ExternalLink className="h-3 w-3" aria-hidden />
                        Open
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </SortableSection>
        );
      case 'world-clocks':
        return (
          <SortableSection key={sectionId} id={sectionId}>
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">World Clocks</h2>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleWorldClocksDragEnd}
              >
                <SortableContext items={worldClocks.map((clock) => clock.id)}>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {worldClocks.map((clock) => (
                      <SortableWorldClock
                        key={clock.id}
                        id={clock.id}
                        timezone={clock.timezone}
                        city={clock.city}
                        country={clock.country}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </SortableSection>
        );
      case 'market':
        return (
          <SortableSection key={sectionId} id={sectionId}>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Market</h2>
                <div className="flex items-center gap-3">
                  {lastUpdate && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Last updated: {lastUpdate.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={loadStockData}
                    disabled={loading}
                    className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                  >
                    <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>
              
              {/* Add Symbol Input */}
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={newSymbolInput}
                  onChange={(e) => setNewSymbolInput(e.target.value.toUpperCase())}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter symbol (e.g., AAPL, TSLA, MSFT)"
                  disabled={addingSymbol}
                  className="flex-1 px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={addSymbol}
                  disabled={addingSymbol || !newSymbolInput.trim()}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingSymbol ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Symbol
                    </>
                  )}
                </button>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleStockCardsDragEnd}
              >
                <SortableContext items={symbols.map((s) => s.display)}>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {symbols.map((symbolConfig) => (
                      <SortableStockCard
                        key={symbolConfig.display}
                        id={symbolConfig.display}
                        symbol={symbolConfig.display}
                        data={stockData[symbolConfig.display] || null}
                        loading={loading && !stockData[symbolConfig.display]}
                        onRemove={symbols.length > 1 ? () => removeSymbol(symbolConfig.display) : null}
                        showTooltips={showTooltips}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </SortableSection>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 flex flex-col space-y-4">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <span className="font-medium text-gray-900 dark:text-white">Dashboard</span>
        </nav>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Real-time market data and world clocks</p>
      </div>

      {/* Sections in order with drag and drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionsDragEnd}
      >
        <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
          {sectionOrder.map((sectionId) => renderSection(sectionId))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

export default Dashboard;
