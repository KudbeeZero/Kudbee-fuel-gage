/**
 * THINKBOX-016A — Bottom Navigation
 *
 * Five persistent tabs. No hamburger menu for primary navigation.
 * Safe-area aware (Dynamic Island / Home Indicator).
 * Minimum 44x44px touch targets. Dark mode first.
 */

import { Home, Boxes, Terminal, Rocket, User } from 'lucide-react';

export type BottomNavTab = 'home' | 'thinkbox' | 'terminal' | 'control-tower' | 'profile';

interface BottomNavProps {
  active: BottomNavTab;
  onChange: (tab: BottomNavTab) => void;
}

const TABS: Array<{ id: BottomNavTab; icon: React.ComponentType<{ className?: string }>; label: string }> = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'thinkbox', icon: Boxes, label: 'THINKBOX' },
  { id: 'terminal', icon: Terminal, label: 'Terminal' },
  { id: 'control-tower', icon: Rocket, label: 'Tower' },
  { id: 'profile', icon: User, label: 'Profile' },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-slate-800/60 bg-slate-950/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="navigation"
      aria-label="Primary navigation"
    >
      <div className="flex items-center justify-around">
        {TABS.map(({ id, icon: Icon, label }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex flex-col items-center justify-center min-h-[56px] min-w-[64px] py-1 px-2 transition-colors ${
                isActive
                  ? 'text-emerald-400'
                  : 'text-slate-500 active:text-slate-300'
              }`}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : ''}`} />
              <span className={`text-[8px] font-mono mt-0.5 ${isActive ? 'text-emerald-400 font-bold' : 'text-slate-600'}`}>
                {label}
              </span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
