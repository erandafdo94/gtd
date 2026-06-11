/* Focus Router — Console redesign
 *
 * TypeScript port of FocusRouter.jsx from the design bundle. All routing,
 * timer, persistence, and visual presentation is preserved from the design.
 * State persists to localStorage under "focus-router-v1".
 */

import {
  useState, useEffect, useRef, useMemo,
  type CSSProperties, type ReactNode, Fragment,
} from 'react'

/* =====================================================================
   TYPES
   ===================================================================== */
type Energy = 'Low' | 'Med' | 'High'
type Phase = 'idle' | 'work' | 'outcome' | 'break'
type Layout = 'Paired' | 'Stacked' | 'Split'
type WidgetId = 'word' | 'tip' | 'book' | 'habit' | 'btc' | 'stats'
type Outcome = 'complete' | 'partial' | 'distracted'

type Task = {
  id: string
  title: string
  mins: number
  energy: Energy
  basketId: string | null
  done: boolean
  createdAt: number
  doneAt?: number
}

type Basket = { id: string; name: string }

type DayStats = {
  pomos: number
  mins: number
  complete: number
  partial: number
  distracted: number
}

type Habit = { name: string; days: Record<string, boolean> }

type Tweaks = { layout: Layout; accent: string }

type State = {
  tasks: Task[]
  baskets: Basket[]
  widgets: Record<WidgetId, boolean>
  habit: Habit
  stats: Record<string, DayStats>
  tweaks: Tweaks
}

type TimerState = {
  phase: Phase
  taskId: string | null
  left: number
  total: number
  running: boolean
  /** Wall-clock deadline (ms epoch) while running; null when paused/idle.
   *  The tick recomputes `left` from this, so a tab that was throttled in
   *  the background snaps to the correct time instead of drifting. */
  endsAt: number | null
}

/* =====================================================================
   PALETTE + TYPE RAMP
   ===================================================================== */
const c = {
  bg: 'var(--bg)', bgDeep: 'var(--bg-deep)',
  surface: 'var(--surface)', surface2: 'var(--surface-2)', surface3: 'var(--surface-3)',
  hair: 'var(--hair)', line: 'var(--line)',
  text: 'var(--text)', text2: 'var(--text-2)', dim: 'var(--dim)', faint: 'var(--faint)',
  accent: 'var(--accent)', accent2: 'var(--accent-2)', accentInk: 'var(--accent-ink)',
  accentSoft: 'var(--accent-soft)', accentLine: 'var(--accent-line)', accentGlow: 'var(--accent-glow)',
  up: 'var(--up)', down: 'var(--down)',
}
const mono: CSSProperties = { fontFamily: 'var(--mono)' }
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, huge: 40 }

const T = {
  kicker:     { fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const },
  metaMono:   { ...mono, fontSize: 11, letterSpacing: '0.01em' } as CSSProperties,
  body:       { fontSize: 14, fontWeight: 400, lineHeight: 1.55 } as CSSProperties,
  bodyStrong: { fontSize: 14, fontWeight: 600, lineHeight: 1.45 } as CSSProperties,
  taskTitle:  { fontSize: 15, fontWeight: 500, letterSpacing: '-0.005em' } as CSSProperties,
  suggestion: { fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.08 } as CSSProperties,
  statNum:    { ...mono, fontSize: 27, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 } as CSSProperties,
  word:       { fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' } as CSSProperties,
}

/* =====================================================================
   DAILY CONTENT
   ===================================================================== */
const WORDS: [string, string][] = [
  ['sonder', 'the realization that each passerby has a life as vivid as your own'],
  ['meraki', 'to do something with soul, creativity, or love'],
  ['kaizen', 'continuous improvement through small, steady changes'],
  ['ikigai', 'a reason for being; what gets you up in the morning'],
  ['sisu', 'stoic determination and grit in the face of adversity'],
  ['wabi-sabi', 'finding beauty in imperfection and impermanence'],
  ['flow', 'complete absorption in an activity; time disappears'],
]
const TIPS = [
  'Park downhill: end each session by writing the very next step, so restarting is free.',
  'If a task takes under 2 minutes, do it now instead of adding it.',
  'Phone in another room beats willpower every time.',
  'Batch your admin — context switching costs ~20 minutes per switch.',
  "Decide tomorrow's first task tonight. Mornings are for doing, not choosing.",
  'One tab. The rest are bookmarks for future-you.',
  'Tired ≠ done. Tired = switch to low-energy tasks.',
]
const BOOKS: [string, string][] = [
  ['Deep Work', 'Cal Newport'],
  ['Atomic Habits', 'James Clear'],
  ['The Almanack of Naval Ravikant', 'Eric Jorgenson'],
  ['Four Thousand Weeks', 'Oliver Burkeman'],
  ['Essentialism', 'Greg McKeown'],
  ['Make Time', 'Knapp & Zeratsky'],
  ["So Good They Can't Ignore You", 'Cal Newport'],
]

const ENERGIES: Energy[] = ['Low', 'Med', 'High']
const ACCENT_OPTIONS = ['#ff5a36', '#4f8cff', '#2ad17f', '#9a6bff']
const LAYOUT_OPTIONS: Layout[] = ['Paired', 'Stacked', 'Split']

const STORAGE_KEY = 'focus-router-v1'

const DEFAULT_STATE: State = {
  tasks: [],
  // Fresh installs start with no baskets — create your own in the Projects
  // tab. (The design prototype shipped its author's personal baskets here.)
  baskets: [],
  widgets: { word: true, tip: true, book: false, habit: true, btc: true, stats: true },
  habit: { name: 'Read 20 min', days: {} },
  stats: {},
  tweaks: { layout: 'Paired', accent: '#ff5a36' },
}

/* =====================================================================
   HELPERS
   ===================================================================== */
const uid = () => Math.random().toString(36).slice(2, 9)
// Local-date key (YYYY-MM-DD). toISOString() would use UTC, which flips the
// "day" at the wrong local hour — stats and habit streaks would roll over at
// e.g. noon for UTC+12 users.
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayKey = () => dateKey(new Date())
const dayIndex = () => {
  const d = new Date()
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000)
}
const daysOld = (ts: number) => Math.floor((Date.now() - ts) / 86400000)
const defaultEnergy = (): Energy => {
  const h = new Date().getHours()
  if (h >= 6 && h < 12) return 'High'
  if (h >= 12 && h < 15) return 'Low'
  return 'Med'
}
const fmtClock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const E_SCORE: Record<Energy, number> = { Low: 0, Med: 1, High: 2 }

