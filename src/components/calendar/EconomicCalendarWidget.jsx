// EconomicCalendarWidget.jsx
// TradingView Economic Calendar Widget
// https://www.tradingview.com/widget-docs/widgets/calendars/economic-calendar/

import React, { useEffect, useRef, memo } from 'react';

function EconomicCalendarWidget({ width = "100%", height = 550, colorTheme = "dark" }) {
  const container = useRef();

  useEffect(() => {
    const mountNode = container.current;
    if (!mountNode || !document.body.contains(mountNode)) return;

    // In React StrictMode (dev), effects mount/unmount twice. Delay insertion so
    // the first transient mount is cancelled before loading TradingView script.
    const initTimerId = window.setTimeout(() => {
      if (!container.current || !document.body.contains(container.current)) return;

      const widgetContainer = document.createElement("div");
      widgetContainer.className = "tradingview-widget-container__widget";

      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
      script.type = "text/javascript";
      script.async = true;
      script.textContent = JSON.stringify({
        colorTheme,
        isTransparent: true,
        width,
        height,
        locale: "en",
        importanceFilter: "0,1",
        countryFilter: "ar,au,br,ca,cn,fr,de,in,id,it,jp,kr,mx,ru,sa,za,tr,gb,us,eu",
      });

      container.current.replaceChildren(widgetContainer, script);
    }, 0);

    return () => {
      window.clearTimeout(initTimerId);
    };
  }, [width, height, colorTheme]);

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: height, width: width }}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}

export default memo(EconomicCalendarWidget);
