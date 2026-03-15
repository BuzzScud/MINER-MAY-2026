// EconomicCalendarWidget.jsx
// TradingView Economic Calendar Widget
// https://www.tradingview.com/widget-docs/widgets/calendars/economic-calendar/

import React, { useEffect, useRef, memo } from 'react';

function EconomicCalendarWidget({ width = "100%", height = 550, colorTheme = "dark" }) {
  const container = useRef();

  useEffect(() => {
    const el = container.current;
    if (!el || !document.body.contains(el)) return;

    el.innerHTML = '';
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: colorTheme,
      isTransparent: true,
      width: width,
      height: height,
      locale: "en",
      importanceFilter: "0,1",
      countryFilter: "ar,au,br,ca,cn,fr,de,in,id,it,jp,kr,mx,ru,sa,za,tr,gb,us,eu"
    });

    el.appendChild(widgetContainer);
    el.appendChild(script);

    return () => {
      const target = container.current;
      if (!target) return;
      // Delay clear so TradingView script (runs async) does not run after DOM is cleared
      setTimeout(() => {
        if (target.parentNode) target.innerHTML = '';
      }, 150);
    };
  }, [width, height, colorTheme]);

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: height, width: width }}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}

export default memo(EconomicCalendarWidget);