const ZERO_DAY: DayStats = { pomos: 0, mins: 0, complete: 0, partial: 0, distracted: 0 }

/* =====================================================================
   BRAND MARK
   ===================================================================== */
function Mark({ size = 30 }: { size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 9, background: c.accent, display: 'grid', placeItems: 'center',
      boxShadow: '0 0 18px -4px var(--accent-glow)', flexShrink: 0,
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="6.5" stroke="var(--accent-ink)" strokeWidth="2" />
        <circle cx="9" cy="9" r="2" fill="var(--accent-ink)" />
      </svg>
    </span>
  )
}

/* =====================================================================
   PANEL / CARD
   ===================================================================== */
function Card({
  label, right, children, style, dim, glow, className,
}: {
  label?: ReactNode
  right?: ReactNode
  children?: ReactNode
  style?: CSSProperties
  dim?: boolean
  glow?: boolean
  className?: string
}) {
  return (
    <section
      className={className}
      style={{
        position: 'relative',
        background: c.surface,
        border: `1px solid ${glow ? c.accentLine : c.hair}`,
        borderRadius: 'var(--r-card)',
        boxShadow: glow
          ? 'var(--shadow-lift), 0 0 44px -10px var(--accent-glow)'
          : 'var(--shadow)',
        padding: 18,
        opacity: dim ? 0.22 : 1,
        filter: dim ? 'blur(2px) saturate(0.7)' : 'none',
        transform: dim ? 'scale(0.985)' : 'none',
        pointerEvents: dim ? 'none' : 'auto',
        transition:
          'opacity .5s cubic-bezier(.4,0,.2,1), filter .5s cubic-bezier(.4,0,.2,1), transform .45s cubic-bezier(.4,0,.2,1), box-shadow .45s ease, border-color .45s ease',
        zIndex: 1,
        ...style,
      }}
    >
      {label && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: glow ? c.accent : c.accentLine, flexShrink: 0 }} />
          <span style={{ ...T.kicker, color: glow ? c.accent : c.dim }}>{label}</span>
          <span style={{ flex: 1 }} />
          {right && <span style={{ ...T.metaMono, color: c.faint }}>{right}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

/* =====================================================================
   BUTTON
   ===================================================================== */
type BtnVariant = 'primary' | 'neutral' | 'outline' | 'ghost' | 'soft'

function Btn({
  children, onClick, variant = 'neutral', size = 'md', style, disabled, title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: BtnVariant
  size?: 'sm' | 'md'
  style?: CSSProperties
  disabled?: boolean
  title?: string
}) {
  const base: CSSProperties = {
    fontFamily: 'var(--sans)', fontSize: size === 'sm' ? 12 : 13, fontWeight: 600,
    letterSpacing: '0.005em', borderRadius: 'var(--r-ctrl)',
    padding: size === 'sm' ? '8px 13px' : '11px 17px',
    display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center',
    border: '1px solid transparent', whiteSpace: 'nowrap',
  }
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: { background: c.accent, color: c.accentInk, boxShadow: '0 0 22px -6px var(--accent-glow)' },
    neutral: { background: c.surface2, color: c.text, borderColor: c.hair },
    outline: { background: 'transparent', color: c.text2, borderColor: c.line },
    ghost:   { background: 'transparent', color: c.dim },
    soft:    { background: c.accentSoft, color: c.accent, borderColor: c.accentLine },
  }
  const dis: CSSProperties | null = disabled ? { opacity: 0.4, pointerEvents: 'none' } : null
  return (
    <button
      className="fr-btn"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...(dis ?? {}), ...style }}
    >
      {children}
    </button>
  )
}

/* =====================================================================
   CHIP / TAG / SEGMENTED / TOGGLE
   ===================================================================== */
function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      className={onClick ? 'fr-chip' : undefined}
      onClick={onClick}
      disabled={!onClick}
      style={{
        fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.005em',
        borderRadius: 999, padding: '7px 13px',
        border: `1px solid ${active ? c.accentLine : c.hair}`,
        background: active ? c.accentSoft : 'transparent',
        color: active ? c.accent : c.dim, whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </button>
  )
}

function Tag({ children, tone }: { children: ReactNode; tone?: 'accent' }) {
  return (
    <span style={{
      ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.01em',
      borderRadius: 7, padding: '3px 8px', background: c.surface2,
      color: tone === 'accent' ? c.accent : c.dim, whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</span>
  )
}

function Segmented<O extends string>({
  options, value, onChange,
}: {
  options: readonly O[]
  value: O
  onChange: (v: O) => void
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 3, padding: 3, background: c.surface2, borderRadius: 999, border: `1px solid ${c.hair}` }}>
      {options.map(o => {
        const on = value === o
        return (
          <button key={o} className="fr-press" onClick={() => onChange(o)} style={{
            fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.01em',
            borderRadius: 999, padding: '7px 16px', border: 'none',
            background: on ? c.accent : 'transparent',
            color: on ? c.accentInk : c.dim,
            boxShadow: on ? '0 0 16px -6px var(--accent-glow)' : 'none',
            transition: 'background .16s ease, color .16s ease',
          }}>{o}</button>
        )
      })}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      width: 40, height: 23, borderRadius: 999, padding: 0, position: 'relative', flexShrink: 0,
      background: on ? c.accent : c.surface3,
      border: `1px solid ${on ? c.accentLine : c.hair}`,
      transition: 'background .18s ease, border-color .18s ease',
    }}>
      <span style={{
        width: 17, height: 17, borderRadius: '50%',
        background: on ? c.accentInk : c.dim,
        position: 'absolute', top: 2, left: on ? 20 : 2,
        transition: 'left .18s cubic-bezier(.4,0,.2,1)',
      }} />
    </button>
  )
}

/* =====================================================================
   TIMER RING
   ===================================================================== */
