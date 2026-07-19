import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

function ProgressRing({ percentage, label, sublabel, colorClass, strokeClass }: { percentage: number, label: string, sublabel: string, colorClass: string, strokeClass: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-950 rounded-xl border border-slate-800/50 text-center sm:text-left">
      <div className="relative flex items-center justify-center shrink-0">
        <svg className="w-20 h-20 transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            className="text-slate-800"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${strokeClass} transition-all duration-1000 ease-out`}
          />
        </svg>
        <div className={`absolute font-mono text-sm font-semibold tracking-tighter ${colorClass} drop-shadow-[0_0_6px_rgba(52,211,153,0.15)]`}>
          {percentage}%
        </div>
      </div>
      <div>
        <div className="font-medium text-slate-200">{label}</div>
        <div className="text-xs text-slate-500 mt-1">{sublabel}</div>
      </div>
    </div>
  );
}

export function SubscriptionMeter() {
  // Start at an arbitrary time: 2 hours, 43 minutes, 17 seconds left
  const [timeLeft, setTimeLeft] = useState(2 * 3600 + 43 * 60 + 17); 

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 5 * 3600));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-full flex flex-col">
      <h2 className="font-display text-lg font-semibold text-slate-200 mb-6">Subscription Health</h2>
      
      <div className="space-y-4 mb-8">
        <ProgressRing 
          percentage={65} 
          label="Cursor Pro" 
          sublabel="325 fast requests remaining"
          colorClass="text-blue-400"
          strokeClass="text-blue-500"
        />
        <ProgressRing 
          percentage={40} 
          label="Claude Pro" 
          sublabel="Message limit approaching"
          colorClass="text-orange-400"
          strokeClass="text-orange-500"
        />
      </div>

      <div className="mt-auto border-t border-slate-800/60 pt-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Timer className="w-4 h-4" />
            <span>Rolling Limit Reset In</span>
          </div>
        </div>
        <div className="font-mono text-4xl font-light text-slate-200 tracking-tight">
          {timeString}
        </div>
      </div>
    </div>
  );
}
