import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  children: ReactNode;
}

export function Panel({ title, children }: PanelProps) {
  return (
    <div className="rounded-lg border border-mempool-border bg-mempool-card p-4">
      {title && (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-300">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