function TimerRing({
  size = 200, stroke = 7, progress = 0, mode = 'work', children,
}: {
  size?: number
  stroke?: number
  progress?: number
  mode?: 'work' | 'break' | 'idle'
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const remaining = Math.max(0, Math.min(1, 1 - progress))
  const isIdle = mode === 'idle'
  const isBreak = mode === 'break'
  const arc = isBreak ? c.text2 : c.accent
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {!isIdle && !isBreak && (
        <div style={{
          position: 'absolute', inset: '16%', borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent-soft), transparent 70%)',
        }} />
      )}
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block', position: 'relative' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={c.surface3} strokeWidth={stroke}
          strokeDasharray={isBreak ? '1.5 11' : undefined}
          strokeLinecap={isBreak ? 'round' : 'butt'}
        />
        {!isIdle && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={arc} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - remaining)}
            style={{ transition: 'stroke-dashoffset 1s linear', filter: isBreak ? 'none' : 'drop-shadow(0 0 7px var(--accent-glow))' }}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  )
}

/* =====================================================================
   OUTCOME BUTTON
   ===================================================================== */
function OutcomeButton({
  glyph, label, sub, variant, onClick,
}: {
  glyph: string
  label: string
  sub: string
  variant: Outcome
  onClick: () => void
}) {
  const map: Record<Outcome, {
    bg: string; fg: string; sub: string; bd: string; ib: string; ig: string; glow: string
  }> = {
    complete:   { bg: c.accent,    fg: c.accentInk, sub: 'rgba(11,12,15,0.62)', bd: 'transparent', ib: 'rgba(11,12,15,0.18)', ig: c.accentInk, glow: '0 0 26px -6px var(--accent-glow)' },
    partial:    { bg: c.surface2,  fg: c.text,      sub: c.dim,                 bd: c.hair,        ib: c.surface3,            ig: c.text2,     glow: 'none' },
    distracted: { bg: 'transparent', fg: c.text2,   sub: c.faint,               bd: c.hair,        ib: 'transparent',         ig: c.dim,       glow: 'none' },
  }
  const s = map[variant]
  return (
    <button className="fr-btn" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 13, width: '100%',
      minHeight: 58, padding: '0 16px', textAlign: 'left',
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      borderRadius: 'var(--r-ctrl)', boxShadow: s.glow,
    }}>
      <span style={{
        width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 9,
        background: s.ib, color: s.ig,
        border: variant === 'distracted' ? `1px solid ${c.hair}` : 'none',
        fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700,
      }}>{glyph}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span style={{ ...mono, fontSize: 10.5, color: s.sub }}>{sub}</span>
      </span>
      <span style={{ fontSize: 15, opacity: variant === 'complete' ? 0.85 : 0.4 }}>→</span>
    </button>
  )
}

/* =====================================================================
   STATS
   ===================================================================== */
