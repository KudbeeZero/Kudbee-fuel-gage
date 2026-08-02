# THINKBOX Design System

**Version:** 1.0 | **PR:** THINKBOX-008

## Layout

### Page Structure
```
┌──────────────────────────────────────────────────────────┐
│ Header (breadcrumb + actions)                            │
├──────────┬───────────────────────────────────────────────┤
│ Left     │ Main Content                                  │
│ Rail     │                                               │
│ (256px)  │ Grid: 1-col (sm) / 2-col (md) / 3-col (lg)   │
│          │ Gap: 20px (5)                                 │
│          │                                               │
├──────────┴───────────────────────────────────────────────┤
│ WorkspaceStatusBar (h-10, full-width, border-t)          │
└──────────────────────────────────────────────────────────┘
```

## Spacing Scale
- `gap-1` (4px): Tight text lists, badge clusters
- `gap-2` (8px): Icon+text pairs, inline controls
- `gap-3` (12px): Card groups in grids
- `gap-5` (20px): Section spacing, grid gutters
- `p-3` (12px): Card padding
- `p-5` (20px): Section padding

## Card Pattern
```tsx
<div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
  <SectionHeader icon={Icon} title="Title" subtitle="Context" />
  {/* Content */}
</div>
```

## Section Header
```tsx
<div className="flex items-center gap-2 mb-3">
  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
    <Icon className="w-3.5 h-3.5 text-emerald-400" />
  </div>
  <div>
    <h3 className="font-display text-sm font-semibold text-slate-200">{title}</h3>
    {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
  </div>
</div>
```

## Color Semantics

| Color | Usage |
|:---|:---|
| `emerald` (green) | Success, healthy, complete, active agents |
| `amber` (yellow) | Warnings, simulation mode, pending approvals |
| `rose` (red) | Errors, failures, critical risks |
| `violet` (purple) | Mission, planning, memory, databases |
| `blue` (blue) | Info, CI, dependencies, runtime |
| `cyan` (teal) | Execution, graph, connections |
| `indigo` (indigo) | Plugins, engineering graph |
| `slate` (gray) | Inactive, empty, disabled, borders |

## Typography Scale

| Size | Usage |
|:---|:---|
| `text-xl` | Page titles |
| `text-sm` | Section headers |
| `text-xs` | Description text |
| `text-[11px]` | Terminal output |
| `text-[10px]` | List items, card content |
| `text-[9px]` | Badges, metadata |
| `text-[8px]` | Timestamps, fine print |

## Component States

Every interactive component must handle:
1. **Loading:** Show spinner or skeleton
2. **Empty:** Show descriptive empty state with CTA
3. **Error:** Show error message with retry button
4. **Success:** Show data

## Badge Pattern
```tsx
<span className="text-[9px] px-1.5 py-0.5 rounded-full border font-mono bg-{color}-500/10 text-{color}-400 border-{color}-500/20">
  {label}
</span>
```

## Progress Bar
```tsx
<div className="h-1.5 rounded-full bg-slate-800/60 overflow-hidden">
  <div className="h-full rounded-full bg-emerald-500/60 transition-all" style={{ width: `${percent}%` }} />
</div>
```

## Interactive States

| Element | Default | Hover | Active/Selected |
|:---|:---|:---|:---|
| Button | `bg-slate-800/30` | `hover:bg-slate-800/40` | `bg-emerald-500/10 border-emerald` |
| List Item | `bg-slate-950/40` | `hover:bg-slate-800/20` | `border-emerald-500/30 bg-emerald-500/5` |
| Input | `bg-slate-800/50 border-slate-700/50` | — | `focus:border-emerald-500/30` |

## Keyboard Navigation
- `Ctrl+Shift+D`: Toggle Developer Overlay
- `Esc`: Close modals, overlays
- `Tab`: Navigate between interactive elements
- `Arrow Up/Down`: Navigate command history in terminal

## Responsive Breakpoints
- `sm` (640px): 2-column grids
- `lg` (1024px): 3-column grids, left rail visible
- Left rail auto-collapses below `lg`
