import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const SIZE_CLASS = {
  md: 'max-w-md',
  lg: 'max-w-3xl',
  xl: 'max-w-6xl',
};

export default function AppModalShell({
  open,
  onClose,
  title,
  children,
  size = 'lg',
  dark = false,
  footer = null,
}) {
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const shellClass = dark
    ? 'bg-[#121212] border-white/10 text-gray-100'
    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white';

  const headerBorder = dark ? 'border-white/10' : 'border-gray-200 dark:border-gray-700';
  const closeButtonClass = dark
    ? 'text-gray-400 hover:text-gray-100 hover:bg-white/10'
    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={`relative flex flex-col w-full min-w-[280px] ${SIZE_CLASS[size] ?? SIZE_CLASS.lg} max-h-[min(90vh,900px)] rounded-lg shadow-xl border overflow-hidden ${shellClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${headerBorder}`}>
          <h2 id={titleId} className="text-sm font-semibold truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded transition-colors ${closeButtonClass}`}
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer && (
          <div className={`shrink-0 px-4 py-3 border-t ${headerBorder}`}>{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