function StatsChart({ days, max }: { days: { k: string; label: string; v: number }[]; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 96, paddingTop: 16 }}>
      {days.map((d, i) => {
        const isToday = i === days.length - 1
        const has = d.v > 0
        const h = Math.max(3, Math.round((d.v / max) * 74))
        return (
          <div key={d.k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ ...mono, fontSize: 9.5, color: isToday ? c.accent : c.faint, fontWeight: 700, fontVariantNumeric: 'tabular-nums', opacity: has ? 1 : 0 }}>{d.v}</span>
            <div style={{
              width: '100%', maxWidth: 30, height: h, borderRadius: '5px 5px 2px 2px',
              background: isToday ? c.accent : (has ? c.surface3 : c.hair),
              boxShadow: isToday ? '0 0 16px -4px var(--accent-glow)' : 'none',
              transition: 'height .45s cubic-bezier(.2,.7,.2,1)',
            }} />
            <span style={{ ...mono, fontSize: 9.5, color: isToday ? c.text2 : c.faint, fontWeight: isToday ? 700 : 400 }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function StatBlock({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 64 }}>
      <span style={{ ...T.statNum, color: accent ? c.accent : c.text }}>{value}</span>
      <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

/* =====================================================================
   ATOMS
   ===================================================================== */
function CheckBox({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="fr-press" aria-pressed={done} style={{
      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
      border: `1.5px solid ${done ? c.accent : c.line}`,
      background: done ? c.accent : 'transparent', color: c.accentInk,
      display: 'grid', placeItems: 'center',
      fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
      transition: 'all .15s ease',
    }}>{done ? '✓' : ''}</button>
  )
}

function MoveSelect({ onChange, children }: { onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      className="fr-sel"
      onChange={(e) => onChange(e.target.value)}
      value=""
      style={{
        ...mono, fontSize: 11, border: `1px solid ${c.hair}`, background: c.surface2, color: c.dim,
        borderRadius: 7, padding: '6px 7px', cursor: 'pointer', appearance: 'none',
      }}
    >{children}</select>
  )
}

/* =====================================================================
   APP
   ===================================================================== */
export default function App() {
  const [state, setState] = useState<State>(DEFAULT_STATE)
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<'today' | 'projects'>('today')
  const [customize, setCustomize] = useState(false)

  // quick add
  const [input, setInput] = useState('')
  const [addMins, setAddMins] = useState<number>(25)
  const [addEnergy, setAddEnergy] = useState<Energy>('Med')
  const [addDest, setAddDest] = useState<string>('inbox')

  // router / timer
  const [energy, setEnergy] = useState<Energy>(defaultEnergy())
  const [skipped, setSkipped] = useState<string[]>([])
  const [timer, setTimer] = useState<TimerState>({ phase: 'idle', taskId: null, left: 0, total: 0, running: false, endsAt: null })
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // btc
  const [btc, setBtc] = useState<{ p?: number; c?: number; err?: boolean } | null>(null)

  // baskets / projects tab
  const [newBasket, setNewBasket] = useState('')
  const [basketInputs, setBasketInputs] = useState<Record<string, string>>({})

  /* ----- persistence ----- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>
        // One-time cleanup: earlier builds shipped the design prototype's
        // personal demo baskets as defaults and persisted them. Drop any of
        // them that hold no tasks; ones the user actually used are kept.
        const DEMO: Record<string, string> = { b1: 'SaaS / GA4', b2: 'NZ move', b3: 'Learning' }
        const tasks = parsed.tasks ?? []
        const baskets = (parsed.baskets ?? []).filter(b =>
          DEMO[b.id] !== b.name || tasks.some(t => t.basketId === b.id))
        setState(s => ({
          ...DEFAULT_STATE,
          ...parsed,
          baskets,
          widgets: { ...DEFAULT_STATE.widgets, ...(parsed.widgets ?? {}) },
          habit: { ...DEFAULT_STATE.habit, ...(parsed.habit ?? {}) },
          tweaks: { ...DEFAULT_STATE.tweaks, ...(parsed.tweaks ?? {}) },
          stats: parsed.stats ?? s.stats,
        }))
      }
    } catch { /* first run */ }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) { console.error(e) }
    }, 400)
    return () => clearTimeout(t)
  }, [state, loaded])

  /* ----- btc fetch ----- */
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')
      .then(r => r.json())
      .then((d: { bitcoin: { usd: number; usd_24h_change: number } }) =>
        setBtc({ p: d.bitcoin.usd, c: d.bitcoin.usd_24h_change }))
      .catch(() => setBtc({ err: true }))
  }, [])

  /* ----- apply accent to CSS vars ----- */
  useEffect(() => {
    const a = state.tweaks.accent || '#ff5a36'
    const r = document.documentElement.style
    r.setProperty('--accent', a)
    r.setProperty('--accent-2', a)
    r.setProperty('--accent-soft', a + '22')
    r.setProperty('--accent-line', a + '59')
    r.setProperty('--accent-glow', a + '73')
  }, [state.tweaks.accent])

  /* ----- timer engine ----- */
  // `left` is recomputed from the wall-clock deadline on every tick (and on
  // tab-visibility change), so background-tab timer throttling can't drift it.
  useEffect(() => {
    const sync = () =>
      setTimer(t => {
        if (!t.running || t.endsAt === null) return t
        const left = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000))
        return left === t.left ? t : { ...t, left }
      })
    if (timer.running && timer.left > 0) {
      tickRef.current = setTimeout(sync, 1000)
      document.addEventListener('visibilitychange', sync)
    } else if (timer.running && timer.left === 0) {
      if (timer.phase === 'work') setTimer(t => ({ ...t, phase: 'outcome', running: false, endsAt: null }))
      if (timer.phase === 'break') setTimer({ phase: 'idle', taskId: null, left: 0, total: 0, running: false, endsAt: null })
    }
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [timer])

  /* ----- derived ----- */
  const openTasks = state.tasks.filter(t => !t.done)
  const inbox = state.tasks.filter(t => !t.basketId)

  const suggestion = useMemo(() => {
    const pool = openTasks.filter(t => !skipped.includes(t.id) && t.id !== timer.taskId)
    if (!pool.length) return null
    const scored = pool.map(t => {
      let s = 0
      const gap = Math.abs(E_SCORE[t.energy] - E_SCORE[energy])
      s += (2 - gap) * 100
      if (!t.basketId) s += 30
      s += Math.min(daysOld(t.createdAt), 10) * 3
      return { t, s }
    }).sort((a, b) => b.s - a.s)
    const best = scored[0].t
    const basket = state.baskets.find(b => b.id === best.basketId)
    const why = [
      `${best.mins}m`,
      best.energy + ' energy',
      basket ? `from "${basket.name}"` : 'inbox',
      daysOld(best.createdAt) > 0 ? `${daysOld(best.createdAt)}d old` : 'added today',
    ]
    return { task: best, why }
  }, [state.tasks, skipped, energy, timer.taskId, state.baskets, openTasks])

  const tStats = state.stats[todayKey()] ?? ZERO_DAY

  /* ----- actions ----- */
  const addTask = () => {
    let title = input.trim()
    if (!title) return
    let basketId: string | null = addDest === 'inbox' ? null : addDest
    // The selected destination may have been deleted in the Projects tab —
    // a dead basketId would make the task invisible (not in inbox, not in
    // any basket). Fall back to inbox.
    if (basketId && !state.baskets.some(b => b.id === basketId)) basketId = null
    const hash = title.match(/#(\S+)/)
    if (hash) {
      const b = state.baskets.find(x => x.name.toLowerCase().includes(hash[1].toLowerCase()))
      if (b) { basketId = b.id; title = title.replace(hash[0], '').trim() }
    }
    setState(s => ({
      ...s,
      tasks: [...s.tasks, { id: uid(), title, mins: addMins, energy: addEnergy, basketId, done: false, createdAt: Date.now() }],
    }))
    setInput('')
  }

  const toggleDone = (id: string) =>
    setState(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === id
        ? { ...t, done: !t.done, doneAt: t.done ? undefined : Date.now() }
        : t),
    }))

  const removeTask = (id: string) =>
    setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }))

  const moveTask = (id: string, basketId: string | null) =>
    setState(s => ({ ...s, tasks: s.tasks.map(t => (t.id === id ? { ...t, basketId } : t)) }))

  const startTask = (task: Task) =>
    setTimer({
      phase: 'work', taskId: task.id, left: task.mins * 60, total: task.mins * 60,
      running: true, endsAt: Date.now() + task.mins * 60 * 1000,
    })

  const recordOutcome = (kind: Outcome) => {
    const task = state.tasks.find(t => t.id === timer.taskId)
    // Log time actually focused, not the block length — "End early" after
    // 2 minutes of a 60m block should not credit 60 focus minutes.
    const minsDone = Math.round((timer.total - timer.left) / 60)
    setState(s => {
      const d: DayStats = { ...(s.stats[todayKey()] ?? ZERO_DAY) }
      d.pomos += 1
      d.mins += minsDone
      d[kind] += 1
      let tasks = s.tasks
      if (kind === 'complete' && task) {
        tasks = tasks.map(t => (t.id === task.id ? { ...t, done: true, doneAt: Date.now() } : t))
      }
      return { ...s, stats: { ...s.stats, [todayKey()]: d }, tasks }
    })
    if (kind === 'distracted' && energy !== 'Low') {
      setEnergy(E_SCORE[energy] === 2 ? 'Med' : 'Low')
    }
    setTimer({ phase: 'break', taskId: null, left: 5 * 60, total: 5 * 60, running: true, endsAt: Date.now() + 5 * 60 * 1000 })
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `focus-router-${todayKey()}.json`
    a.click()
  }

  const habitDoneToday = !!state.habit.days[todayKey()]
  const toggleHabit = () => setState(s => ({
    ...s,
    habit: { ...s.habit, days: { ...s.habit.days, [todayKey()]: !habitDoneToday } },
  }))

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const k = dateKey(d)
    return {
      k,
      label: d.toLocaleDateString('en', { weekday: 'narrow' }),
      v: state.stats[k]?.mins ?? 0,
      habit: !!state.habit.days[k],
    }
  })
  const maxMins = Math.max(...last7.map(d => d.v), 1)

  const inFocus = timer.phase === 'work' && timer.running
  const di = dayIndex()
  const currentTask = state.tasks.find(t => t.id === timer.taskId) ?? null
  const progress = timer.total ? (timer.total - timer.left) / timer.total : 0

  const setTweak = <K extends keyof Tweaks>(key: K, value: Tweaks[K]) =>
    setState(s => ({ ...s, tweaks: { ...s.tweaks, [key]: value } }))

  const toggleWidget = (id: WidgetId) =>
    setState(s => ({ ...s, widgets: { ...s.widgets, [id]: !s.widgets[id] } }))

  if (!loaded) {
    return <div style={{ ...mono, padding: 44, color: c.dim, fontSize: 12, letterSpacing: '0.08em' }}>loading…</div>
  }

  /* ----- inline style snippets ----- */
  const fieldStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 220,
    border: `1px solid ${c.hair}`, borderRadius: 'var(--r-ctrl)',
    background: c.surface2, padding: '0 12px',
  }
  const inputStyle: CSSProperties = {
    flex: 1, border: 'none', background: 'transparent', color: c.text,
    fontSize: 14, padding: '13px 0', outline: 'none', fontFamily: 'var(--sans)',
  }

  /* ----- inbox row ----- */
  const inboxRow = (t: Task) => {
    const age = daysOld(t.createdAt)
    const aged = age >= 3 && !t.done
    return (
      <div key={t.id} className="fr-row" style={{
        border: `1px solid ${aged ? c.accentLine : c.hair}`, borderRadius: 10,
        background: aged ? c.accentSoft : c.surface2,
        padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 11,
        opacity: t.done ? 0.42 : 1,
      }}>
        <CheckBox done={t.done} onClick={() => toggleDone(t.id)} />
        <span style={{ ...T.taskTitle, textDecoration: t.done ? 'line-through' : 'none', flex: 1, color: c.text }}>{t.title}</span>
        {aged && <span style={{ ...mono, fontSize: 10, color: c.accent, letterSpacing: '0.01em' }}>{age}d · review</span>}
        <Tag>{t.mins}m</Tag>
        <Tag>{t.energy}</Tag>
        <MoveSelect onChange={(v) => { if (!v) return; if (v === 'del') removeTask(t.id); else moveTask(t.id, v) }}>
          <option value="">⋯</option>
          {state.baskets.map(b => <option key={b.id} value={b.id}>→ {b.name}</option>)}
          <option value="del">delete</option>
        </MoveSelect>
      </div>
    )
  }

  /* ----- habit metrics ----- */
  const habitWeek = last7.filter(d => d.habit).length
  // An unmarked today doesn't break the streak — the day isn't over yet.
  let habitStreak = 0
  for (let i = habitDoneToday ? 0 : 1; ; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (state.habit.days[dateKey(d)]) habitStreak++
    else break
  }

  /* ----- sidebar widgets ----- */
  const wWord = state.widgets.word && (
    <Card label="Word of the day" dim={inFocus} style={{ minWidth: 0 }}>
      <div style={{ ...T.word, fontSize: 21, color: c.text }}>{WORDS[di % WORDS.length][0]}</div>
      <div style={{ ...T.body, fontSize: 12.5, color: c.dim, marginTop: 6 }}>{WORDS[di % WORDS.length][1]}</div>
    </Card>
  )

  const wTip = state.widgets.tip && (
    <Card label="Random tip" dim={inFocus} style={{ minWidth: 0 }}>
      <div style={{ ...T.body, fontSize: 13, color: c.text2 }}>{TIPS[di % TIPS.length]}</div>
    </Card>
  )

  const wBook = state.widgets.book && (
    <Card label="Book to read" dim={inFocus} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>
        {BOOKS[di % BOOKS.length][0]}
      </div>
      <div style={{ ...mono, fontSize: 10.5, color: c.faint, marginTop: 7 }}>
        {BOOKS[di % BOOKS.length][1]}
      </div>
    </Card>
  )

  const wHabit = state.widgets.habit && (
    <Card label="Daily habit" dim={inFocus} style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <CheckBox done={habitDoneToday} onClick={toggleHabit} />
        <input
          value={state.habit.name}
          onChange={(e) => setState(s => ({ ...s, habit: { ...s.habit, name: e.target.value } }))}
          style={{
            ...T.bodyStrong, border: 'none', outline: 'none', background: 'transparent',
            flex: 1, color: c.text, fontFamily: 'var(--sans)', minWidth: 0,
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 13 }}>
        {last7.map((d, i) => {
          const today = i === last7.length - 1
          return (
            <div key={d.k} style={{
              flex: 1, height: 15, borderRadius: 4,
              background: d.habit ? c.accent : c.surface2,
              border: `1px solid ${d.habit ? c.accentLine : (today ? c.line : c.hair)}`,
            }} />
          )
        })}
      </div>
      <div style={{ ...mono, fontSize: 10, color: c.faint, marginTop: 9 }}>
        {habitStreak > 0 ? `${habitStreak}-day streak` : 'start a streak'} · {habitWeek}/7 this week
      </div>
    </Card>
  )

  const wBtc = state.widgets.btc && (
    <Card label="BTC" dim={inFocus} style={{ minWidth: 0 }}>
      {btc === null && <div style={{ ...mono, fontSize: 11, color: c.faint }}>loading…</div>}
      {btc && btc.err && (
        <div style={{ ...mono, fontSize: 10, color: c.faint, lineHeight: 1.5 }}>
          price unavailable — works in production
        </div>
      )}
      {btc && btc.p !== undefined && (
        <Fragment>
          <div style={{ ...mono, fontSize: 23, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
            ${btc.p.toLocaleString()}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            ...mono, fontSize: 11,
            color: (btc.c ?? 0) >= 0 ? c.up : c.down,
            marginTop: 8, background: c.surface2, borderRadius: 7, padding: '3px 8px',
          }}>
            {(btc.c ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(btc.c ?? 0).toFixed(2)}% · 24h
          </div>
        </Fragment>
      )}
    </Card>
  )

  const wStats = state.widgets.stats && (
    <Card label="Deep work stats" dim={inFocus}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', rowGap: 16 }}>
        <StatBlock label="Pomodoros"   value={tStats.pomos} />
        <StatBlock label="Focus min"   value={tStats.mins} accent />
        <StatBlock label="✓ Done"      value={tStats.complete} />
        <StatBlock label="◐ Partial"   value={tStats.partial} />
        <StatBlock label="✗ Distracted" value={tStats.distracted} />
      </div>
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.hair}` }}>
        <div style={{ ...T.kicker, fontSize: 9.5, color: c.faint, marginBottom: 2 }}>
          Focus minutes · last 7 days
        </div>
        <StatsChart days={last7} max={maxMins} />
      </div>
    </Card>
  )

  /* ----- quick add card ----- */
  const qaCard = (
    <Card label="Quick add" dim={inFocus} style={{ gridArea: 'quick' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', maxWidth: 620 }}>
        <label className="fr-field" style={fieldStyle}>
          <span style={{ color: c.accent, fontSize: 19, fontWeight: 700, lineHeight: 1 }}>+</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder='Add a task, hit Enter…  ("#saas" routes to a basket)'
            style={inputStyle}
          />
        </label>
        <Btn variant="primary" onClick={addTask}>Add ↵</Btn>
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint, marginRight: 2 }}>Time</span>
          {[10, 25, 60].map(m =>
            <Chip key={m} active={addMins === m} onClick={() => setAddMins(m)}>{m}m</Chip>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint, marginRight: 2 }}>Energy</span>
          {ENERGIES.map(e =>
            <Chip key={e} active={addEnergy === e} onClick={() => setAddEnergy(e)}>{e}</Chip>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint, marginRight: 2 }}>Save to</span>
          <Chip active={addDest === 'inbox'} onClick={() => setAddDest('inbox')}>Inbox</Chip>
          {state.baskets.map(b =>
            <Chip key={b.id} active={addDest === b.id} onClick={() => setAddDest(b.id)}>{b.name}</Chip>
          )}
        </div>
      </div>
    </Card>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '26px 18px 76px', position: 'relative', zIndex: 1 }}>
      <style>{`
        .fr-btn{transition:transform .08s ease, filter .15s ease, box-shadow .2s ease;}
        .fr-btn:hover{filter:brightness(1.09);}
        .fr-btn:active{transform:translateY(1px);}
        .fr-chip:hover{border-color:var(--line);color:var(--text-2);}
        .fr-press{transition:transform .1s ease;}
        .fr-press:active{transform:scale(.95);}
        .fr-field{transition:border-color .16s ease, box-shadow .16s ease;}
        .fr-field:focus-within{border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft);}
        .fr-in{transition:border-color .16s ease, box-shadow .16s ease;}
        .fr-in:focus{border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft);}
        .fr-row{transition:border-color .16s ease, background .16s ease;}
        .fr-row:hover{border-color:var(--line);}
        .fr-tab{transition:color .16s ease, background .16s ease;}
        .fr-sel:hover{border-color:var(--line);color:var(--text-2);}
        @keyframes frPulse{0%,100%{opacity:1}50%{opacity:.4}}
        .fr-side{display:flex; flex-direction:column; gap:16px;}
        .fr-main{display:flex; flex-direction:column; gap:18px;}
        .fr-workcol{min-width:0; display:flex; flex-direction:column; gap:18px;}
        .fr-pomo{min-height:300px;}
        @media (min-width:981px){
          .fr-main{display:grid; grid-template-columns:minmax(0,1fr) 326px; gap:18px; align-items:start;}
          /* items stretch to row height so the router/pomodoro pair share a bottom edge */
          .fr-workcol{display:grid; gap:18px;}
          .fr-pomo{min-height:360px;}
          .lay-Paired .fr-workcol{grid-template-columns:minmax(0,1.55fr) minmax(264px,1fr); grid-template-areas:"quick quick" "router pomo" "inbox inbox";}
          .lay-Stacked .fr-workcol{grid-template-columns:1fr; grid-template-areas:"quick" "router" "pomo" "inbox";}
          .lay-Split .fr-workcol{grid-template-columns:minmax(0,1.55fr) minmax(264px,1fr); grid-template-areas:"router pomo" "inbox inbox";}
        }
      `}</style>

      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: SP.xl }}>

        {/* ---------- header ---------- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Mark />
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>Focus Router</span>
          </div>
          <div style={{
            ...mono, fontSize: 11, color: c.dim, letterSpacing: '0.02em',
            border: `1px solid ${c.hair}`, borderRadius: 999, padding: '6px 13px', background: c.surface,
          }}>
            {new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
          </div>
        </div>

        {/* ---------- toolbar: tabs + customize ---------- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex', gap: 3, padding: 3,
            background: c.surface, borderRadius: 999, border: `1px solid ${c.hair}`,
          }}>
            {([['today', 'Today'], ['projects', 'Projects']] as const).map(([k, lbl]) => {
              const on = tab === k
              return (
                <button key={k} className="fr-tab" onClick={() => setTab(k)} style={{
                  fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 600, letterSpacing: '0.005em',
                  borderRadius: 999, padding: '8px 20px', border: 'none',
                  background: on ? c.accent : 'transparent',
                  color: on ? c.accentInk : c.dim,
                  boxShadow: on ? '0 0 16px -6px var(--accent-glow)' : 'none',
                }}>{lbl}</button>
              )
            })}
          </div>
          <Btn variant={customize ? 'soft' : 'neutral'} size="sm" onClick={() => setCustomize(!customize)}>
            <span style={{ fontSize: 14 }}>⚙</span> Customize
          </Btn>
        </div>

        {/* ---------- customize drawer ---------- */}
        {customize && (
          <Card label="Customize">
            {/* widgets */}
            <div style={{ ...T.kicker, fontSize: 10, color: c.faint, marginBottom: 10 }}>Widgets</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: 10 }}>
              {([
                ['word', 'Word of the day'],
                ['tip', 'Random tip'],
                ['book', 'Book to read'],
                ['habit', 'Daily habit'],
                ['btc', 'BTC price'],
                ['stats', 'Deep work stats'],
              ] as [WidgetId, string][]).map(([id, name]) => (
                <label key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 11,
                  border: `1px solid ${c.hair}`, borderRadius: 10, padding: '10px 12px',
                  cursor: 'pointer', background: c.surface2,
                }}>
                  <Toggle on={state.widgets[id]} onClick={() => toggleWidget(id)} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: c.text2 }}>{name}</span>
                </label>
              ))}
            </div>

            {/* layout */}
            <div style={{ ...T.kicker, fontSize: 10, color: c.faint, margin: '18px 0 10px' }}>Layout</div>
            <Segmented options={LAYOUT_OPTIONS} value={state.tweaks.layout} onChange={(v) => setTweak('layout', v)} />

            {/* accent */}
            <div style={{ ...T.kicker, fontSize: 10, color: c.faint, margin: '18px 0 10px' }}>Accent</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ACCENT_OPTIONS.map(hex => {
                const on = state.tweaks.accent.toLowerCase() === hex.toLowerCase()
                return (
                  <button
                    key={hex}
                    onClick={() => setTweak('accent', hex)}
                    aria-pressed={on}
                    title={hex}
                    style={{
                      width: 30, height: 30, borderRadius: 999, padding: 0, cursor: 'pointer',
                      background: hex,
                      border: `2px solid ${on ? '#fff' : c.hair}`,
                      boxShadow: on ? `0 0 14px -2px ${hex}99` : 'none',
                    }}
                  />
                )
              })}
            </div>

            <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn size="sm" onClick={exportJSON}>⤓ Export data (JSON)</Btn>
              <span style={{ ...mono, fontSize: 10.5, color: c.faint }}>back up your tasks & stats</span>
            </div>
          </Card>
        )}

        {/* ================= TODAY ================= */}
        {tab === 'today' && (
          <Fragment>
            {state.tweaks.layout === 'Split' && qaCard}
            <div className={'fr-main lay-' + state.tweaks.layout}>
              <div className="fr-workcol">
                {state.tweaks.layout !== 'Split' && qaCard}

                {/* ROUTER */}
                <Card label="Router" style={{ display: 'flex', flexDirection: 'column', gridArea: 'router' }} dim={inFocus}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint }}>Energy</span>
                    <Segmented options={ENERGIES} value={energy} onChange={setEnergy} />
                    <span style={{ ...mono, fontSize: 10, color: c.faint }}>auto-set by time · tap to correct</span>
                  </div>

                  {suggestion ? (
                    <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: c.accent, boxShadow: '0 0 10px 0 var(--accent-glow)',
                        }} />
                        <span style={{ ...T.kicker, fontSize: 10, color: c.accent }}>Now do</span>
                      </div>
                      <div style={{ ...T.suggestion, color: c.text, margin: '12px 0 14px' }}>
                        {suggestion.task.title}
                      </div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {suggestion.why.map((w, i) =>
                          <Tag key={i} tone={i === 0 ? 'accent' : undefined}>{w}</Tag>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Btn
                          variant="primary"
                          onClick={() => startTask(suggestion.task)}
                          style={{ fontSize: 14, padding: '13px 22px' }}
                        >{`▶ Start · ${suggestion.task.mins} min`}</Btn>
                        <Btn
                          variant="outline"
                          onClick={() => setSkipped([...skipped, suggestion.task.id])}
                        >↻ Re-route</Btn>
                        {skipped.length > 0 && (
                          <Btn variant="ghost" size="sm" onClick={() => setSkipped([])}>
                            reset skips ({skipped.length})
                          </Btn>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 26, ...T.body, color: c.dim }}>
                      {openTasks.length === 0
                        ? 'Nothing queued. Add a task above — it routes instantly.'
                        : 'All matches skipped — reset skips or add a task.'}
                      {skipped.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <Btn size="sm" onClick={() => setSkipped([])}>reset skips</Btn>
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* POMODORO */}
                <Card
                  label={timer.phase === 'break' ? 'Break' : 'Pomodoro'}
                  glow={timer.phase !== 'idle'}
                  className="fr-pomo"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 18, gridArea: 'pomo',
                  }}
                >
                  {timer.phase === 'idle' && (
                    <Fragment>
                      <TimerRing mode="idle">
                        <div style={{ ...mono, fontSize: 32, fontWeight: 700, color: c.faint, fontVariantNumeric: 'tabular-nums' }}>25:00</div>
                      </TimerRing>
                      <div style={{ ...mono, fontSize: 10.5, color: c.faint, textAlign: 'center', maxWidth: 210, lineHeight: 1.55 }}>
                        idle — start a task from the router, or run freestyle
                      </div>
                      <div style={{ display: 'flex', gap: 7 }}>
                        {[10, 25, 60].map(m => (
                          <Btn
                            key={m}
                            size="sm"
                            onClick={() => setTimer({ phase: 'work', taskId: null, left: m * 60, total: m * 60, running: true, endsAt: Date.now() + m * 60 * 1000 })}
                          >{`▶ ${m}m`}</Btn>
                        ))}
                      </div>
                    </Fragment>
                  )}

                  {timer.phase === 'work' && (
                    <Fragment>
                      <TimerRing mode="work" progress={progress}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ ...mono, fontSize: 44, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                            {fmtClock(timer.left)}
                          </div>
                          <div style={{
                            ...T.kicker, fontSize: 9, color: c.accent, marginTop: 5,
                            animation: timer.running ? 'frPulse 2s ease-in-out infinite' : 'none',
                          }}>{timer.running ? '● focusing' : 'paused'}</div>
                        </div>
                      </TimerRing>
                      <div style={{ ...T.bodyStrong, textAlign: 'center', color: c.text, minHeight: 20, maxWidth: 240 }}>
                        {currentTask
                          ? currentTask.title
                          : <span style={{ ...mono, color: c.faint, fontWeight: 400 }}>free session</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn
                          size="sm" variant="primary"
                          onClick={() => setTimer(t => t.running
                            ? { ...t, running: false, endsAt: null }
                            : { ...t, running: true, endsAt: Date.now() + t.left * 1000 })}
                        >{timer.running ? '⏸ Pause' : '▶ Resume'}</Btn>
                        <Btn
                          size="sm" variant="outline"
                          onClick={() => setTimer(t => ({ ...t, phase: 'outcome', running: false, endsAt: null }))}
                        >■ End early</Btn>
                      </div>
                    </Fragment>
                  )}

                  {timer.phase === 'outcome' && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
                      <div style={{ ...T.kicker, fontSize: 11, color: c.text2, textAlign: 'center' }}>How did it go?</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <OutcomeButton variant="complete"   glyph="✓" label="Completed" sub="task done — mark it off"         onClick={() => recordOutcome('complete')} />
                        <OutcomeButton variant="partial"    glyph="◐" label="Partial"   sub="made progress, more to go"         onClick={() => recordOutcome('partial')} />
                        <OutcomeButton variant="distracted" glyph="✗" label="Distracted" sub="lost focus — no guilt"             onClick={() => recordOutcome('distracted')} />
                      </div>
                      <div style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: 'center', lineHeight: 1.5 }}>
                        ✗ also eases your energy down — just routing, not judgment
                      </div>
                    </div>
                  )}

                  {timer.phase === 'break' && (
                    <Fragment>
                      <TimerRing mode="break" progress={progress}>
                        <div style={{ ...mono, fontSize: 38, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtClock(timer.left)}
                        </div>
                      </TimerRing>
                      <div style={{ ...mono, fontSize: 10.5, color: c.dim, textAlign: 'center', maxWidth: 230, lineHeight: 1.6 }}>
                        break — stand up, water, look far away
                        {suggestion && (
                          <div style={{ marginTop: 7, color: c.text2, fontFamily: 'var(--sans)' }}>
                            next up: <b style={{ color: c.text }}>{suggestion.task.title}</b>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {suggestion && (
                          <Btn size="sm" variant="primary" onClick={() => startTask(suggestion.task)}>▶ Start next</Btn>
                        )}
                        <Btn
                          size="sm" variant="outline"
                          onClick={() => setTimer({ phase: 'idle', taskId: null, left: 0, total: 0, running: false, endsAt: null })}
                        >Skip break</Btn>
                      </div>
                    </Fragment>
                  )}
                </Card>

                {/* INBOX */}
                <Card
                  label="Inbox"
                  right={`${inbox.filter(t => !t.done).length} open`}
                  style={{ gridArea: 'inbox' }}
                  dim={inFocus}
                >
                  {inbox.length === 0 && (
                    <div style={{ ...mono, fontSize: 11, color: c.faint }}>
                      Empty. Quick-add lands here by default.
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...inbox].sort((a, b) => Number(a.done) - Number(b.done)).map(inboxRow)}
                  </div>
                </Card>
              </div>

              <aside className="fr-side">
                {wStats}{wHabit}{wWord}{wTip}{wBook}{wBtc}
              </aside>
            </div>
          </Fragment>
        )}

        {/* ================= PROJECTS ================= */}
        {tab === 'projects' && (
          <Fragment>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="fr-field" style={{ ...fieldStyle, flex: '0 1 280px' }}>
                <input
                  value={newBasket}
                  onChange={(e) => setNewBasket(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newBasket.trim()) {
                      setState(s => ({ ...s, baskets: [...s.baskets, { id: uid(), name: newBasket.trim() }] }))
                      setNewBasket('')
                    }
                  }}
                  placeholder="New basket name…"
                  style={inputStyle}
                />
              </label>
              <Btn variant="primary" onClick={() => {
                if (newBasket.trim()) {
                  setState(s => ({ ...s, baskets: [...s.baskets, { id: uid(), name: newBasket.trim() }] }))
                  setNewBasket('')
                }
              }}>+ Basket</Btn>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {state.baskets.map(b => {
                const ts = state.tasks.filter(t => t.basketId === b.id)
                return (
                  <Card
                    key={b.id}
                    label={b.name}
                    right={`${ts.filter(t => !t.done).length} open`}
                    style={{ flex: '1 1 300px', minWidth: 300 }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...ts].sort((a, x) => Number(a.done) - Number(x.done)).map(t => (
                        <div key={t.id} className="fr-row" style={{
                          border: `1px solid ${c.hair}`, borderRadius: 10, background: c.surface2,
                          padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 11,
                          opacity: t.done ? 0.42 : 1,
                        }}>
                          <CheckBox done={t.done} onClick={() => toggleDone(t.id)} />
                          <span style={{ ...T.taskTitle, textDecoration: t.done ? 'line-through' : 'none', flex: 1, color: c.text }}>{t.title}</span>
                          <Tag>{t.mins}m</Tag>
                          <MoveSelect onChange={(v) => {
                            if (!v) return
                            if (v === 'del') removeTask(t.id)
                            else if (v === 'inbox') moveTask(t.id, null)
                            else moveTask(t.id, v)
                          }}>
                            <option value="">⋯</option>
                            <option value="inbox">→ Inbox (today)</option>
                            {state.baskets.filter(x => x.id !== b.id).map(x =>
                              <option key={x.id} value={x.id}>→ {x.name}</option>
                            )}
                            <option value="del">delete</option>
                          </MoveSelect>
                        </div>
                      ))}
                      <input
                        className="fr-in"
                        placeholder="+ add task…  (enter)"
                        value={basketInputs[b.id] ?? ''}
                        onChange={(e) => setBasketInputs({ ...basketInputs, [b.id]: e.target.value })}
                        onKeyDown={(e) => {
                          const v = (basketInputs[b.id] ?? '').trim()
                          if (e.key === 'Enter' && v) {
                            setState(s => ({
                              ...s,
                              tasks: [...s.tasks, { id: uid(), title: v, mins: 25, energy: 'Med', basketId: b.id, done: false, createdAt: Date.now() }],
                            }))
                            setBasketInputs({ ...basketInputs, [b.id]: '' })
                          }
                        }}
                        style={{
                          fontFamily: 'var(--sans)', fontSize: 13,
                          border: `1px dashed ${c.line}`, borderRadius: 10,
                          padding: '10px 12px', outline: 'none', background: 'transparent', color: c.text,
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          if (ts.length === 0 || confirm(`Delete "${b.name}" and its ${ts.length} task(s)?`)) {
                            setState(s => ({
                              ...s,
                              baskets: s.baskets.filter(x => x.id !== b.id),
                              tasks: s.tasks.filter(t => t.basketId !== b.id),
                            }))
                            if (addDest === b.id) setAddDest('inbox')
                          }
                        }}
                        style={{
                          ...mono, fontSize: 9.5, color: c.faint,
                          border: 'none', background: 'none', cursor: 'pointer',
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}
                      >delete basket</button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </Fragment>
        )}
      </div>
    </div>
  )
}
