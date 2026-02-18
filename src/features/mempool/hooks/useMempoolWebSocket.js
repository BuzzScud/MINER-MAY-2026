import { useEffect, useRef, useState } from 'react';

const WS_URL = 'wss://mempool.space/api/v1/ws';

export function useMempoolWebSocket() {
  const [chartData, setChartData] = useState([]);
  const [mempoolInfo, setMempoolInfo] = useState(null);
  const [fees, setFees] = useState(null);
  const [connected, setConnected] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let ws;
    let reconnectTimeout;

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        if (cancelledRef.current) {
          ws.close();
          return;
        }
        setConnected(true);
        ws.send(JSON.stringify({
          action: 'want',
          data: ['live-2h-chart', 'stats', 'mempool-blocks'],
        }));
      };

      ws.onmessage = (event) => {
        if (cancelledRef.current) return;
        try {
          const data = JSON.parse(event.data);

          const vBytesPerSecond = data['live-2h-chart']?.vBytesPerSecond ?? data.vBytesPerSecond;
          if (Array.isArray(vBytesPerSecond)) {
            const now = Math.floor(Date.now() / 1000);
            const points = vBytesPerSecond.map((value, index) => ({
              time: now - (vBytesPerSecond.length - index),
              value,
            }));
            setChartData(points);
          } else if (typeof vBytesPerSecond === 'number') {
            setChartData((prev) => {
              const now = Math.floor(Date.now() / 1000);
              const updated = [...prev.slice(-7199), { time: now, value: vBytesPerSecond }];
              return updated.length > 1 ? updated : [{ time: now, value: vBytesPerSecond }];
            });
          }

          if (data.mempoolInfo) {
            setMempoolInfo({
              loaded: data.mempoolInfo.loaded ?? false,
              size: data.mempoolInfo.size ?? 0,
              bytes: data.mempoolInfo.bytes ?? 0,
              usage: data.mempoolInfo.usage ?? 0,
              maxmempool: data.mempoolInfo.maxmempool ?? 300000000,
              mempoolminfee: data.mempoolInfo.mempoolminfee ?? 0,
            });
          }

          if (data.fees) {
            setFees({
              fastestFee: data.fees.fastestFee ?? 0,
              halfHourFee: data.fees.halfHourFee ?? 0,
              hourFee: data.fees.hourFee ?? 0,
              economyFee: data.fees.economyFee ?? 0,
              minimumFee: data.fees.minimumFee ?? 0,
            });
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (cancelledRef.current) return;
        setConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelledRef.current = true;
      clearTimeout(reconnectTimeout);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  return {
    chartData,
    mempoolInfo,
    fees,
    connected,
  };
}
