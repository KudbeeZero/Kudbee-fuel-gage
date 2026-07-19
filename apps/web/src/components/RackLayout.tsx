/**
 * apps/web/src/components/RackLayout.tsx
 * ---------------------------------------------------------------------------
 * The "motherboard": a highly structured 12-column responsive CSS Grid that
 * hosts the Agentic Rack plugins. Each child carries a `data-col-span` so the
 * rack maps it to `grid-column: span N`. On small viewports the grid collapses
 * to a single column (plugins stack vertically) for graceful degradation.
 *
 * Strictly typed — no `any`.
 */
import type { ReactNode } from 'react';

export const RACK_COLUMNS = 12;

export interface RackSlot {
  id: string;
  colSpan: number;
  node: ReactNode;
}

interface RackLayoutProps {
  slots: RackSlot[];
  columns?: number;
  className?: string;
}

export function RackLayout({ slots, columns = RACK_COLUMNS, className = '' }: RackLayoutProps) {
  return (
    <section
      aria-label="Agentic Rack System"
      className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-${columns} ${className}`}
    >
      {slots.map((slot) => (
        <div
          key={slot.id}
          data-rack-slot={slot.id}
          style={{ gridColumn: `span ${Math.min(slot.colSpan, columns)} / span ${Math.min(slot.colSpan, columns)}` }}
          className="min-w-0"
        >
          {slot.node}
        </div>
      ))}
    </section>
  );
}

export default RackLayout;
