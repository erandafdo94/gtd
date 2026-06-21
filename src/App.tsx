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
import { Helmet } from 'react-helmet-async'

/* =====================================================================
   TYPES
   ===================================================================== */
type Energy = 'Low' | 'Med' | 'High'
type Phase = 'idle' | 'work' | 'outcome' | 'break'
type WidgetId = 'word' | 'tip' | 'btc' | 'music'
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

type BasketStatus = 'ongoing' | 'maintenance' | 'next' | 'backlog' | 'someday'
// `completedAt` (epoch ms) marks a finished project. Completed projects leave
// the four lanes and collapse into the Completed shelf; their tasks are left
// untouched so reopening restores the project exactly as it was.
type Basket = { id: string; name: string; status: BasketStatus; color: string; completedAt?: number }

type DayStats = {
  pomos: number
  mins: number
  complete: number
  partial: number
  distracted: number
}

// showMaintenance: the Maintenance lane is hidden from the Projects tab by
// default (perpetual upkeep shouldn't tempt a click); a link reveals it.
// bedtime: "HH:MM" (24h); unset = the wind-down banner is off. windDownMins:
// how long before bedtime the dashboard starts nudging you to wrap up.
type Tweaks = { accent: string; showMaintenance?: boolean; bedtime?: string; windDownMins?: number }

type State = {
  tasks: Task[]
  baskets: Basket[]
  widgets: Record<WidgetId, boolean>
  stats: Record<string, DayStats>
  tweaks: Tweaks
  /** Up to five task ids picked as today's focus. Resets each day. */
  today: { date: string; ids: string[] }
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

// Sidebar sections. `habits` is the structured habit tracker (server-backed,
// separate from the local-first State blob).
type View = 'dashboard' | 'inbox' | 'projects' | 'settings' | 'habits' | 'goals'

// A habit + its server-computed stats. Daily habits track a consecutive-day
// streak; Weekly habits target N check-ins per ISO week. The stat fields
// (doneToday … weekDates) are computed by the backend at read time.
type HabitKind = 'Daily' | 'Weekly'
type Habit = {
  id: string
  name: string
  kind: HabitKind
  targetCount: number
  color?: string | null
  icon?: string | null
  sortOrder: number
  archived: boolean
  doneToday: boolean
  currentStreak: number
  longestStreak: number
  thisWeekCount: number
  weekDates: string[]
  recentDates: string[]
}

// The goal ladder (GTD horizons of focus × SMART goals). All five horizons are
// server-backed rows in one self-referencing table; `parentGoalId` links a goal
// up to one a tier higher (Week → Year → Horizon5 → Vision25). The vision tiers
// are aspirational (no metric); Year/Month/Week carry a measurable target, unit,
// and due date. `progressPct` is computed by the backend from current/target.
type GoalHorizon = 'Vision25' | 'Horizon5' | 'Year' | 'Month' | 'Week'
type GoalStatus = 'Active' | 'Completed' | 'Abandoned'
type Goal = {
  id: string
  title: string
  description?: string | null
  horizon: GoalHorizon
  parentGoalId?: string | null
  targetValue?: number | null
  currentValue?: number | null
  unit?: string | null
  dueDate?: string | null
  status: GoalStatus
  color?: string | null
  icon?: string | null
  sortOrder: number
  archived: boolean
  completedAt?: string | null
  progressPct?: number | null
}
// Ordered top (nearest / most actionable) → bottom (farthest / aspirational), so
// "This week" is what you see first and the long-horizon vision is what you scroll
// down to. `metric` marks the SMART tiers that take a numeric target; `parent` is
// the horizon a goal of this tier links up to.
const GOAL_HORIZONS: { key: GoalHorizon; label: string; kicker: string; color: string; metric: boolean; parent: GoalHorizon | null }[] = [
  { key: 'Week',     label: 'This week',      kicker: 'cadence',     color: '#ff6b9d', metric: true,  parent: 'Month' },
  { key: 'Month',    label: 'This month',     kicker: 'focus',       color: '#e8c54a', metric: true,  parent: 'Year' },
  { key: 'Year',     label: 'This year',      kicker: 'SMART goals', color: '#ff5a36', metric: true,  parent: 'Horizon5' },
  { key: 'Horizon5', label: '5-year horizon', kicker: 'milestones', color: '#4f8cff', metric: false, parent: 'Vision25' },
  { key: 'Vision25', label: '25-year vision', kicker: 'purpose',    color: '#9a6bff', metric: false, parent: null },
]

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
// Evidence-based learning techniques — one surfaces at random each session.
// Third field is a "read more" link to a science/essay source (cognitive-science
// blogs and long-form essays, not Wikipedia) — destinations verified to resolve.
const TIPS: [string, string, string][] = [
  ['Active recall', 'test yourself instead of rereading — retrieval beats review', 'https://www.learningscientists.org/blog/2016/6/23-1'],
  ['Spaced repetition', 'revisit material at growing intervals to beat the forgetting curve', 'https://augmentingcognition.com/ltm.html'],
  ['The Feynman technique', 'explain it simply, as if teaching a child — the gaps reveal themselves', 'https://fs.blog/feynman-technique/'],
  ['Interleaving', 'mix related topics in one session rather than blocking by subject', 'https://www.learningscientists.org/blog/2016/8/11-1'],
  ['Teach to learn', "you don't fully understand it until you can explain it to someone else", 'https://thelearnerlab.com/protege-effect/'],
  ['Elaboration', 'ask why and how — tie new facts to what you already know', 'https://www.learningscientists.org/blog/2016/7/7-1'],
  ['Dual coding', 'pair words with visuals — a diagram sticks better than text alone', 'https://www.learningscientists.org/blog/2016/9/1-1'],
  ['Chunking', 'group small items into meaningful units to stretch working memory', 'https://www.scotthyoung.com/blog/2019/04/24/working-memory/'],
]
// Focus music — two source kinds coexist:
//  - 'stream'  : SomaFM 24/7 Icecast MP3, played via the root <audio>. Survives
//                tab switches, needs no CORS, but it's live radio you don't control.
//  - 'youtube' : a looping YouTube video in a hidden <iframe>. Plays the exact
//                track, but stops on in-app tab change (an iframe can't stay
//                mounted like <audio>) and leans on the click gesture for autoplay.
type Station = {
  kind: 'stream' | 'youtube'
  name: string; tag: string; genre: string
  url?: string       // stream only
  videoId?: string   // youtube only
}
const STATIONS: Station[] = [
  { kind: 'youtube', name: 'Lofi study beats', tag: 'lofi',       genre: 'lofi hiphop',       videoId: 'X4VbdwhkE10' },
  { kind: 'stream',  name: 'Groove Salad',     tag: 'chill',      genre: 'ambient downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { kind: 'youtube', name: 'Lofi chill',       tag: 'lofi chill', genre: 'lofi chill',        videoId: 'hIH1joP9_FU' },
  { kind: 'youtube', name: 'Alpha waves',      tag: 'alpha',      genre: 'focus / study',     videoId: 'GEgSBuYlSoA' },
  { kind: 'stream',  name: 'Drone Zone',       tag: 'drone',      genre: 'deep ambient',      url: 'https://ice1.somafm.com/dronezone-128-mp3' },
]

const ENERGIES: Energy[] = ['Low', 'Med', 'High']
const ACCENT_OPTIONS = ['#ff5a36', '#4f8cff', '#2ad17f', '#9a6bff']

// GTD-style project lanes. Ongoing is the active-focus lane and is hard-capped.
// Maintenance is GTD's "area of responsibility" — perpetual upkeep that's live
// but shouldn't compete for an Ongoing slot, so it's uncapped.
const BASKET_STATUSES: { key: BasketStatus; label: string }[] = [
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'next', label: 'Up next' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'someday', label: 'Someday / maybe' },
]
const ONGOING_CAP = 2

// Per-project identity colors (Reminders-style). Assigned round-robin at
// creation; changeable from the project's ⋯ menu.
const PROJECT_COLORS = ['#ff5a36', '#4f8cff', '#2ad17f', '#9a6bff', '#e8c54a', '#ff6b9d']

const STORAGE_KEY = 'focus-router-v1'
// Optional Google sign-in / backend sync. The app is local-first: with these
// unset, sign-in simply doesn't appear and everything works on localStorage.
const AUTH_KEY = 'focus_auth'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
// Sync (pull/push + the account UI) needs only an API base — email/password
// works without Google. The Google button is gated separately on GOOGLE_ON.
const SYNC_ON = !!API_BASE
const GOOGLE_ON = !!GOOGLE_CLIENT_ID && !!API_BASE

const DEFAULT_STATE: State = {
  tasks: [],
  // Fresh installs start with no baskets — create your own in the Projects
  // tab. (The design prototype shipped its author's personal baskets here.)
  baskets: [],
  widgets: { word: true, tip: true, btc: true, music: true },
  stats: {},
  tweaks: { accent: '#ff5a36' },
  today: { date: '', ids: [] },
}

const TODAY_CAP = 5

/* =====================================================================
   HELPERS
   ===================================================================== */
const uid = () => Math.random().toString(36).slice(2, 9)
// Local-date key (YYYY-MM-DD). toISOString() would use UTC, which flips the
// "day" at the wrong local hour — daily stats would roll over at e.g. noon
// for UTC+12 users.
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
// Compact number for goal progress: drop trailing decimals, add thousands sep.
const fmtNum = (n: number) => Math.round(n).toLocaleString()

/* ----- bedtime / wind-down ----- */
// Wind-down lead times offered in Settings (minutes before bedtime).
const WINDDOWN_OPTS = [30, 60, 90] as const
const DEFAULT_WINDDOWN = 60
// Render "HH:MM" (24h, as stored) as a friendly 12-hour clock, e.g. "11:00 PM".
const fmtHm12 = (hm: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return hm
  const h = Number(m[1]) % 24
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ampm}`
}
// Signed minutes from `now` to bedtime, wrapped into a ±12h window so a
// just-passed bedtime reads as a small negative (not "23h until"). Negative =
// past bedtime. null when bedtime is unset or malformed.
const minsToBedtime = (bedtime: string | undefined, now: Date): number | null => {
  if (!bedtime) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(bedtime)
  if (!m) return null
  const bedMin = (Number(m[1]) % 24) * 60 + Number(m[2])
  const nowMin = now.getHours() * 60 + now.getMinutes()
  let delta = bedMin - nowMin
  if (delta > 720) delta -= 1440
  else if (delta <= -720) delta += 1440
  return delta
}
// "HH:MM" minus N minutes, wrapping past midnight. Used to show when the
// wind-down window opens.
const subMinutes = (hm: string, mins: number): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return hm
  const total = (((Number(m[1]) % 24) * 60 + Number(m[2]) - mins) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
// Compact "past bedtime" label: "23m" / "1h 05m".
const fmtPast = (mins: number): string => {
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

type BedtimeTone = 'soon' | 'close' | 'past'
type BedtimeBanner = { tone: BedtimeTone; title: string; body: string; nightKey: string }
// The escalating dashboard banner, or null when no nudge is due. Honors the
// wind-down lead time, goes quiet ~3h past bedtime (you're presumably asleep),
// and adapts copy to whether a focus session is running.
const bedtimeBanner = (
  bedtime: string | undefined,
  windDownMins: number,
  now: Date,
  focusing: boolean,
): BedtimeBanner | null => {
  const delta = minsToBedtime(bedtime, now)
  if (delta === null) return null
  if (delta > windDownMins) return null   // too early — leave them be
  if (delta < -180) return null            // deep night — stop nagging
  const time = fmtHm12(bedtime!)
  // The calendar date the bedtime instant falls on — used to scope dismissal
  // to a single night, so a new evening surfaces the banner again.
  const nightKey = dateKey(new Date(now.getTime() + delta * 60000))
  if (delta > 30) {
    return {
      tone: 'soon', nightKey,
      title: 'Wind down soon',
      body: `Bedtime's at ${time}, about ${delta} min out. Start wrapping up — pick a clean stopping point.`,
    }
  }
  if (delta > 0) {
    return {
      tone: 'close', nightKey,
      title: `${delta} min to bedtime`,
      body: focusing
        ? `Bedtime's at ${time}. Finish this pomodoro, then call it a day — don't queue another.`
        : `Bedtime's at ${time}. Don't start anything big now — start heading to bed.`,
    }
  }
  return {
    tone: 'past', nightKey,
    title: 'Past your bedtime',
    body: focusing
      ? `It's ${fmtPast(-delta)} past ${time}. Hard workers forget to sleep — finish up and stop.`
      : `It's ${fmtPast(-delta)} past ${time}. Sleep is the real productivity hack — call it a night.`,
  }
}

const E_SCORE: Record<Energy, number> = { Low: 0, Med: 1, High: 2 }

const ZERO_DAY: DayStats = { pomos: 0, mins: 0, complete: 0, partial: 0, distracted: 0 }

/* =====================================================================
   AUTH / SYNC (optional — Google Identity Services + state-blob backend)
   ===================================================================== */
type AuthUser = { email: string; name?: string; picture?: string; has_password?: boolean }
type AuthState = { token: string; refreshToken: string; user: AuthUser }

// Load the GIS client script once, on demand.
let gisPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise<void>((resolve, reject) => {
    if ((window as { google?: unknown }).google) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google sign-in failed to load'))
    document.head.appendChild(s)
  })
  return gisPromise
}

// Sanitize a State blob loaded from the server into a complete, valid State.
// Drops legacy demo baskets, normalizes basket status + colors, caps the ongoing
// lane, resets today's picks if stale, and keeps only known tweak fields. A null/
// empty blob (new user) yields DEFAULT_STATE.
function normalizeState(parsed: Partial<State> | null | undefined): State {
  if (!parsed) return DEFAULT_STATE
  // One-time cleanup: earlier builds shipped the design prototype's personal demo
  // baskets as defaults. Drop any of them that hold no tasks.
  const DEMO: Record<string, string> = { b1: 'SaaS / GA4', b2: 'NZ move', b3: 'Learning' }
  const tasks = parsed.tasks ?? []
  // Pre-status builds stored baskets as plain {id,name} — default those to backlog.
  // Ongoing beyond the cap demotes to up-next, first-come first-kept.
  let ongoingSeen = 0
  const baskets = (parsed.baskets ?? [])
    .filter(b => DEMO[b.id] !== b.name || tasks.some(t => t.basketId === b.id))
    .map((b, i) => {
      let status: BasketStatus = BASKET_STATUSES.some(s => s.key === b.status) ? b.status : 'backlog'
      if (status === 'ongoing' && ++ongoingSeen > ONGOING_CAP) status = 'next'
      const color = typeof b.color === 'string' && b.color ? b.color : PROJECT_COLORS[i % PROJECT_COLORS.length]
      return { ...b, status, color }
    })
  // Today's picks reset each day; drop ids whose task no longer exists.
  const today = parsed.today && parsed.today.date === todayKey()
    ? { date: parsed.today.date, ids: (parsed.today.ids ?? []).filter(id => tasks.some(t => t.id === id)).slice(0, TODAY_CAP) }
    : { date: todayKey(), ids: [] }
  // Only known tweak fields are picked up (retired layout tweaks may linger).
  const tweaks: Tweaks = {
    accent: parsed.tweaks?.accent ?? DEFAULT_STATE.tweaks.accent,
    showMaintenance: parsed.tweaks?.showMaintenance ?? false,
    bedtime: parsed.tweaks?.bedtime,
    windDownMins: parsed.tweaks?.windDownMins,
  }
  return {
    ...DEFAULT_STATE,
    tasks,
    baskets,
    today,
    widgets: { ...DEFAULT_STATE.widgets, ...(parsed.widgets ?? {}) },
    tweaks,
    stats: parsed.stats ?? {},
  }
}

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
  label, right, children, style, dim, glow, className, compact,
}: {
  label?: ReactNode
  right?: ReactNode
  children?: ReactNode
  style?: CSSProperties
  dim?: boolean
  glow?: boolean
  className?: string
  /** Tighter padding + header spacing — for the slim widget strip. */
  compact?: boolean
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
        padding: compact ? '10px 14px' : 18,
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
        <header style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: compact ? 6 : 15 }}>
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
          <button key={o} type="button" className="fr-press" onClick={() => onChange(o)} style={{
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
   HABITS — small presentational pieces (Apple Reminders-style)
   ===================================================================== */
// Daily check-off: a fillable ring that turns into a coloured ✓ when done.
function CheckCircle({ done, color, onClick }: { done: boolean; color: string; onClick: () => void }) {
  return (
    <button
      className="fr-press"
      aria-pressed={done}
      aria-label={done ? 'Mark not done' : 'Mark done'}
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, padding: 0, cursor: 'pointer',
        border: done ? 'none' : `2px solid ${c.line}`, background: done ? color : 'transparent',
        display: 'grid', placeItems: 'center', transition: 'background .15s ease, border-color .15s ease',
      }}
    >
      {done && <span aria-hidden="true" style={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>✓</span>}
    </button>
  )
}

// Weekly progress: an Activity-style ring with the count in the middle. Tapping
// it toggles today's check-in (same primary action as the daily circle).
function WeekRing({ count, target, color, onClick }: { count: number; target: number; color: string; onClick: () => void }) {
  const r = 11
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, target > 0 ? count / target : 0))
  return (
    <button
      className="fr-press"
      aria-label={`${count} of ${target} this week — tap to check in today`}
      onClick={onClick}
      style={{ width: 30, height: 30, flexShrink: 0, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative' }}
    >
      <svg width="30" height="30" viewBox="0 0 30 30" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="15" cy="15" r={r} fill="none" stroke={c.surface3} strokeWidth="3" />
        <circle
          cx="15" cy="15" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .25s ease' }}
        />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', ...mono, fontSize: 9, color: c.dim, fontWeight: 700 }}>{count}</span>
    </button>
  )
}

// Last-7-days strip shown on every habit row: today + the previous six days as
// tappable checkboxes (no future days exist in this window). Lets you mark
// yesterday — or any of the last week — without leaving the list. Done days fill
// with the habit colour + a check; today's empty cell is outlined in that colour.
function DayStrip({ recentDates, color, onToggle }: {
  recentDates: string[]; color: string; onToggle: (date: string, done: boolean) => void
}) {
  const now = new Date()
  const done = new Set(recentDates)
  const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const days: { key: string; label: string; isToday: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i)
    days.push({ key: dateKey(d), label: WD[d.getDay()], isToday: i === 0 })
  }
  return (
    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
      {days.map(dd => {
        const on = done.has(dd.key)
        return (
          <span key={dd.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <button
              className="fr-press"
              onClick={() => onToggle(dd.key, on)}
              title={dd.isToday ? `${dd.key} (today)` : dd.key}
              aria-label={`${dd.key}${on ? ' done' : ''}${dd.isToday ? ' (today)' : ''}`}
              style={{
                width: 18, height: 18, borderRadius: '50%', padding: 0, cursor: 'pointer',
                background: on ? color : 'transparent',
                border: on ? 'none' : `1.5px solid ${dd.isToday ? color : c.line}`,
                display: 'grid', placeItems: 'center',
              }}
            >
              {on && <span aria-hidden="true" style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
            </button>
            <span style={{ ...mono, fontSize: 8, color: dd.isToday ? c.text2 : c.faint }}>{dd.label}</span>
          </span>
        )
      })}
    </div>
  )
}

function HabitGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...T.kicker, fontSize: 9.5, color: c.faint, margin: '6px 2px 8px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

// Parse a YYYY-MM-DD as a LOCAL date (new Date('2026-06-15') would parse as UTC
// and can shift the day depending on timezone).
function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// The local YYYY-MM-DD keys in the ISO week containing today (for optimistic
// updates of weekly progress when a date in this week is toggled).
function currentWeekKeys(): Set<string> {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const s = new Set<string>()
  for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); s.add(dateKey(d)) }
  return s
}

// The local YYYY-MM-DD keys for the last 7 days (today + previous 6).
function last7Keys(): Set<string> {
  const now = new Date()
  const s = new Set<string>()
  for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() - i); s.add(dateKey(d)) }
  return s
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 14px', background: c.surface2, border: `1px solid ${c.hair}`, borderRadius: 10, minWidth: 60 }}>
      <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ ...T.kicker, fontSize: 8.5, color: c.faint }}>{label}</span>
    </div>
  )
}

// GitHub-style heatmap of every check-in. Columns = ISO weeks (Mon→Sun), from the
// earlier of one-year-ago / the first check-in up to this week. Each cell is
// tappable to add/remove a check-in for that day (future days are disabled), which
// is also how past days get marked retroactively.
function HabitHeatmap({ dates, color, onToggle }: { dates: string[]; color: string; onToggle: (date: string, done: boolean) => void }) {
  // Open scrolled to the most recent week (right edge), like GitHub's graph.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollLeft = el.scrollWidth }, [dates.length])
  // Immediate, styled hover/focus tooltip with a friendly date (the native title
  // tooltip is slow and easy to miss).
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const fmtDay = (key: string) => parseDateKey(key).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const showTip = (el: HTMLElement, key: string, on: boolean) => {
    const r = el.getBoundingClientRect()
    setTip({ text: fmtDay(key) + (on ? ' · done' : ''), x: r.left + r.width / 2, y: r.top })
  }
  const done = new Set(dates)
  const todayStr = todayKey()
  const now = new Date()
  const end = new Date(now); end.setDate(now.getDate() + (6 - ((now.getDay() + 6) % 7))) // Sunday this week
  let start = new Date(now); start.setFullYear(now.getFullYear() - 1)
  if (dates.length) { const first = parseDateKey(dates[0]); if (first < start) start = first }
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // back to Monday

  const weeks: { key: string; date: Date }[][] = []
  const cur = new Date(start)
  while (cur <= end) {
    const wk: { key: string; date: Date }[] = []
    for (let i = 0; i < 7; i++) { wk.push({ key: dateKey(cur), date: new Date(cur) }); cur.setDate(cur.getDate() + 1) }
    weeks.push(wk)
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const cell = 13, gap = 3
  return (
    <>
    <div ref={scrollRef} style={{ overflowX: 'auto', paddingBottom: 6 }}>
      <div style={{ display: 'flex', gap, marginBottom: 4 }}>
        {weeks.map((wk, i) => {
          const first = wk[0].date
          const prev = i > 0 ? weeks[i - 1][0].date : null
          const show = !prev || prev.getMonth() !== first.getMonth()
          return <div key={i} style={{ width: cell, ...mono, fontSize: 8, color: c.faint, flexShrink: 0 }}>{show ? MONTHS[first.getMonth()] : ''}</div>
        })}
      </div>
      <div style={{ display: 'flex', gap }}>
        {weeks.map((wk, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap, flexShrink: 0 }}>
            {wk.map(d => {
              const on = done.has(d.key)
              const future = d.key > todayStr
              return (
                <button
                  key={d.key}
                  className="fr-press"
                  disabled={future}
                  aria-label={`${d.key}${on ? ' — done' : ''}`}
                  onClick={() => onToggle(d.key, on)}
                  onMouseEnter={(e) => showTip(e.currentTarget, d.key, on)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => showTip(e.currentTarget, d.key, on)}
                  onBlur={() => setTip(null)}
                  style={{
                    width: cell, height: cell, borderRadius: 3, padding: 0, border: 'none',
                    background: future ? 'transparent' : on ? color : c.surface3,
                    opacity: future ? 0.25 : 1, cursor: future ? 'default' : 'pointer',
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
    {tip && (
      <div
        role="tooltip"
        style={{
          position: 'fixed', left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 8px))',
          zIndex: 200, pointerEvents: 'none', background: c.surface3, border: `1px solid ${c.line}`,
          borderRadius: 8, padding: '5px 9px', ...mono, fontSize: 10.5, color: c.text,
          whiteSpace: 'nowrap', boxShadow: 'var(--shadow-lift)',
        }}
      >
        {tip.text}
      </div>
    )}
    </>
  )
}

/* =====================================================================
   TIMER RING
   ===================================================================== */
function TimerRing({
  size = 160, stroke = 7, progress = 0, mode = 'work', children,
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
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      border: `1.5px solid ${done ? c.accent : c.line}`,
      background: done ? c.accent : 'transparent', color: c.accentInk,
      display: 'grid', placeItems: 'center',
      fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
      transition: 'all .15s ease',
    }}>{done ? '✓' : ''}</button>
  )
}

type MenuEntry =
  | { kind: 'item'; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { kind: 'label'; label: string }
  | { kind: 'divider' }
  | { kind: 'colors'; value: string; onPick: (hex: string) => void }

/** ⋯ trigger + anchored dropdown menu. Closes on outside click and Escape. */
function MenuButton({ entries, ariaLabel, size = 28 }: { entries: MenuEntry[]; ariaLabel: string; size?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        className="fr-press"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          width: size, height: size, borderRadius: 8, padding: 0,
          border: 'none', background: open ? c.surface3 : 'transparent',
          color: c.dim, cursor: 'pointer', fontSize: 14, lineHeight: 1,
        }}
      >⋯</button>
      {open && (
        <div role="menu" style={{
          position: 'absolute', right: 0, top: size + 4, zIndex: 70, minWidth: 158,
          background: c.surface2, border: `1px solid ${c.line}`, borderRadius: 10,
          boxShadow: 'var(--shadow-lift)', padding: 4,
        }}>
          {entries.map((en, i) => {
            if (en.kind === 'divider') return <div key={i} style={{ height: 1, background: c.hair, margin: '4px 6px' }} />
            if (en.kind === 'label') return (
              <div key={i} style={{ ...T.kicker, fontSize: 9, color: c.faint, padding: '6px 10px 3px' }}>{en.label}</div>
            )
            if (en.kind === 'colors') return (
              <div key={i} style={{ display: 'flex', gap: 6, padding: '7px 10px' }}>
                {PROJECT_COLORS.map(hex => (
                  <button
                    key={hex}
                    aria-label={`Set color ${hex}`}
                    onClick={() => { en.onPick(hex); setOpen(false) }}
                    style={{
                      width: 16, height: 16, borderRadius: '50%', padding: 0, cursor: 'pointer',
                      background: hex, border: `2px solid ${en.value === hex ? '#fff' : 'transparent'}`,
                    }}
                  />
                ))}
              </div>
            )
            return (
              <button
                key={i}
                role="menuitem"
                className="fr-mi"
                disabled={en.disabled}
                onClick={() => { setOpen(false); en.onClick() }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                  borderRadius: 7, border: 'none', background: 'transparent',
                  cursor: en.disabled ? 'default' : 'pointer',
                  fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 500,
                  color: en.danger ? c.down : c.text2, opacity: en.disabled ? 0.45 : 1,
                }}
              >{en.label}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Click-to-edit text field; Enter/blur commits, Escape cancels. */
function InlineEdit({ value, onCommit, onCancel, style }: {
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
  style?: CSSProperties
}) {
  const [draft, setDraft] = useState(value)
  const doneRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  const commit = () => { if (!doneRef.current) { doneRef.current = true; onCommit(draft) } }
  const cancel = () => { if (!doneRef.current) { doneRef.current = true; onCancel() } }
  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
      onBlur={commit}
      style={{
        background: 'transparent', border: `1px solid ${c.accentLine}`, borderRadius: 8,
        color: c.text, outline: 'none', padding: '4px 9px', fontFamily: 'var(--sans)', ...style,
      }}
    />
  )
}

/* =====================================================================
   SIDE NAV
   ===================================================================== */
function SideNav({
  view, onView, open, onClose, inboxCount, projectCount, habitCount, goalCount, footer,
}: {
  view: View
  onView: (v: View) => void
  open: boolean
  onClose: () => void
  inboxCount: number
  projectCount: number
  habitCount: number
  goalCount: number
  /** Rendered pinned to the bottom of the sidebar (account / sync). */
  footer?: ReactNode
}) {
  const itemStyle = (active: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
    padding: '10px 12px', borderRadius: 10, minHeight: 42,
    border: `1px solid ${active ? c.accentLine : 'transparent'}`,
    background: active ? c.accentSoft : 'transparent',
    color: active ? c.text : c.dim,
    fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 600, letterSpacing: '0.005em',
    transition: 'background .16s ease, color .16s ease, border-color .16s ease',
  })
  const countStyle: CSSProperties = {
    ...mono, fontSize: 10.5, color: c.faint, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
  }
  const navItem = (key: View, glyph: string, label: string, count?: number): ReactNode => {
    const active = view === key
    return (
      <button
        className="fr-nav"
        aria-current={active ? 'page' : undefined}
        onClick={() => { onView(key); onClose() }}
        style={itemStyle(active)}
      >
        <span aria-hidden="true" style={{ width: 18, textAlign: 'center', fontSize: 14, color: active ? c.accent : c.faint }}>{glyph}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {count != null && count > 0 && <span style={{ ...countStyle, color: active ? c.accent : c.faint }}>{count}</span>}
      </button>
    )
  }
  return (
    <aside
      className={'fr-sidenav' + (open ? ' fr-sidenav-open' : '')}
      role="navigation"
      aria-label="Primary"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px', marginBottom: SP.xl }}>
        <Mark size={26} />
        <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>Focus Router</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {navItem('dashboard', '◎', 'Dashboard')}
        {navItem('inbox', '▣', 'Inbox', inboxCount)}
        {navItem('projects', '▦', 'Projects', projectCount)}
        {navItem('habits', '◉', 'Habits', habitCount)}
        {navItem('goals', '◆', 'Goals', goalCount)}
      </nav>
      {footer}
    </aside>
  )
}

/* =====================================================================
   APP
   ===================================================================== */
export default function App() {
  const [state, setState] = useState<State>(DEFAULT_STATE)
  // App data is server-backed (DB is the source of truth). `authResolved` = the
  // boot-time token check has run; `stateLoaded` = the user's /api/state has been
  // fetched. The app body renders only once both are true and `auth` is set.
  const [authResolved, setAuthResolved] = useState(false)
  const [stateLoaded, setStateLoaded] = useState(false)
  const [view, setView] = useState<View>('dashboard')
  const [customize, setCustomize] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)

  // Habit tracker (server-backed; deliberately kept out of the State blob so it
  // isn't double-synced through /api/state).
  const [habits, setHabits] = useState<Habit[]>([])
  const [habitsLoading, setHabitsLoading] = useState(false)
  const [habitsErr, setHabitsErr] = useState(false)
  const [renamingHabitId, setRenamingHabitId] = useState<string | null>(null)
  // New-habit modal form.
  const [newHabitOpen, setNewHabitOpen] = useState(false)
  const [nhName, setNhName] = useState('')
  const [nhKind, setNhKind] = useState<HabitKind>('Daily')
  const [nhTarget, setNhTarget] = useState(3)
  const [nhColor, setNhColor] = useState(PROJECT_COLORS[0])
  const [nhBusy, setNhBusy] = useState(false)
  // Habit history modal (calendar heatmap + retroactive marking).
  const [historyHabitId, setHistoryHabitId] = useState<string | null>(null)
  const [historyDates, setHistoryDates] = useState<string[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Goal ladder (server-backed, like habits — kept out of the State blob).
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [goalsErr, setGoalsErr] = useState(false)
  // New-goal modal form.
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const [ngHorizon, setNgHorizon] = useState<GoalHorizon>('Year')
  const [ngTitle, setNgTitle] = useState('')
  const [ngTarget, setNgTarget] = useState('')
  const [ngCurrent, setNgCurrent] = useState('')
  const [ngUnit, setNgUnit] = useState('')
  const [ngDue, setNgDue] = useState('')
  const [ngParent, setNgParent] = useState('')
  const [ngBusy, setNgBusy] = useState(false)
  // Which goal horizon (or the achievement history) the Goals view is showing.
  // Opens on 'Week' — the nearest, most actionable horizon.
  const [goalTab, setGoalTab] = useState<GoalHorizon | 'achieved'>('Week')

  // auth / sync (optional)
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [syncErr, setSyncErr] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [emailField, setEmailField] = useState('')
  const [pwField, setPwField] = useState('')
  const [authErr, setAuthErr] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  // "Set password" for the signed-in account (e.g. a Google user adding one),
  // surfaced inline on the Settings page.
  const [pwAddField, setPwAddField] = useState('')
  const [pwAddErr, setPwAddErr] = useState<string | null>(null)
  const [pwAddBusy, setPwAddBusy] = useState(false)
  const [pwAddDone, setPwAddDone] = useState(false)
  const [pwShow, setPwShow] = useState(false)        // show/hide the password field
  const [pwChanging, setPwChanging] = useState(false) // reveal the form to change an existing password
  const gisRef = useRef<HTMLDivElement | null>(null)
  const pulledRef = useRef(false)

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

  // focus music — one root-mounted <audio> so playback survives tab switches
  const [station, setStation] = useState(0)
  const [musicOn, setMusicOn] = useState(false)
  const [musicErr, setMusicErr] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // baskets / projects tab
  const [basketInputs, setBasketInputs] = useState<Record<string, string>>({})
  // The project whose right-side drawer is open (null = none).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailEditing, setDetailEditing] = useState(false)
  // Completed-projects shelf at the bottom of the Projects tab (collapsed by default).
  const [completedOpen, setCompletedOpen] = useState(false)
  // Hide completed tasks in the Inbox + project drawer lists (on by default).
  const [hideCompleted, setHideCompleted] = useState(true)
  // Drag-and-drop of project cards between lanes (HTML5 DnD, no library).
  const [dragId, setDragId] = useState<string | null>(null)
  const [overLane, setOverLane] = useState<BasketStatus | null>(null)
  // Deleted-project snapshot for the undo toast (replaces confirm dialogs)
  const [undoState, setUndoState] = useState<{ msg: string; undo: () => void } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // today card
  const [todayDraft, setTodayDraft] = useState('')
  const [todayPickOpen, setTodayPickOpen] = useState(false)

  // learning tip — random pick, stable for the session
  const [tipIdx] = useState(() => Math.floor(Math.random() * TIPS.length))

  // bedtime / wind-down — a wall clock that ticks each minute so the banner's
  // countdown and escalation stay live. The banner is intentionally not
  // dismissible: it must stay up until bedtime passes (or the window closes).
  const [clock, setClock] = useState(() => new Date())

  /* ----- start-fresh: purge any legacy local-first data on boot ----- */
  // The app is now server-backed; the old localStorage blob (and the two minor
  // UI keys) are dead. Clear them once so nothing stale lingers. The auth token
  // (AUTH_KEY) is intentionally kept — it's the only thing we persist locally.
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem('focus_bedtime_dismissed')
      localStorage.removeItem('focus_nudge_at')
    } catch { /* ignore */ }
  }, [])

  /* ----- btc fetch ----- */
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')
      .then(r => r.json())
      .then((d: { bitcoin: { usd: number; usd_24h_change: number } }) =>
        setBtc({ p: d.bitcoin.usd, c: d.bitcoin.usd_24h_change }))
      .catch(() => setBtc({ err: true }))
  }, [])

  /* ----- bedtime banner: tick the wall clock once a minute ----- */
  useEffect(() => {
    if (!state.tweaks.bedtime) return
    const id = setInterval(() => setClock(new Date()), 60_000)
    return () => clearInterval(id)
  }, [state.tweaks.bedtime])

  /* ----- music: reload the source on station switch ----- */
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    if (STATIONS[station].kind === 'stream') {
      // youtube → stream (or stream → stream): (re)connect and resume.
      a.load()
      if (musicOn) a.play().catch(() => { setMusicErr(true); setMusicOn(false) })
    } else {
      // stream → youtube: silence the audio; the iframe below carries playback.
      a.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])

  /* ----- music: hiding the widget stops playback (no orphan audio) ----- */
  useEffect(() => {
    if (!state.widgets.music && musicOn) {
      audioRef.current?.pause()
      setMusicOn(false)
    }
  }, [state.widgets.music, musicOn])

  /* ----- leaving a project closes its rename editor ----- */
  useEffect(() => { setDetailEditing(false) }, [selectedId])

  /* ----- stats / customize popups: close on Escape ----- */
  useEffect(() => {
    if (!statsOpen && !customize) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setStatsOpen(false); setCustomize(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [statsOpen, customize])

  /* ----- apply accent to CSS vars ----- */
  useEffect(() => {
    const a = state.tweaks.accent || '#ff5a36'
    const r = document.documentElement.style
    r.setProperty('--accent', a)
    r.setProperty('--accent-2', a)
    r.setProperty('--accent-soft', a + '1f')
    r.setProperty('--accent-line', a + '66')
    r.setProperty('--accent-glow', a + '3a')
  }, [state.tweaks.accent])

  /* ----- auth actions (optional sync) ----- */
  // Latest auth, mirrored into a ref so async refresh/retry flows never read a
  // stale token captured in an effect closure.
  const authRef = useRef<AuthState | null>(null)
  const applyAuth = (a: AuthState | null) => {
    authRef.current = a
    setAuth(a)
    try {
      if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a))
      else localStorage.removeItem(AUTH_KEY)
    } catch { /* ignore */ }
  }

  // Apply a sign-in response (shared by Google + email/password). Throws if the
  // payload lacks tokens so callers can surface an error.
  const applySignInResponse = (d: { token?: string; jwt?: string; refresh_token?: string; user: AuthUser }) => {
    const token = d.token ?? d.jwt
    if (!token || !d.refresh_token) throw new Error('no token')
    applyAuth({ token, refreshToken: d.refresh_token, user: d.user })
    setSyncErr(false)
  }

  const handleCredential = (idToken: string) => {
    if (!API_BASE) return
    fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('auth failed'))))
      .then(applySignInResponse)
      .then(() => closeSignIn())
      .catch(() => setSyncErr(true))
  }

  // Email/password register or login. Resolves to an error string (shown in the
  // modal) or null on success.
  const handleEmailAuth = async (mode: 'login' | 'register', email: string, password: string): Promise<string | null> => {
    if (!API_BASE) return 'Sync is not configured'
    try {
      const r = await fetch(`${API_BASE}/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!r.ok) {
        if (r.status === 409) return 'That email is already in use — try logging in.'
        if (r.status === 401) return 'Invalid email or password.'
        if (r.status === 400) {
          const d = await r.json().catch(() => null) as { error?: string } | null
          return d?.error ? d.error[0].toUpperCase() + d.error.slice(1) : 'Check your email and password.'
        }
        return 'Something went wrong — please try again.'
      }
      applySignInResponse(await r.json())
      return null
    } catch {
      return 'Could not reach the server.'
    }
  }

  // Clear the sign-in form after a successful auth (the gate unmounts once auth is set).
  const closeSignIn = () => {
    setAuthErr(null)
    setPwField('')
    setPwShow(false)
    setAuthBusy(false)
  }

  // Move focus to a gate field by id (so a failed submit lands on the problem).
  const focusGateField = (id: 'gate-email' | 'gate-password') =>
    requestAnimationFrame(() => document.getElementById(id)?.focus())

  const submitEmailAuth = async () => {
    const email = emailField.trim().toLowerCase()
    if (!email) { setAuthErr('Enter your email and password.'); focusGateField('gate-email'); return }
    if (!pwField) { setAuthErr('Enter your email and password.'); focusGateField('gate-password'); return }
    if (authMode === 'register' && pwField.length < 8) { setAuthErr('Password must be at least 8 characters.'); focusGateField('gate-password'); return }
    setAuthBusy(true)
    setAuthErr(null)
    const err = await handleEmailAuth(authMode, email, pwField)
    setAuthBusy(false)
    if (err) { setAuthErr(err); focusGateField('gate-email') }
    else closeSignIn()
  }

  // Set/change the password on the signed-in account via the authenticated
  // endpoint (handles 401-refresh through authedFetch). On success, flips the
  // local user's has_password so the Settings page reflects it immediately.
  const submitSetPassword = async () => {
    if (pwAddField.length < 8) { setPwAddErr('Password must be at least 8 characters.'); return }
    setPwAddBusy(true)
    setPwAddErr(null)
    try {
      const r = await authedFetch('/api/auth/set-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwAddField }),
      })
      setPwAddBusy(false)
      if (!r || !r.ok) { setPwAddErr('Could not set your password — please try again.'); return }
      const cur = authRef.current
      if (cur) applyAuth({ ...cur, user: { ...cur.user, has_password: true } })
      setPwAddField('')
      setPwShow(false)
      setPwChanging(false)
      setPwAddDone(true)
    } catch {
      setPwAddBusy(false)
      setPwAddErr('Could not reach the server.')
    }
  }

  // Exchange the refresh token for a fresh access token (and rotated refresh
  // token). Returns the new access token, or null if refresh failed.
  const refreshAccessToken = async (): Promise<string | null> => {
    const cur = authRef.current
    if (!cur?.refreshToken) return null
    try {
      const r = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: cur.refreshToken }),
      })
      if (!r.ok) return null
      const d = await r.json() as { token?: string; refresh_token?: string }
      if (!d.token || !d.refresh_token) return null
      applyAuth({ ...cur, token: d.token, refreshToken: d.refresh_token })
      return d.token
    } catch { return null }
  }

  // fetch against the API with the bearer access token. On 401, refresh once and
  // retry; if the refresh also fails, sign out. Returns null when not signed in.
  const authedFetch = async (path: string, init: RequestInit = {}): Promise<Response | null> => {
    const cur = authRef.current
    if (!cur) return null
    const withAuth = (token: string): RequestInit => ({
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    })
    let res = await fetch(`${API_BASE}${path}`, withAuth(cur.token))
    if (res.status === 401) {
      const newToken = await refreshAccessToken()
      if (!newToken) { applyAuth(null); pulledRef.current = false; setStateLoaded(false); return res }
      res = await fetch(`${API_BASE}${path}`, withAuth(newToken))
    }
    return res
  }

  const signOut = () => {
    // Best-effort revoke of the refresh token server-side before dropping it.
    const rt = authRef.current?.refreshToken
    if (rt && API_BASE) {
      fetch(`${API_BASE}/api/auth/signout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      }).catch(() => { /* ignore */ })
    }
    applyAuth(null)
    pulledRef.current = false
    setStateLoaded(false)
    setState(DEFAULT_STATE)
    setSyncErr(false)
  }

  /* ----- auth: restore session on boot, then mark auth resolved ----- */
  useEffect(() => {
    try { const raw = localStorage.getItem(AUTH_KEY); if (raw) { const a = JSON.parse(raw) as AuthState; if (a?.token && a?.refreshToken) applyAuth(a) } } catch { /* ignore */ }
    setAuthResolved(true)
  }, [])

  /* ----- state: load the user's blob from the server once after sign-in ----- */
  // The DB is the single source of truth. A new user's blob is null -> DEFAULT_STATE.
  useEffect(() => {
    if (!auth || pulledRef.current) return
    pulledRef.current = true
    authedFetch('/api/state')
      .then(r => (r && r.ok ? r.json() : null))
      .then((d: { state?: Partial<State> } | null) => {
        setState(normalizeState(d?.state))
        setStateLoaded(true)
      })
      .catch(() => {
        // Couldn't reach the server — fall back to an empty workspace so the app
        // is usable; the next change retries the PUT. (authedFetch clears auth on
        // a failed refresh, which returns the user to the gate.)
        setState(DEFAULT_STATE)
        setStateLoaded(true)
      })
  }, [auth])

  /* ----- state: push to the server on every change (debounced) ----- */
  useEffect(() => {
    if (!auth || !stateLoaded) return
    const t = setTimeout(() => {
      authedFetch('/api/state', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      })
        .then(r => { if (r) setSyncErr(!r.ok) })
        .catch(() => setSyncErr(true))
    }, 900)
    return () => clearTimeout(t)
  }, [state, auth, stateLoaded])

  /* ----- habits: load + optimistic mutations (structured /api/habits API) ----- */
  const loadHabits = async () => {
    if (!auth || !SYNC_ON) return
    setHabitsLoading(true)
    try {
      const r = await authedFetch(`/api/habits?today=${todayKey()}`)
      if (r && r.ok) { setHabits(await r.json() as Habit[]); setHabitsErr(false) }
      else if (r) setHabitsErr(true)
    } catch { setHabitsErr(true) }
    finally { setHabitsLoading(false) }
  }

  // Fetch habits when the tab is opened (and once auth becomes available).
  useEffect(() => {
    if (view === 'habits' && auth && SYNC_ON) loadHabits()
  }, [view, auth])

  const createHabit = async (input: { name: string; kind: HabitKind; targetCount: number; color?: string }) => {
    const r = await authedFetch(`/api/habits?today=${todayKey()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (r && r.ok) { const h = await r.json() as Habit; setHabits(hs => [...hs, h]); setHabitsErr(false) }
    else setHabitsErr(true)
  }

  const updateHabit = async (
    id: string,
    patch: Partial<Pick<Habit, 'name' | 'kind' | 'targetCount' | 'color' | 'icon' | 'sortOrder' | 'archived'>>,
  ) => {
    setHabits(hs => hs.map(h => (h.id === id ? { ...h, ...patch } : h)))   // optimistic
    const r = await authedFetch(`/api/habits/${id}?today=${todayKey()}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r && r.ok) { const h = await r.json() as Habit; setHabits(hs => hs.map(x => (x.id === id ? h : x))) }
    else { setHabitsErr(true); loadHabits() }
  }

  const deleteHabit = async (id: string) => {
    const prev = habits
    setHabits(hs => hs.filter(h => h.id !== id))   // optimistic
    const r = await authedFetch(`/api/habits/${id}`, { method: 'DELETE' })
    if (!r || !r.ok) { setHabits(prev); setHabitsErr(true) }
  }

  /* ----- goals: load + optimistic mutations (structured /api/goals API) ----- */
  const loadGoals = async () => {
    if (!auth || !SYNC_ON) return
    setGoalsLoading(true)
    try {
      // Fetch everything (including archived) so the Achieved history has data;
      // the active ladder filters archived out client-side.
      const r = await authedFetch('/api/goals?archived=true')
      if (r && r.ok) { setGoals(await r.json() as Goal[]); setGoalsErr(false) }
      else if (r) setGoalsErr(true)
    } catch { setGoalsErr(true) }
    finally { setGoalsLoading(false) }
  }

  // Fetch goals when the tab is opened (and once auth becomes available).
  useEffect(() => {
    if (view === 'goals' && auth && SYNC_ON) loadGoals()
  }, [view, auth])

  const createGoal = async (input: Partial<Goal> & { title: string; horizon: GoalHorizon }) => {
    const r = await authedFetch('/api/goals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (r && r.ok) { const g = await r.json() as Goal; setGoals(gs => [...gs, g]); setGoalsErr(false) }
    else setGoalsErr(true)
  }

  const updateGoal = async (
    id: string,
    patch: Partial<Pick<Goal, 'title' | 'description' | 'horizon' | 'parentGoalId' | 'targetValue' | 'currentValue' | 'unit' | 'dueDate' | 'status' | 'color' | 'icon' | 'sortOrder' | 'archived'>>,
  ) => {
    setGoals(gs => gs.map(g => (g.id === id ? { ...g, ...patch } : g)))   // optimistic
    const r = await authedFetch(`/api/goals/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r && r.ok) { const g = await r.json() as Goal; setGoals(gs => gs.map(x => (x.id === id ? g : x))) }
    else { setGoalsErr(true); loadGoals() }
  }

  const deleteGoal = async (id: string) => {
    const prev = goals
    // Drop the goal and clear any child up-links to it (mirrors the server's SET NULL).
    setGoals(gs => gs.filter(g => g.id !== id).map(g => (g.parentGoalId === id ? { ...g, parentGoalId: null } : g)))
    const r = await authedFetch(`/api/goals/${id}`, { method: 'DELETE' })
    if (!r || !r.ok) { setGoals(prev); setGoalsErr(true) }
  }

  const openHistory = async (h: Habit) => {
    setHistoryHabitId(h.id)
    setHistoryDates([])
    setHistoryLoading(true)
    try {
      const r = await authedFetch(`/api/habits/${h.id}/history`)
      if (r && r.ok) { const d = await r.json() as { dates: string[] }; setHistoryDates(d.dates) }
      else if (r) setHabitsErr(true)
    } catch { setHabitsErr(true) }
    finally { setHistoryLoading(false) }
  }

  // Toggle a check-in for an arbitrary date (today or retroactive). Optimistically
  // updates the row's week strip / weekly count and the open heatmap, then
  // reconciles streaks from the server's recomputed HabitDto.
  const toggleDate = async (h: Habit, date: string, currentlyDone: boolean) => {
    const on = !currentlyDone
    const today = todayKey()
    const wk = currentWeekKeys()
    const recent = last7Keys()
    const toggleIn = (arr: string[]) => (on ? [...arr.filter(d => d !== date), date].sort() : arr.filter(d => d !== date))
    setHabits(hs => hs.map(x => (x.id === h.id ? {
      ...x,
      doneToday: date === today ? on : x.doneToday,
      weekDates: wk.has(date) ? toggleIn(x.weekDates) : x.weekDates,
      thisWeekCount: wk.has(date) ? Math.max(0, x.thisWeekCount + (on ? 1 : -1)) : x.thisWeekCount,
      recentDates: recent.has(date) ? toggleIn(x.recentDates) : x.recentDates,
    } : x)))
    if (historyHabitId === h.id) {
      setHistoryDates(ds => (on ? [...ds.filter(d => d !== date), date].sort() : ds.filter(d => d !== date)))
    }
    const r = on
      ? await authedFetch(`/api/habits/${h.id}/checkins?today=${today}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }),
        })
      : await authedFetch(`/api/habits/${h.id}/checkins/${date}?today=${today}`, { method: 'DELETE' })
    if (r && r.ok) { const updated = await r.json() as Habit; setHabits(hs => hs.map(x => (x.id === h.id ? updated : x))) }
    else { setHabitsErr(true); loadHabits() }
  }

  const toggleToday = (h: Habit) => toggleDate(h, todayKey(), h.doneToday)

  const submitNewHabit = async () => {
    const name = nhName.trim()
    if (!name) return
    setNhBusy(true)
    await createHabit({ name, kind: nhKind, targetCount: nhKind === 'Weekly' ? nhTarget : 1, color: nhColor })
    setNhBusy(false)
    setNewHabitOpen(false)
    setNhName(''); setNhKind('Daily'); setNhTarget(3); setNhColor(PROJECT_COLORS[0])
  }

  // Open the new-goal modal pre-set to a horizon (the + on each tier).
  const openNewGoal = (horizon: GoalHorizon) => {
    setNgHorizon(horizon)
    setNgTitle(''); setNgTarget(''); setNgCurrent(''); setNgUnit(''); setNgDue(''); setNgParent('')
    setNewGoalOpen(true)
  }

  const submitNewGoal = async () => {
    const title = ngTitle.trim()
    if (!title) return
    const metric = GOAL_HORIZONS.find(h => h.key === ngHorizon)!.metric
    setNgBusy(true)
    await createGoal({
      title,
      horizon: ngHorizon,
      parentGoalId: ngParent || null,
      targetValue: metric && ngTarget.trim() ? Number(ngTarget) : null,
      currentValue: metric && ngCurrent.trim() ? Number(ngCurrent) : null,
      unit: metric && ngUnit.trim() ? ngUnit.trim() : null,
      dueDate: metric && ngDue ? ngDue : null,
    })
    setNgBusy(false)
    setNewGoalOpen(false)
  }

  // One habit row — Reminders-style: check circle / progress ring, name, streak,
  // a Mon–Sun strip for daily habits, and a ⋯ menu (rename / target / colour / delete).
  const habitRow = (h: Habit) => {
    const color = h.color || c.accent
    const weekly = h.kind === 'Weekly'
    const subtitle = weekly
      ? `${h.thisWeekCount} of ${h.targetCount} this week${h.currentStreak > 0 ? ` · 🔥 ${h.currentStreak} wk${h.currentStreak === 1 ? '' : 's'}` : ''}`
      : h.currentStreak > 0
        ? `🔥 ${h.currentStreak} day${h.currentStreak === 1 ? '' : 's'}${h.longestStreak > h.currentStreak ? ` · best ${h.longestStreak}` : ''}`
        : 'not started'
    const entries: MenuEntry[] = [
      { kind: 'item', label: 'View history', onClick: () => openHistory(h) },
      { kind: 'item', label: 'Rename', onClick: () => setRenamingHabitId(h.id) },
    ]
    if (weekly) {
      entries.push({ kind: 'item', label: 'Fewer per week', disabled: h.targetCount <= 1, onClick: () => updateHabit(h.id, { targetCount: Math.max(1, h.targetCount - 1) }) })
      entries.push({ kind: 'item', label: 'More per week', disabled: h.targetCount >= 7, onClick: () => updateHabit(h.id, { targetCount: Math.min(7, h.targetCount + 1) }) })
    }
    entries.push({ kind: 'colors', value: color, onPick: (hex) => updateHabit(h.id, { color: hex }) })
    entries.push({ kind: 'divider' })
    entries.push({ kind: 'item', label: 'Delete', danger: true, onClick: () => deleteHabit(h.id) })
    return (
      <div key={h.id} style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        border: `1px solid ${c.hair}`, borderRadius: 12, background: c.surface2,
      }}>
        {weekly
          ? <WeekRing count={h.thisWeekCount} target={h.targetCount} color={color} onClick={() => toggleToday(h)} />
          : <CheckCircle done={h.doneToday} color={color} onClick={() => toggleToday(h)} />}
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {renamingHabitId === h.id ? (
          <span style={{ flex: 1, minWidth: 0 }}>
            <InlineEdit
              value={h.name}
              style={{ fontSize: 15, width: '100%', boxSizing: 'border-box' }}
              onCommit={(v) => { const t = v.trim(); if (t && t !== h.name) updateHabit(h.id, { name: t }); setRenamingHabitId(null) }}
              onCancel={() => setRenamingHabitId(null)}
            />
            <span style={{ display: 'block', ...mono, fontSize: 10, color: c.faint, marginTop: 2 }}>{subtitle}</span>
          </span>
        ) : (
          <button
            className="fr-press"
            onClick={() => openHistory(h)}
            aria-label={`View history for ${h.name}`}
            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <span style={{ display: 'block', ...T.taskTitle, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h.icon ? `${h.icon} ` : ''}{h.name}
            </span>
            <span style={{ display: 'block', ...mono, fontSize: 10, color: c.faint, marginTop: 2 }}>{subtitle}</span>
          </button>
        )}
        <DayStrip recentDates={h.recentDates} color={color} onToggle={(d, done) => toggleDate(h, d, done)} />
        <MenuButton ariaLabel={`Options for ${h.name}`} entries={entries} />
      </div>
    )
  }

  /* ----- auth: render the Google button into the login gate ----- */
  useEffect(() => {
    if (!authResolved || auth || !GOOGLE_ON) return
    let cancelled = false
    loadGis().then(() => {
      if (cancelled || !gisRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google
      if (!g?.accounts?.id) return
      g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (resp: { credential: string }) => handleCredential(resp.credential) })
      gisRef.current.innerHTML = ''
      // Fit the button to the gate column (GIS clamps width to [200, 400]).
      const w = Math.max(200, Math.min(400, Math.round(gisRef.current.clientWidth || 300)))
      g.accounts.id.renderButton(gisRef.current, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', width: w })
    }).catch(() => { /* blocked / offline */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, auth])

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
  // Tasks belonging to a completed (archived) project are excluded from the
  // active focus surfaces — the suggestion engine and the Today picker — so
  // ending a project actually stops it pulling at your attention. The task
  // records themselves are kept (visible in the project drawer, restored on
  // reopen); only their done/open state is left untouched.
  const doneBasketIds = useMemo(() => new Set(state.baskets.filter(b => b.completedAt).map(b => b.id)), [state.baskets])
  const openTasks = state.tasks.filter(t => !t.done && !(t.basketId && doneBasketIds.has(t.basketId)))
  // Inbox = loose, *untriaged* tasks. A task you've committed to Today is no
  // longer "waiting in the inbox" — it shows in the Today list instead, so we
  // exclude it here. (The task still has basketId null; when today.ids resets
  // at the next day rollover, any unfinished one falls back into this list.)
  const inbox = state.tasks.filter(t => !t.basketId && !state.today.ids.includes(t.id))
  const todayTasks = state.today.ids
    .map(id => state.tasks.find(t => t.id === id))
    .filter((t): t is Task => !!t)

  const suggestion = useMemo(() => {
    // GTD "Engage" works off *clarified* lists, never the inbox. Inbox items
    // are unprocessed capture — they're ineligible for NOW DO until filed into
    // a project (see the Clarify nudge in the Router card).
    const pool = openTasks.filter(t => t.basketId && !skipped.includes(t.id) && t.id !== timer.taskId)
    if (!pool.length) return null
    const basketStatus = new Map(state.baskets.map(b => [b.id, b.status]))
    // Priority is *tiered*, not a blend: a committed-for-today task always
    // outranks any non-today task, ongoing projects outrank maintenance, and
    // both outrank the rest (next/backlog/someday). Each tier is spaced far
    // above the energy+age score (max ~230) so the tier ordering is absolute;
    // energy match and staleness only break ties *within* a tier.
    const TIER = 10000
    const tierOf = (t: Task) => {
      if (state.today.ids.includes(t.id)) return 4 // today's commitments, always first
      switch (basketStatus.get(t.basketId!)) {
        case 'ongoing': return 3
        case 'maintenance': return 2
        default: return 1 // next / backlog / someday
      }
    }
    const scored = pool.map(t => {
      let s = tierOf(t) * TIER
      const gap = Math.abs(E_SCORE[t.energy] - E_SCORE[energy])
      s += (2 - gap) * 100
      s += Math.min(daysOld(t.createdAt), 10) * 3
      return { t, s }
    }).sort((a, b) => b.s - a.s)
    const best = scored[0].t
    const basket = state.baskets.find(b => b.id === best.basketId)
    const why = [
      `${best.mins}m`,
      best.energy + ' energy',
      ...(state.today.ids.includes(best.id)
        ? ['today pick']
        : basket?.status === 'ongoing' ? ['ongoing']
        : basket?.status === 'maintenance' ? ['maintenance']
        : []),
      basket ? `from "${basket.name}"` : 'inbox',
      daysOld(best.createdAt) > 0 ? `${daysOld(best.createdAt)}d old` : 'added today',
    ]
    return { task: best, why }
  }, [state.tasks, skipped, energy, timer.taskId, state.baskets, openTasks, state.today.ids])

  const tStats = state.stats[todayKey()] ?? ZERO_DAY

  /* ----- actions ----- */
  const addTask = () => {
    let title = input.trim()
    if (!title) return
    let basketId: string | null = addDest === 'inbox' ? null : addDest
    // The selected destination may have been deleted or completed in the
    // Projects tab — a dead/archived basketId would strand the task. Fall
    // back to inbox.
    if (basketId && !state.baskets.some(b => b.id === basketId && !b.completedAt)) basketId = null
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

  const addToToday = (id: string) =>
    setState(s => (s.today.ids.length >= TODAY_CAP || s.today.ids.includes(id))
      ? s
      : { ...s, today: { date: todayKey(), ids: [...s.today.ids, id] } })

  const removeFromToday = (id: string) =>
    setState(s => ({ ...s, today: { ...s.today, ids: s.today.ids.filter(x => x !== id) } }))

  // On-demand today task: lands in the Inbox (the default project) AND on
  // the today list.
  const addTodayTask = () => {
    const title = todayDraft.trim()
    if (!title) return
    const t: Task = { id: uid(), title, mins: addMins, energy: addEnergy, basketId: null, done: false, createdAt: Date.now() }
    setState(s => s.today.ids.length >= TODAY_CAP ? s : ({
      ...s,
      tasks: [...s.tasks, t],
      today: { date: todayKey(), ids: [...s.today.ids, t.id] },
    }))
    setTodayDraft('')
  }

  const moveTask = (id: string, basketId: string | null) =>
    setState(s => ({ ...s, tasks: s.tasks.map(t => (t.id === id ? { ...t, basketId } : t)) }))

  // Clarify: an inbox item that's really a multi-step outcome becomes its own
  // project. The item's text names the project (the desired outcome); the loose
  // task is consumed, and we open the new project so you can define the next
  // action — the GTD move when capture turns out to be a project.
  const makeProjectFromTask = (t: Task) => {
    const id = uid()
    setState(s => ({
      ...s,
      baskets: [...s.baskets, { id, name: t.title, status: 'next', color: PROJECT_COLORS[s.baskets.length % PROJECT_COLORS.length] }],
      tasks: s.tasks.filter(x => x.id !== t.id),
    }))
    setView('projects')
    setSelectedId(id)
  }

  const createBasket = (name: string, status: BasketStatus = 'backlog') => {
    const v = name.trim()
    if (!v) return
    const id = uid()
    setState(s => {
      // Respect the Ongoing cap on creation — overflow lands in Up next.
      const lane: BasketStatus = status === 'ongoing' && s.baskets.filter(b => b.status === 'ongoing' && !b.completedAt).length >= ONGOING_CAP ? 'next' : status
      return { ...s, baskets: [...s.baskets, { id, name: v, status: lane, color: PROJECT_COLORS[s.baskets.length % PROJECT_COLORS.length] }] }
    })
    setView('projects')
    setSelectedId(id)
  }

  const renameBasket = (id: string, name: string) => {
    const v = name.trim()
    if (v) setState(s => ({ ...s, baskets: s.baskets.map(x => (x.id === id ? { ...x, name: v } : x)) }))
  }

  const setBasketColor = (id: string, color: string) =>
    setState(s => ({ ...s, baskets: s.baskets.map(x => (x.id === id ? { ...x, color } : x)) }))

  // Show a transient "X · Undo" toast that reverts via the given closure.
  const offerUndo = (msg: string, undo: () => void) => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoState({ msg, undo })
    undoTimer.current = setTimeout(() => setUndoState(null), 6000)
  }

  // No confirm dialog — delete immediately, offer Undo for a few seconds.
  const deleteBasket = (b: Basket) => {
    const ts = state.tasks.filter(t => t.basketId === b.id)
    setState(s => ({
      ...s,
      baskets: s.baskets.filter(x => x.id !== b.id),
      tasks: s.tasks.filter(t => t.basketId !== b.id),
    }))
    if (addDest === b.id) setAddDest('inbox')
    if (selectedId === b.id) setSelectedId(null)
    offerUndo(`Deleted "${b.name}"`, () =>
      setState(s => ({ ...s, baskets: [...s.baskets, b], tasks: [...s.tasks, ...ts] })))
  }

  // Complete a project: it leaves the lanes for the Completed shelf. Tasks are
  // left as-is, so Reopen (or Undo) restores it exactly.
  const completeBasket = (b: Basket) => {
    setState(s => ({ ...s, baskets: s.baskets.map(x => (x.id === b.id ? { ...x, completedAt: Date.now() } : x)) }))
    if (selectedId === b.id) setSelectedId(null)
    offerUndo(`Completed "${b.name}"`, () =>
      setState(s => ({ ...s, baskets: s.baskets.map(x => (x.id === b.id ? { ...x, completedAt: undefined } : x)) })))
  }

  const reopenBasket = (id: string) =>
    setState(s => ({ ...s, baskets: s.baskets.map(x => (x.id === id ? { ...x, completedAt: undefined } : x)) }))

  const runUndo = () => {
    if (!undoState) return
    undoState.undo()
    setUndoState(null)
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }

  const setBasketStatus = (id: string, status: BasketStatus) =>
    setState(s => {
      const ongoing = s.baskets.filter(b => b.status === 'ongoing' && !b.completedAt && b.id !== id).length
      if (status === 'ongoing' && ongoing >= ONGOING_CAP) return s
      return { ...s, baskets: s.baskets.map(b => (b.id === id ? { ...b, status } : b)) }
    })

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

  const toggleMusic = () => {
    setMusicErr(false)
    if (musicOn) {
      audioRef.current?.pause()
      setMusicOn(false)
    } else if (STATIONS[station].kind === 'stream') {
      const a = audioRef.current
      if (!a) return
      a.play().catch(() => { setMusicErr(true); setMusicOn(false) })
      setMusicOn(true)
    } else {
      // youtube: mounting the autoplay iframe (root-level) starts playback.
      setMusicOn(true)
    }
  }

  const switchStation = (i: number) => { setMusicErr(false); setStation(i) }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `focus-router-${todayKey()}.json`
    a.click()
  }

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const k = dateKey(d)
    return {
      k,
      label: d.toLocaleDateString('en', { weekday: 'narrow' }),
      v: state.stats[k]?.mins ?? 0,
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

  // Bedtime wind-down banner: due unless already dismissed for tonight.
  const bedBanner = bedtimeBanner(
    state.tweaks.bedtime,
    state.tweaks.windDownMins ?? DEFAULT_WINDDOWN,
    clock,
    inFocus,
  )

  // Still checking the stored token on boot.
  if (!authResolved) {
    return <div style={{ ...mono, padding: 44, color: c.dim, fontSize: 12, letterSpacing: '0.08em' }}>loading…</div>
  }

  // Hard login gate — the app is database-backed and requires an account.
  if (!auth) {
    const gateInput: CSSProperties = {
      width: '100%', boxSizing: 'border-box', padding: '10px 12px',
      borderRadius: 10, border: `1px solid ${c.line}`, background: c.surface2, color: c.text,
      fontFamily: 'var(--sans)', fontSize: 14,
    }
    const gateLabel: CSSProperties = {
      display: 'block', fontFamily: 'var(--sans)', fontSize: 11.5, fontWeight: 600,
      color: c.dim, marginBottom: 6, letterSpacing: '0.005em',
    }
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: c.bg }}>
        <div style={{ width: 360, maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, justifyContent: 'center', marginBottom: 22 }}>
            <Mark size={30} />
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>Focus Router</span>
          </div>
          <div style={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 16, boxShadow: 'var(--shadow-lift)', padding: 24 }}>
            <h1 style={{ fontFamily: 'var(--sans)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 4px', color: c.text }}>
              {authMode === 'login' ? 'Log in' : 'Create account'}
            </h1>
            <div style={{ ...mono, fontSize: 10, color: c.faint, marginBottom: 18 }}>
              Sign in to access your tasks, projects, habits and goals.
            </div>

            {GOOGLE_ON && (
              <>
                <div ref={gisRef} style={{ display: 'flex', justifyContent: 'center', colorScheme: 'light', marginBottom: 14 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
                  <div style={{ flex: 1, height: 1, background: c.hair }} />
                  <span style={{ ...mono, fontSize: 9.5, color: c.faint }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: c.hair }} />
                </div>
              </>
            )}

            <form onSubmit={e => { e.preventDefault(); submitEmailAuth() }}>
              <label htmlFor="gate-email" style={gateLabel}>Email</label>
              <input
                id="gate-email" className="fr-in" type="email" autoComplete="email" autoFocus
                placeholder="you@example.com"
                value={emailField} onChange={e => setEmailField(e.target.value)}
                style={{ ...gateInput, marginBottom: 14 }}
              />
              <label htmlFor="gate-password" style={gateLabel}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="gate-password" className="fr-in" type={pwShow ? 'text' : 'password'}
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={authMode === 'login' ? 'Your password' : 'At least 8 characters'}
                  value={pwField} onChange={e => setPwField(e.target.value)}
                  style={{ ...gateInput, paddingRight: 44 }}
                />
                <button
                  type="button" onClick={() => setPwShow(v => !v)}
                  aria-label={pwShow ? 'Hide password' : 'Show password'} aria-pressed={pwShow}
                  className="fr-press"
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: c.faint, cursor: 'pointer', borderRadius: 8 }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {pwShow
                      ? <><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M3 3l18 18" /><path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" /></>
                      : <><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
              {authErr && (
                <div role="alert" aria-live="polite" style={{ ...T.body, fontSize: 12, color: c.down, marginTop: 10 }}>{authErr}</div>
              )}
              <button
                type="submit" disabled={authBusy} className="fr-btn"
                style={{ width: '100%', marginTop: 14, padding: '10px 12px', borderRadius: 10, background: c.accent, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: authBusy ? 'default' : 'pointer', opacity: authBusy ? 0.65 : 1 }}
              >
                {authBusy ? 'Please wait…' : authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>

            <div style={{ ...T.body, fontSize: 12.5, color: c.dim, marginTop: 14, textAlign: 'center' }}>
              {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => { setAuthMode(m => (m === 'login' ? 'register' : 'login')); setAuthErr(null) }}
                style={{ background: 'none', border: 'none', padding: 0, color: c.accent, fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}
              >
                {authMode === 'login' ? 'Create one' : 'Log in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Authed but the user's state blob is still loading from the server.
  if (!stateLoaded) {
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

  /* ----- task row (projects tab) — works for inbox and project lists ----- */
  const taskRow = (t: Task, dotColor?: string, pullToday = false) => {
    const age = daysOld(t.createdAt)
    const aged = age >= 3 && !t.done
    const taskMenu: MenuEntry[] = [
      {
        kind: 'item', label: 'Add to today', onClick: () => addToToday(t.id),
        disabled: t.done || state.today.ids.includes(t.id) || state.today.ids.length >= TODAY_CAP,
      },
      ...(t.basketId === null
        ? [{ kind: 'divider' } as MenuEntry, { kind: 'label', label: 'Clarify' } as MenuEntry,
           { kind: 'item', label: 'Make a project', onClick: () => makeProjectFromTask(t) } as MenuEntry]
        : []),
      { kind: 'label', label: 'Move to' },
      ...(t.basketId !== null ? [{ kind: 'item', label: 'Inbox', onClick: () => moveTask(t.id, null) } as MenuEntry] : []),
      ...state.baskets.filter(x => x.id !== t.basketId && !x.completedAt).map<MenuEntry>(x => ({
        kind: 'item', label: x.name, onClick: () => moveTask(t.id, x.id),
      })),
      { kind: 'divider' },
      { kind: 'item', label: 'Delete task', onClick: () => removeTask(t.id), danger: true },
    ]
    return (
      <div key={t.id} className="fr-row" style={{
        border: `1px solid ${aged ? c.accentLine : c.hair}`, borderRadius: 10,
        background: aged ? c.accentSoft : c.surface2,
        padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 11,
        opacity: t.done ? 0.42 : 1,
      }}>
        <CheckBox done={t.done} onClick={() => toggleDone(t.id)} />
        {dotColor && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />}
        <span style={{ ...T.taskTitle, textDecoration: t.done ? 'line-through' : 'none', flex: 1, color: c.text }}>{t.title}</span>
        {aged && <span style={{ ...mono, fontSize: 10, color: c.accent, letterSpacing: '0.01em' }}>{age}d · review</span>}
        {pullToday && !t.done && state.today.ids.length < TODAY_CAP && (
          <button
            onClick={() => addToToday(t.id)}
            aria-label={`Add "${t.title}" to today`}
            title="Add to today"
            className="fr-press"
            style={{
              ...mono, fontSize: 11, color: c.accent, flexShrink: 0,
              border: `1px solid ${c.accentLine}`, background: 'transparent',
              borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          ><span aria-hidden="true">↑</span> Today</button>
        )}
        <Tag>{t.mins}m</Tag>
        <Tag>{t.energy}</Tag>
        <MenuButton ariaLabel={`Options for task "${t.title}"`} entries={taskMenu} />
      </div>
    )
  }

  /* ----- widgets ----- */
  const wWord = state.widgets.word && (
    <Card label="Word of the day" dim={inFocus} compact style={{ minWidth: 0 }}>
      <div style={{ ...T.word, fontSize: 17, color: c.text }}>{WORDS[di % WORDS.length][0]}</div>
      <div style={{ ...T.body, fontSize: 11.5, lineHeight: 1.45, color: c.dim, marginTop: 3 }}>{WORDS[di % WORDS.length][1]}</div>
    </Card>
  )

  const wTip = state.widgets.tip && (
    <Card label="Learning tip" dim={inFocus} compact style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>
        {TIPS[tipIdx][0]}
      </div>
      <div style={{ ...T.body, fontSize: 11.5, lineHeight: 1.4, color: c.dim, marginTop: 3 }}>
        {TIPS[tipIdx][1]}
      </div>
      <a
        href={TIPS[tipIdx][2]}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
          fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600, color: c.accent,
          textDecoration: 'none', letterSpacing: '0.01em',
        }}
      >Read more <span aria-hidden="true">↗</span></a>
    </Card>
  )

  // BTC now lives as a small ticker next to the date in the header (see below).

  // Stays interactive during focus (no dim) — adjusting music mid-session is
  // exactly when you need it.
  const wMusic = state.widgets.music && (
    <Card label="Focus music" right={musicOn ? 'on air' : undefined} compact style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="fr-press"
          onClick={toggleMusic}
          aria-label={musicOn ? 'Pause music' : 'Play music'}
          style={{
            width: 32, height: 32, borderRadius: 999, flexShrink: 0, padding: 0,
            display: 'grid', placeItems: 'center', cursor: 'pointer',
            background: musicOn ? c.accent : c.surface2,
            color: musicOn ? c.accentInk : c.text2,
            border: `1px solid ${musicOn ? c.accentLine : c.hair}`,
            boxShadow: musicOn ? '0 0 18px -5px var(--accent-glow)' : 'none',
          }}
        >
          {musicOn ? (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
              <rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3.2 1.6 L10.4 6 L3.2 10.4 Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', color: c.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{STATIONS[station].name}</div>
          <div style={{
            ...mono, fontSize: 9.5, color: musicErr ? c.down : c.faint, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {musicErr ? 'stream unavailable — try again' : (musicOn ? 'now playing' : STATIONS[station].genre) + ' · ' + (STATIONS[station].kind === 'stream' ? 'somafm' : 'youtube')}
          </div>
        </div>
        {musicOn && !musicErr && (
          <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2.5, alignItems: 'flex-end', height: 13, flexShrink: 0 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 3, height: 13, borderRadius: 2, background: c.accent, transformOrigin: 'bottom',
                animation: `frEq ${0.9 + i * 0.25}s ease-in-out ${i * 0.15}s infinite`,
              }} />
            ))}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
        {STATIONS.map((s, i) => (
          <Chip key={s.name} active={i === station} onClick={() => switchStation(i)}>{s.tag}</Chip>
        ))}
      </div>
    </Card>
  )

  const statsModal = statsOpen && (
    <div className="fr-modal-backdrop" onClick={() => setStatsOpen(false)}>
      <div className="fr-modal" role="dialog" aria-modal="true" aria-label="Deep work stats" onClick={(e) => e.stopPropagation()}>
        <Card
          label="Deep work stats"
          right={
            <button
              onClick={() => setStatsOpen(false)}
              aria-label="Close stats"
              style={{
                width: 26, height: 26, borderRadius: 7, padding: 0,
                background: 'transparent', border: 'none',
                color: c.dim, cursor: 'pointer', fontSize: 13,
              }}
            >✕</button>
          }
          style={{ width: 'min(620px, calc(100vw - 36px))', boxShadow: 'var(--shadow-lift)' }}
        >
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
      </div>
    </div>
  )

  const customizeModal = customize && (
    <div className="fr-modal-backdrop" onClick={() => setCustomize(false)}>
      <div className="fr-modal" role="dialog" aria-modal="true" aria-label="Customize" onClick={(e) => e.stopPropagation()}>
        <Card
          label="Customize"
          right={
            <button
              onClick={() => setCustomize(false)}
              aria-label="Close customize"
              style={{
                width: 26, height: 26, borderRadius: 7, padding: 0,
                background: 'transparent', border: 'none',
                color: c.dim, cursor: 'pointer', fontSize: 13,
              }}
            >✕</button>
          }
          style={{ width: 'min(560px, calc(100vw - 36px))', boxShadow: 'var(--shadow-lift)' }}
        >
          {/* widgets */}
          <div style={{ ...T.kicker, fontSize: 10, color: c.faint, marginBottom: 10 }}>Widgets</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: 10 }}>
            {([
              ['word', 'Word of the day'],
              ['tip', 'Learning tip'],
              ['music', 'Focus music'],
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
      </div>
    </div>
  )

  /* ----- quick add card (top row) ----- */
  const qaCard = (
    <Card label="Quick add" dim={inFocus} style={{ minWidth: 0 }}>
      <label className="fr-field" style={{ ...fieldStyle, minWidth: 0 }}>
        <span style={{ color: c.accent, fontSize: 17, fontWeight: 700, lineHeight: 1 }}>+</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
          placeholder="Add a task, hit Enter…"
          style={{ ...inputStyle, fontSize: 13, padding: '11px 0' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 11 }}>
        <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint, marginRight: 2 }}>Time</span>
        {[10, 25, 60].map(m =>
          <Chip key={m} active={addMins === m} onClick={() => setAddMins(m)}>{m}m</Chip>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint, marginRight: 2 }}>Energy</span>
        {ENERGIES.map(e =>
          <Chip key={e} active={addEnergy === e} onClick={() => setAddEnergy(e)}>{e}</Chip>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 11 }}>
        <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint }}>Save to</span>
        <select
          className="fr-sel"
          value={addDest}
          onChange={(e) => setAddDest(e.target.value)}
          style={{
            ...mono, fontSize: 11, border: `1px solid ${c.hair}`, background: c.surface2,
            color: c.text2, borderRadius: 7, padding: '7px 8px', cursor: 'pointer',
            flex: 1, minWidth: 0,
          }}
        >
          <option value="inbox">Inbox</option>
          {state.baskets.filter(b => !b.completedAt).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
    </Card>
  )

  /* ----- today card — up to five committed tasks ----- */
  const todayCard = (
    <Card
      label="Today"
      right={`${todayTasks.filter(t => !t.done).length} open · ${todayTasks.length}/${TODAY_CAP}`}
      dim={inFocus}
      style={{ minWidth: 0 }}
    >
      {todayTasks.length === 0 && (
        <div style={{ ...mono, fontSize: 11, color: c.faint, marginBottom: 10 }}>
          Pick up to {TODAY_CAP} tasks that would make today a win.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {todayTasks.map(t => (
          <div key={t.id} className="fr-row" style={{
            border: `1px solid ${c.hair}`, borderRadius: 10, background: c.surface2,
            padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9,
            opacity: t.done ? 0.42 : 1,
          }}>
            <CheckBox done={t.done} onClick={() => toggleDone(t.id)} />
            <span style={{
              ...T.taskTitle, fontSize: 14, textDecoration: t.done ? 'line-through' : 'none',
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: c.text,
            }}>{t.title}</span>
            <Tag>{t.mins}m</Tag>
            <button
              onClick={() => removeFromToday(t.id)}
              aria-label={`Remove "${t.title}" from today`}
              title="Remove from today (task is kept)"
              style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                background: 'transparent', border: 'none',
                color: c.faint, cursor: 'pointer', fontSize: 12,
              }}
            >✕</button>
          </div>
        ))}
      </div>

      {todayTasks.length < TODAY_CAP && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: todayTasks.length ? 10 : 0 }}>
          <label className="fr-field" style={{
            display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
            border: `1px dashed ${c.line}`, borderRadius: 'var(--r-ctrl)',
            background: 'transparent', padding: '0 11px',
          }}>
            <span style={{ color: c.accent, fontSize: 15, fontWeight: 700, lineHeight: 1 }}>+</span>
            <input
              value={todayDraft}
              onChange={(e) => setTodayDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTodayTask()}
              placeholder="Add for today… (saves to Inbox)"
              style={{
                flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: c.text,
                fontSize: 13, padding: '9px 0', outline: 'none', fontFamily: 'var(--sans)',
              }}
            />
          </label>
          <Btn size="sm" variant={todayPickOpen ? 'soft' : 'neutral'} onClick={() => setTodayPickOpen(v => !v)}>
            ⌁ Pick from projects
          </Btn>
        </div>
      )}

      {todayPickOpen && todayTasks.length < TODAY_CAP && (() => {
        const candidates = openTasks.filter(t => !state.today.ids.includes(t.id))
        return (
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.hair}`,
            display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto',
          }}>
            {candidates.length === 0 && (
              <div style={{ ...mono, fontSize: 10.5, color: c.faint }}>
                No open tasks to pick — add some in Projects or via Quick add.
              </div>
            )}
            {candidates.map(t => (
              <button
                key={t.id}
                className="fr-row"
                onClick={() => { addToToday(t.id); if (state.today.ids.length + 1 >= TODAY_CAP) setTodayPickOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                  textAlign: 'left', padding: '7px 9px', borderRadius: 8,
                  background: 'transparent', border: '1px solid transparent', cursor: 'pointer',
                }}
              >
                <span style={{ color: c.accent, fontSize: 13, fontWeight: 700 }}>+</span>
                <span style={{ ...T.body, fontSize: 13.5, color: c.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                <Tag>{t.mins}m</Tag>
              </button>
            ))}
          </div>
        )
      })()}
    </Card>
  )

  const hideToggle = (
    <Btn size="sm" variant={hideCompleted ? 'soft' : 'outline'} onClick={() => setHideCompleted(v => !v)}>
      {hideCompleted ? 'Show completed' : 'Hide completed'}
    </Btn>
  )

  /* ----- sidebar account chip → Settings (single account/settings entry) ----- */
  // Only present when sync is configured. Sign-in / out / password all live on
  // the Settings page; this chip just shows status and routes there.
  const goSettings = () => { setView('settings'); setSelectedId(null); setCustomize(false); setSidebarOpen(false) }
  const accountSection = SYNC_ON ? (() => {
    const onSettings = view === 'settings'
    const initial = (auth?.user.name ?? auth?.user.email ?? '?').trim().charAt(0).toUpperCase()
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.hair}` }}>
        <button
          onClick={goSettings}
          aria-label="Account & settings"
          aria-current={onSettings ? 'page' : undefined}
          className="fr-nav"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            padding: '8px 10px', borderRadius: 12, cursor: 'pointer', minHeight: 48,
            border: `1px solid ${onSettings ? c.accentLine : c.hair}`,
            background: onSettings ? c.accentSoft : c.surface2,
          }}
        >
          {auth?.user.picture ? (
            <img src={auth.user.picture} alt="" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
          ) : (
            <span aria-hidden="true" style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
              background: auth ? c.accentSoft : c.surface3, color: auth ? c.accent : c.faint,
              fontSize: 13, fontWeight: 700, border: `1px solid ${c.hair}`,
            }}>{auth ? initial : '⚙'}</span>
          )}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {auth ? (auth.user.name ?? auth.user.email) : 'Account & sync'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, ...mono, fontSize: 9.5, color: auth ? (syncErr ? c.down : c.up) : c.faint, marginTop: 2 }}>
              {auth && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: syncErr ? c.down : c.up, flexShrink: 0 }} />}
              {auth ? (syncErr ? 'sync paused' : 'synced') : 'not signed in'}
            </span>
          </span>
          <span aria-hidden="true" style={{ color: c.faint, fontSize: 15, flexShrink: 0, lineHeight: 1 }}>›</span>
        </button>
      </div>
    )
  })() : null

  const drawerProject = state.baskets.find(b => b.id === selectedId) ?? null

  return (
    <div className="fr-shell" style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <Helmet>
        <title>Focus Router</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
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
        .fr-sel:hover{border-color:var(--line);color:var(--text-2);}
        @keyframes frPulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes frEq{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
        .fr-main{display:flex; flex-direction:column; gap:18px;}
        .fr-focuscol{min-width:0; display:flex; flex-direction:column; gap:18px;}
        .fr-plancol{min-width:0; display:flex; flex-direction:column; gap:16px;}
        .fr-ambient{display:flex; flex-direction:column; gap:16px;}
        .fr-pomo{min-height:300px;}
        .fr-nav{cursor:pointer;}
        .fr-mi:not(:disabled):hover{background:var(--surface-3);}
        .fr-nav:not([aria-current="page"]):not([aria-pressed="true"]):hover{background:var(--surface-2);color:var(--text-2);}
        .fr-sidenav{
          position:fixed; top:0; bottom:0; left:0; width:272px; max-width:86vw;
          background:var(--surface); border-right:1px solid var(--hair);
          padding:22px 14px;
          padding-top:max(22px, env(safe-area-inset-top));
          padding-bottom:max(22px, env(safe-area-inset-bottom));
          display:flex; flex-direction:column; z-index:60;
          transform:translateX(-101%); transition:transform .24s cubic-bezier(.2,.7,.2,1);
        }
        .fr-sidenav-open{transform:translateX(0); box-shadow:var(--shadow-lift);}
        .fr-backdrop{
          position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:59;
          opacity:0; pointer-events:none; transition:opacity .22s ease;
        }
        .fr-backdrop-open{opacity:1; pointer-events:auto;}
        .fr-topbar-mobile{display:flex; align-items:center; justify-content:space-between; gap:12px;}
        .fr-content{min-width:0; padding:26px 18px 76px;}
        .fr-modal-backdrop{
          position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:80;
          display:grid; place-items:center; padding:18px;
        }
        .fr-modal{animation:frModalIn .18s cubic-bezier(.2,.7,.2,1);}
        @keyframes frModalIn{from{opacity:0; transform:translateY(8px) scale(.97)} to{opacity:1; transform:none}}
        .fr-drawer-backdrop{
          position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:74;
          animation:frFade .2s ease;
        }
        @keyframes frFade{from{opacity:0} to{opacity:1}}
        .fr-rise{animation:frRise .26s ease both;}
        @keyframes frRise{from{opacity:0; transform:translateY(-6px)} to{opacity:1; transform:none}}
        .fr-drawer{
          position:fixed; top:0; right:0; bottom:0; width:min(460px, 94vw);
          background:var(--surface); border-left:1px solid var(--hair); z-index:75;
          display:flex; flex-direction:column; padding:24px 22px;
          padding-top:max(24px, env(safe-area-inset-top));
          padding-bottom:max(24px, env(safe-area-inset-bottom));
          overflow-y:auto; box-shadow:var(--shadow-lift);
          animation:frDrawerIn .26s cubic-bezier(.2,.7,.2,1);
        }
        @keyframes frDrawerIn{from{transform:translateX(101%)} to{transform:translateX(0)}}
        @media (min-width:981px){
          .fr-shell{display:grid; grid-template-columns:248px minmax(0,1fr);}
          .fr-sidenav{
            position:sticky; top:0; height:100vh; height:100dvh;
            width:auto; max-width:none; align-self:start;
            transform:none; transition:none; box-shadow:none;
          }
          .fr-backdrop{display:none;}
          .fr-topbar-mobile{display:none;}
          /* Option C — ambient widgets in a top strip; focus zone (router
             stacked over pomodoro) + plan zone (capture + today) side by side */
          .fr-main{
            display:grid; gap:16px; align-items:start;
            grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr);
          }
          .fr-content{padding:20px 18px 28px;}
          .fr-focuscol{display:flex; flex-direction:column; gap:14px;}
          .fr-plancol{display:flex; flex-direction:column; gap:16px;}
          .fr-ambient{display:grid; grid-template-columns:repeat(auto-fit, minmax(220px,1fr)); gap:18px;}
          .fr-pomo{min-height:248px;}
        }
      `}</style>

      <SideNav
        view={view}
        onView={(v) => { setView(v); setSelectedId(null); setCustomize(false) }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        inboxCount={inbox.filter(t => !t.done).length}
        projectCount={state.baskets.filter(b => !b.completedAt).length}
        habitCount={habits.filter(h => !h.archived && !h.doneToday).length}
        goalCount={goals.filter(g => g.horizon === 'Year' && g.status === 'Active').length}
        footer={accountSection}
      />
      <div
        className={'fr-backdrop' + (sidebarOpen ? ' fr-backdrop-open' : '')}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      {/* Root-mounted so the stream keeps playing across tab switches. */}
      <audio
        ref={audioRef}
        src={STATIONS[station].kind === 'stream' ? STATIONS[station].url : undefined}
        preload="none"
        onError={() => { if (musicOn && STATIONS[station].kind === 'stream') { setMusicErr(true); setMusicOn(false) } }}
      />
      {/* YouTube stations play through a hidden, root-mounted iframe. Keyed on the
          video id so switching stations remounts (and autoplays) the new track. */}
      {musicOn && STATIONS[station].kind === 'youtube' && STATIONS[station].videoId && (
        <iframe
          key={STATIONS[station].videoId}
          title={STATIONS[station].name}
          src={`https://www.youtube-nocookie.com/embed/${STATIONS[station].videoId}?autoplay=1&modestbranding=1&rel=0&loop=1&playlist=${STATIONS[station].videoId}`}
          allow="autoplay; encrypted-media"
          loading="lazy"
          style={{ border: 0, width: 0, height: 0, opacity: 0, position: 'absolute' }}
          aria-hidden="true"
        />
      )}
      <main className="fr-content">
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: SP.xl }}>

        {/* ---------- mobile topbar (hamburger opens the sidebar drawer) ---------- */}
        <div className="fr-topbar-mobile">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 42, height: 42, borderRadius: 'var(--r-ctrl)',
              border: `1px solid ${c.hair}`, background: c.surface,
              color: c.text, fontSize: 17,
            }}
          >☰</button>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mark size={24} />
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>Focus Router</span>
          </span>
          <span style={{ width: 42 }} aria-hidden="true" />
        </div>

        {/* ---------- header: page title + date ---------- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>
            {view === 'dashboard' ? 'Dashboard' : view === 'inbox' ? 'Inbox' : view === 'settings' ? 'Settings' : view === 'habits' ? 'Habits' : view === 'goals' ? 'Goals' : 'Projects'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="fr-btn"
              onClick={() => setStatsOpen(true)}
              aria-haspopup="dialog"
              aria-label="Open deep work stats"
              title="Deep work stats"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 999, padding: 0,
                border: `1px solid ${c.hair}`, background: c.surface, color: c.dim,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
                <rect x="1" y="7" width="3" height="6" rx="1" fill="currentColor" />
                <rect x="5.5" y="4" width="3" height="9" rx="1" fill="currentColor" />
                <rect x="10" y="1" width="3" height="12" rx="1" fill="currentColor" />
              </svg>
            </button>
            <button
              className="fr-btn"
              onClick={() => setCustomize(true)}
              aria-haspopup="dialog"
              aria-label="Open customize"
              title="Customize"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 999, padding: 0,
                border: `1px solid ${c.hair}`, background: c.surface, color: c.dim, fontSize: 14,
              }}
            >⚙</button>
            {btc && btc.p !== undefined && (
              <span
                title="Bitcoin · 24h change"
                style={{
                  ...mono, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                  border: `1px solid ${c.hair}`, borderRadius: 999, padding: '6px 13px', background: c.surface,
                }}
              >
                <span style={{ color: c.faint }}>BTC</span>
                <span style={{ color: c.text2, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${btc.p.toLocaleString()}</span>
                <span style={{ color: (btc.c ?? 0) >= 0 ? c.up : c.down }}>{(btc.c ?? 0) >= 0 ? '▲' : '▼'}{Math.abs(btc.c ?? 0).toFixed(1)}%</span>
              </span>
            )}
            <div style={{
              ...mono, fontSize: 11, color: c.dim, letterSpacing: '0.02em',
              border: `1px solid ${c.hair}`, borderRadius: 999, padding: '6px 13px', background: c.surface,
            }}>
              {new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
            </div>
          </div>
        </div>

        {/* ================= DASHBOARD ================= */}
        {view === 'dashboard' && (
          <Fragment>
            {/* BEDTIME — escalating wind-down banner (hard workers forget to sleep) */}
            {bedBanner && (() => {
              const tone = bedBanner.tone === 'past'
                ? { bg: 'color-mix(in srgb, var(--down) 13%, transparent)', line: 'color-mix(in srgb, var(--down) 34%, transparent)', fg: c.down }
                : { bg: c.accentSoft, line: c.accentLine, fg: c.accent }
              return (
                <div
                  role="status"
                  className="fr-rise"
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18,
                    background: tone.bg, border: `1px solid ${tone.line}`, borderRadius: 14,
                    padding: '13px 14px',
                  }}
                >
                  <span aria-hidden="true" style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: c.surface, border: `1px solid ${tone.line}`, color: tone.fg, marginTop: 1,
                  }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                    </svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...T.bodyStrong, fontSize: 13.5, color: c.text }}>{bedBanner.title}</div>
                    <div style={{ ...T.body, fontSize: 12.5, color: c.dim, lineHeight: 1.5, marginTop: 2 }}>{bedBanner.body}</div>
                    {inFocus && bedBanner.tone !== 'soon' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <Btn
                          size="sm" variant="outline"
                          onClick={() => setTimer(t => ({ ...t, phase: 'outcome', running: false, endsAt: null }))}
                        >■ End session</Btn>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            {/* AMBIENT ROW — music · word · book across the top */}
            {(wMusic || wWord || wTip) && (
              <div className="fr-ambient">
                {wMusic}
                {wWord}
                {wTip}
              </div>
            )}
            <div className="fr-main">
            {/* FOCUS ZONE — router hero stacked over the pomodoro */}
            <div className="fr-focuscol">
            {/* ROUTER */}
            <Card label="Router" style={{ display: 'flex', flexDirection: 'column' }} dim={inFocus}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint }}>Energy</span>
                <Segmented options={ENERGIES} value={energy} onChange={setEnergy} />
                <span style={{ ...mono, fontSize: 10, color: c.faint }}>auto-set by time · tap to correct</span>
              </div>

              {/* Clarify nudge — process the inbox to zero; the router won't
                  serve unfiled capture, so surface it here instead. */}
              {(() => {
                const toClarify = inbox.filter(t => !t.done).length
                if (toClarify === 0) return null
                return (
                  <button
                    onClick={() => setView('inbox')}
                    className="fr-press"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                      marginTop: 14, background: c.surface2, border: `1px solid ${c.line}`, borderRadius: 10,
                      padding: '9px 13px', cursor: 'pointer',
                    }}
                  >
                    <span aria-hidden="true" style={{ color: c.accent, fontSize: 13 }}>▦</span>
                    <span style={{ ...T.body, fontSize: 12.5, color: c.text2, flex: 1 }}>
                      {toClarify} {toClarify === 1 ? 'item' : 'items'} to clarify in your inbox
                    </span>
                    <span style={{ ...T.bodyStrong, fontSize: 12.5, color: c.accent }}>Clarify →</span>
                  </button>
                )
              })()}

              {suggestion ? (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: c.accent, boxShadow: '0 0 10px 0 var(--accent-glow)',
                    }} />
                    <span style={{ ...T.kicker, fontSize: 10, color: c.accent }}>Now do</span>
                  </div>
                  <div style={{ ...T.suggestion, color: c.text, margin: '10px 0 12px' }}>
                    {suggestion.task.title}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {suggestion.why.map((w, i) =>
                      <Tag key={i} tone={i === 0 ? 'accent' : undefined}>{w}</Tag>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
                  {openTasks.some(t => t.basketId)
                    ? 'All matches skipped — reset skips or add a task.'
                    : inbox.some(t => !t.done)
                      ? 'Nothing filed yet — clarify your inbox above, then it routes.'
                      : 'Nothing queued. Add a task to a project — it routes instantly.'}
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
                justifyContent: 'center', gap: 14,
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

            </div>

            {/* PLAN ZONE — capture + today's committed list */}
            <aside className="fr-plancol">
              {qaCard}
              {todayCard}
            </aside>
            </div>
          </Fragment>
        )}

        {/* ================= INBOX (tasks without a project) ================= */}
        {view === 'inbox' && (() => {
          const all = inbox
          const shown = (hideCompleted ? all.filter(t => !t.done) : all).sort((a, b) => Number(a.done) - Number(b.done))
          const openN = all.filter(t => !t.done).length
          return (
            <Card style={{ minWidth: 0, maxWidth: 760 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 15, minHeight: 30 }}>
                <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>Inbox</span>
                <span style={{ ...mono, fontSize: 11, color: c.faint }}>{openN} open · no project</span>
                <span style={{ flex: 1 }} />
                {all.some(t => t.done) && hideToggle}
              </div>
              {shown.length === 0 && (
                <div style={{ ...mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
                  {all.length === 0 ? 'Empty. Add a loose task below — or capture from the Dashboard.' : 'No open tasks — nicely done.'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shown.map(t => taskRow(t, undefined, true))}
                <input
                  className="fr-in"
                  placeholder="+ add task…  (enter)"
                  value={basketInputs['inbox'] ?? ''}
                  onChange={(e) => setBasketInputs({ ...basketInputs, inbox: e.target.value })}
                  onKeyDown={(e) => {
                    const v = (basketInputs['inbox'] ?? '').trim()
                    if (e.key === 'Enter' && v) {
                      setState(s => ({ ...s, tasks: [...s.tasks, { id: uid(), title: v, mins: 25, energy: 'Med', basketId: null, done: false, createdAt: Date.now() }] }))
                      setBasketInputs({ ...basketInputs, inbox: '' })
                    }
                  }}
                  style={{
                    fontFamily: 'var(--sans)', fontSize: 13,
                    border: `1px dashed ${c.line}`, borderRadius: 10,
                    padding: '10px 12px', outline: 'none', background: 'transparent', color: c.text,
                  }}
                />
              </div>
            </Card>
          )
        })()}

        {/* ================= HABITS ================= */}
        {view === 'habits' && (() => {
          // Habits are server-backed, so the tab needs sync + sign-in.
          if (!SYNC_ON) return (
            <Card style={{ maxWidth: 620 }}>
              <div style={{ ...mono, fontSize: 11, color: c.faint, lineHeight: 1.6 }}>
                Habits sync to your account, but sync isn’t configured for this build.
              </div>
            </Card>
          )
          const active = habits.filter(h => !h.archived)
          const daily = active.filter(h => h.kind === 'Daily')
          const weekly = active.filter(h => h.kind === 'Weekly')
          const doneCount = active.filter(h => h.doneToday).length
          return (
            <Card style={{ minWidth: 0, maxWidth: 760 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 15, minHeight: 30 }}>
                <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>Habits</span>
                <span style={{ ...mono, fontSize: 11, color: c.faint }}>
                  {active.length === 0 ? 'none yet' : `${doneCount}/${active.length} done today`}
                </span>
                <span style={{ flex: 1 }} />
                {habitsErr && <span style={{ ...mono, fontSize: 10, color: c.down }}>sync error</span>}
                <Btn size="sm" variant="primary" onClick={() => setNewHabitOpen(true)}>+ New habit</Btn>
              </div>
              {active.length === 0 && !habitsLoading && (
                <div style={{ ...mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
                  No habits yet. Add a daily habit (like “Meditate”) or a weekly target (like “Work out 3×/week”).
                </div>
              )}
              {daily.length > 0 && <HabitGroup title="Daily">{daily.map(h => habitRow(h))}</HabitGroup>}
              {weekly.length > 0 && <HabitGroup title="Weekly">{weekly.map(h => habitRow(h))}</HabitGroup>}
            </Card>
          )
        })()}

        {/* ================= GOALS ================= */}
        {view === 'goals' && (() => {
          // Goals are server-backed, so the tab needs sync + sign-in (like habits).
          if (!SYNC_ON) return (
            <Card style={{ maxWidth: 620 }}>
              <div style={{ ...mono, fontSize: 11, color: c.faint, lineHeight: 1.6 }}>
                Goals sync to your account, but sync isn’t configured for this build.
              </div>
            </Card>
          )
          const active = goals.filter(g => !g.archived)
          const byHorizon = (k: GoalHorizon) => active.filter(g => g.horizon === k)
          const parentOf = (g: Goal) => g.parentGoalId ? active.find(x => x.id === g.parentGoalId) : undefined

          // SMART goal card (Year tier): progress bar + measurable chips + up-link.
          const smartCard = (g: Goal, tierColor: string) => {
            const dot = g.color || tierColor
            const pct = g.progressPct
            const parent = parentOf(g)
            const done = g.status === 'Completed'
            return (
              <div key={g.id} style={{ background: c.surface2, border: `1px solid ${c.hair}`, borderRadius: 12, padding: '13px 15px', opacity: done ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: pct != null ? 9 : 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  <span style={{ ...T.taskTitle, flex: 1, color: c.text, textDecoration: done ? 'line-through' : 'none' }}>{g.title}</span>
                  {pct != null && g.targetValue != null && (
                    <span style={{ ...mono, fontSize: 12, color: done ? c.up : c.dim }}>
                      {fmtNum(g.currentValue ?? 0)} / {fmtNum(g.targetValue)}{g.unit ? ` ${g.unit}` : ''}
                    </span>
                  )}
                  <MenuButton ariaLabel={`Goal actions: ${g.title}`} entries={[
                    { kind: 'item', label: done ? 'Mark active' : 'Mark complete', onClick: () => updateGoal(g.id, { status: done ? 'Active' : 'Completed' }) },
                    { kind: 'item', label: done ? 'Archive' : 'Achieve & archive', onClick: () => updateGoal(g.id, done ? { archived: true } : { status: 'Completed', archived: true }) },
                    { kind: 'divider' },
                    { kind: 'item', label: 'Delete', danger: true, onClick: () => deleteGoal(g.id) },
                  ]} />
                </div>
                {pct != null && (
                  <div style={{ height: 7, background: c.bg, borderRadius: 99, overflow: 'hidden', marginBottom: 9 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: dot, transition: 'width .3s ease' }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {g.dueDate && <Tag>by {g.dueDate}</Tag>}
                  {pct != null && <Tag>{pct}%</Tag>}
                  {parent && (
                    <span style={{ ...mono, fontSize: 11, fontWeight: 700, borderRadius: 7, padding: '3px 8px', background: c.accentSoft, color: c.accent, whiteSpace: 'nowrap' }}>
                      ↗ {parent.title}
                    </span>
                  )}
                </div>
              </div>
            )
          }

          // Cadence row (Month/Week): Reminders-style checkable line that flips status.
          const cadenceRow = (g: Goal, tierColor: string) => {
            const done = g.status === 'Completed'
            const parent = parentOf(g)
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 10, background: c.surface2, border: `1px solid ${c.hair}` }}>
                <CheckCircle done={done} color={g.color || tierColor} onClick={() => updateGoal(g.id, { status: done ? 'Active' : 'Completed' })} />
                <span style={{ ...T.body, flex: 1, color: done ? c.dim : c.text, textDecoration: done ? 'line-through' : 'none' }}>{g.title}</span>
                {parent && <span style={{ ...mono, fontSize: 10.5, color: c.accent, whiteSpace: 'nowrap' }}>↗ {parent.title}</span>}
                <MenuButton ariaLabel={`Goal actions: ${g.title}`} entries={[
                  { kind: 'item', label: done ? 'Archive' : 'Achieve & archive', onClick: () => updateGoal(g.id, done ? { archived: true } : { status: 'Completed', archived: true }) },
                  { kind: 'divider' },
                  { kind: 'item', label: 'Delete', danger: true, onClick: () => deleteGoal(g.id) },
                ]} />
              </div>
            )
          }

          // Vision/Horizon card (no metric): a left-accented aspiration card.
          const visionCard = (g: Goal, tierColor: string) => (
            <div key={g.id} style={{ background: c.surface2, border: `1px solid ${c.hair}`, borderLeft: `3px solid ${g.color || tierColor}`, borderRadius: '0 12px 12px 0', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...T.taskTitle, color: c.text, marginBottom: g.description ? 3 : 0 }}>{g.title}</div>
                {g.description && <div style={{ ...T.body, fontSize: 12.5, color: c.dim }}>{g.description}</div>}
                {parentOf(g) && <div style={{ ...mono, fontSize: 10.5, color: c.accent, marginTop: 4 }}>↗ {parentOf(g)!.title}</div>}
              </div>
              <MenuButton ariaLabel={`Goal actions: ${g.title}`} entries={[
                { kind: 'item', label: g.status === 'Completed' ? 'Archive' : 'Achieve & archive', onClick: () => updateGoal(g.id, g.status === 'Completed' ? { archived: true } : { status: 'Completed', archived: true }) },
                { kind: 'divider' },
                { kind: 'item', label: 'Delete', danger: true, onClick: () => deleteGoal(g.id) },
              ]} />
            </div>
          )

          // The "Achieved" tab — a monthly histogram of completions + the archived list.
          const renderAchieved = () => {
            const achieved = goals.filter(g => g.archived)
            const hz = (k: GoalHorizon) => GOAL_HORIZONS.find(h => h.key === k)!
            if (achieved.length === 0) {
              return (
                <Card style={{ maxWidth: 620 }}>
                  <div style={{ ...mono, fontSize: 11, color: c.faint, lineHeight: 1.7 }}>
                    Nothing achieved yet. Complete a goal, then archive it — it’ll land here with a
                    monthly history of everything you’ve finished.
                  </div>
                </Card>
              )
            }
            const now = new Date()
            const months = Array.from({ length: 12 }, (_, i) => {
              const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
              return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en', { month: 'short' }), count: 0, current: i === 11 }
            })
            let datedCount = 0
            achieved.forEach(g => {
              if (!g.completedAt) return
              const d = new Date(g.completedAt)
              const m = months.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`)
              if (m) { m.count++; datedCount++ }
            })
            const maxCount = Math.max(1, ...months.map(m => m.count))
            const sorted = [...achieved].sort((a, b) =>
              (b.completedAt ? Date.parse(b.completedAt) : 0) - (a.completedAt ? Date.parse(a.completedAt) : 0))
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: c.surface2, border: `1px solid ${c.hair}`, borderRadius: 12, padding: '14px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                    <span style={{ ...T.kicker, fontSize: 10, color: c.faint }}>Achieved over time</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ ...mono, fontSize: 11, color: c.up }}>{datedCount} in the last year</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 86 }}>
                    {months.map(m => (
                      <div key={m.key} title={`${m.label}: ${m.count} achieved`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                        <span style={{ ...mono, fontSize: 10, color: m.count ? c.text : 'transparent', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{m.count || '0'}</span>
                        <div style={{ width: '100%', maxWidth: 26, height: `${Math.round((m.count / maxCount) * 56)}px`, minHeight: m.count ? 4 : 2, borderRadius: 5, background: m.count ? (m.current ? c.accent : c.up) : c.hair, transition: 'height .3s ease' }} />
                        <span style={{ ...mono, fontSize: 9, color: m.current ? c.text : c.faint }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sorted.map(g => (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 11px', borderRadius: 10, background: c.surface, border: `1px solid ${c.hair}` }}>
                      <span aria-hidden="true" style={{ color: c.up, fontSize: 13, flexShrink: 0 }}>✓</span>
                      <span style={{ ...T.body, flex: 1, minWidth: 0, color: c.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                      <span style={{ ...mono, fontSize: 10, color: hz(g.horizon).color, whiteSpace: 'nowrap' }}>◆ {hz(g.horizon).label}</span>
                      {g.completedAt && <span style={{ ...mono, fontSize: 10.5, color: c.faint, whiteSpace: 'nowrap' }}>{new Date(g.completedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                      <MenuButton ariaLabel={`Achieved goal: ${g.title}`} entries={[
                        { kind: 'item', label: 'Restore to active', onClick: () => updateGoal(g.id, { archived: false, status: 'Active' }) },
                        { kind: 'divider' },
                        { kind: 'item', label: 'Delete', danger: true, onClick: () => deleteGoal(g.id) },
                      ]} />
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: c.text }}>Goals</span>
                <span style={{ ...mono, fontSize: 11, color: c.faint }}>this week up to your 25-year vision</span>
                <span style={{ flex: 1 }} />
                {goalsErr && <span style={{ ...mono, fontSize: 10, color: c.down }}>sync error</span>}
                <Btn size="sm" variant="primary" onClick={() => openNewGoal(goalTab === 'achieved' ? 'Week' : goalTab)}>+ New goal</Btn>
              </div>

              {/* horizon tabs — nearest first, then the achievement history */}
              <div role="tablist" aria-label="Goal horizons" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {[...GOAL_HORIZONS, { key: 'achieved' as const, label: 'Achieved', color: c.up }].map(t => {
                  const on = goalTab === t.key
                  const count = t.key === 'achieved' ? goals.filter(g => g.archived).length : byHorizon(t.key as GoalHorizon).length
                  return (
                    <button
                      key={t.key} role="tab" aria-selected={on} className="fr-press"
                      onClick={() => setGoalTab(t.key as GoalHorizon | 'achieved')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, borderRadius: 999, padding: '7px 13px', cursor: 'pointer', border: `1px solid ${on ? c.accentLine : c.hair}`, background: on ? c.accentSoft : 'transparent', color: on ? c.text : c.dim }}
                    >
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                      {t.label}
                      {count > 0 && <span style={{ ...mono, fontSize: 10.5, color: on ? c.accent : c.faint, fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
                    </button>
                  )
                })}
              </div>

              {/* selected horizon — one tier at a time, no scrolling to reach this week */}
              {goalTab !== 'achieved' && (() => {
                const h = GOAL_HORIZONS.find(x => x.key === goalTab)!
                const tierGoals = byHorizon(h.key)
                return (
                  <div>
                    <div style={{ ...T.kicker, fontSize: 10.5, color: c.faint, margin: '0 0 12px' }}>
                      {h.kicker}{h.parent ? ` · ladders up to ${GOAL_HORIZONS.find(x => x.key === h.parent)!.label.toLowerCase()}` : ''}
                    </div>
                    {tierGoals.length === 0 ? (
                      <button onClick={() => openNewGoal(h.key)} style={{ ...mono, fontSize: 12, color: c.faint, background: 'transparent', border: `1px dashed ${c.hair}`, borderRadius: 11, padding: 14, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                        + Add a {h.label.toLowerCase()} goal
                      </button>
                    ) : (
                      <div style={h.key === 'Horizon5'
                        ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }
                        : { display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {tierGoals.map(g =>
                          h.key === 'Vision25' || h.key === 'Horizon5' ? visionCard(g, h.color)
                          : h.key === 'Year' ? smartCard(g, h.color)
                          : cadenceRow(g, h.color))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {goalTab === 'achieved' && renderAchieved()}
            </div>
          )
        })()}

        {/* ================= SETTINGS ================= */}
        {view === 'settings' && (() => {
          const hasPw = !!(auth?.user.has_password || pwAddDone)
          const showPwForm = auth && (!hasPw || pwChanging)
          const dividerStyle: CSSProperties = { height: 1, background: c.hair, margin: '14px -2px' }
          return (
          <div style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card label="Account">
              {!SYNC_ON ? (
                <div style={{ ...mono, fontSize: 11, color: c.faint, lineHeight: 1.6 }}>
                  Sync isn’t configured for this build, so there’s no account to manage.
                  The app runs fully on this device.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                    {auth.user.picture ? (
                      <img src={auth.user.picture} alt="" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
                    ) : (
                      <span aria-hidden="true" style={{
                        width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                        background: c.accentSoft, color: c.accent, border: `1px solid ${c.accentLine}`, fontSize: 18, fontWeight: 700,
                      }}>{(auth.user.name ?? auth.user.email).trim().charAt(0).toUpperCase()}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: c.text, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auth.user.name ?? auth.user.email}</div>
                      <div style={{ ...mono, fontSize: 11, color: c.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{auth.user.email}</div>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      ...mono, fontSize: 10, color: syncErr ? c.down : c.up,
                      border: `1px solid ${c.hair}`, borderRadius: 999, padding: '4px 10px', background: c.surface2,
                    }}>
                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: syncErr ? c.down : c.up }} />
                      {syncErr ? 'Sync paused' : 'Synced'}
                    </span>
                  </div>
                  <div style={dividerStyle} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn variant="outline" size="sm" onClick={signOut}>Sign out</Btn>
                  </div>
                </>
              )}
            </Card>

            {SYNC_ON && auth && (
              <Card label="Email & password login">
                {!showPwForm ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span aria-hidden="true" style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                      background: 'color-mix(in srgb, var(--up) 16%, transparent)', marginTop: 1,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.up} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7" />
                      </svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...T.body, fontSize: 13.5, color: c.text, fontWeight: 600 }}>Password set</div>
                      <div style={{ ...T.body, fontSize: 12.5, color: c.dim, lineHeight: 1.5, marginTop: 2 }}>
                        You can log in with <b style={{ color: c.text2 }}>{auth.user.email}</b> and your password on any device.
                      </div>
                      <button
                        onClick={() => { setPwChanging(true); setPwAddDone(false); setPwAddField(''); setPwAddErr(null); setPwShow(false) }}
                        className="fr-press"
                        style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, color: c.accent, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--sans)' }}
                      >Change password</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ ...T.body, fontSize: 12.5, color: c.dim, lineHeight: 1.5 }}>
                      {pwChanging
                        ? <>Set a new password for <b style={{ color: c.text }}>{auth.user.email}</b>.</>
                        : <>Add an email/password login for <b style={{ color: c.text }}>{auth.user.email}</b> so you can sign in without Google.</>}
                    </div>
                    <form onSubmit={e => { e.preventDefault(); submitSetPassword() }} style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 360 }}>
                      <label htmlFor="pw-set" style={{ ...mono, fontSize: 10, color: c.faint, letterSpacing: '0.04em' }}>
                        {pwChanging ? 'NEW PASSWORD' : 'PASSWORD'}
                      </label>
                      <div className="fr-field" style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        borderRadius: 10, border: `1px solid ${c.line}`, background: c.surface2, padding: '0 6px 0 12px',
                      }}>
                        <input
                          id="pw-set"
                          className="fr-in"
                          type={pwShow ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="At least 8 characters"
                          value={pwAddField}
                          onChange={e => setPwAddField(e.target.value)}
                          autoFocus
                          style={{
                            flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: c.text,
                            fontFamily: 'var(--sans)', fontSize: 14, padding: '11px 0', outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setPwShow(v => !v)}
                          aria-label={pwShow ? 'Hide password' : 'Show password'}
                          aria-pressed={pwShow}
                          className="fr-press"
                          style={{
                            display: 'grid', placeItems: 'center', width: 32, height: 32, flexShrink: 0,
                            background: 'transparent', border: 'none', color: c.dim, cursor: 'pointer', borderRadius: 8,
                          }}
                        >
                          {pwShow ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c5.5 0 9 6 9 6a13.2 13.2 0 0 1-2.16 2.74M6.5 6.5C3.8 8.1 2 12 2 12s3 6 9 6a8.8 8.8 0 0 0 3.5-.74" /><path d="M3 3l18 18" />
                            </svg>
                          ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {pwAddErr
                        ? <div role="alert" style={{ ...T.body, fontSize: 12, color: c.down }}>{pwAddErr}</div>
                        : <div style={{ ...mono, fontSize: 10, color: c.faint }}>Used together with your email to log in.</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          type="submit"
                          disabled={pwAddBusy}
                          className="fr-btn"
                          style={{
                            padding: '10px 18px', borderRadius: 10,
                            background: c.accent, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
                            cursor: pwAddBusy ? 'default' : 'pointer', opacity: pwAddBusy ? 0.65 : 1,
                          }}
                        >
                          {pwAddBusy ? 'Saving…' : pwChanging ? 'Save password' : 'Set password'}
                        </button>
                        {pwChanging && (
                          <Btn variant="ghost" size="sm" onClick={() => { setPwChanging(false); setPwAddField(''); setPwAddErr(null); setPwShow(false) }}>Cancel</Btn>
                        )}
                      </div>
                    </form>
                  </div>
                )}
              </Card>
            )}

            <Card label="Sleep & wind-down">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...T.body, fontSize: 13.5, color: c.text, fontWeight: 600 }}>Bedtime reminder</div>
                  <div style={{ ...T.body, fontSize: 12.5, color: c.dim, lineHeight: 1.5, marginTop: 2 }}>
                    Set when you want to be asleep. As it nears, the dashboard nudges you to wrap up — because hard workers forget to stop.
                  </div>
                </div>
                <Toggle
                  on={!!state.tweaks.bedtime}
                  onClick={() => setTweak('bedtime', state.tweaks.bedtime ? undefined : '23:00')}
                />
              </div>
              {state.tweaks.bedtime && (() => {
                const W = state.tweaks.windDownMins ?? DEFAULT_WINDDOWN
                return (
                  <>
                    <div style={dividerStyle} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <label htmlFor="bedtime-in" style={{ ...T.body, fontSize: 13, color: c.text2, fontWeight: 600 }}>Bedtime</label>
                      <label className="fr-field" style={{ borderRadius: 10, border: `1px solid ${c.line}`, background: c.surface2, padding: '0 12px' }}>
                        <input
                          id="bedtime-in"
                          type="time"
                          value={state.tweaks.bedtime}
                          onChange={e => setTweak('bedtime', e.target.value || '23:00')}
                          style={{ border: 'none', background: 'transparent', color: c.text, fontFamily: 'var(--sans)', fontSize: 14, padding: '10px 0', outline: 'none', colorScheme: 'dark' }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                      <div>
                        <div style={{ ...T.body, fontSize: 13, color: c.text2, fontWeight: 600 }}>Start wind-down</div>
                        <div style={{ ...mono, fontSize: 10.5, color: c.faint, marginTop: 2 }}>how early the nudges begin</div>
                      </div>
                      <Segmented
                        options={WINDDOWN_OPTS.map(n => `${n} min`)}
                        value={`${W} min`}
                        onChange={v => setTweak('windDownMins', parseInt(v, 10))}
                      />
                    </div>
                    <div style={{ ...mono, fontSize: 10.5, color: c.faint, marginTop: 16, lineHeight: 1.6 }}>
                      Nudges begin at <b style={{ color: c.text2 }}>{fmtHm12(subMinutes(state.tweaks.bedtime!, W))}</b>, building toward bedtime at <b style={{ color: c.text2 }}>{fmtHm12(state.tweaks.bedtime!)}</b>. Dismissing a banner silences it until tomorrow night.
                    </div>
                  </>
                )
              })()}
            </Card>
          </div>
          )
        })()}

        {/* ================= PROJECTS (4 lanes) ================= */}
        {view === 'projects' && (() => {
          const ongoingCount = state.baskets.filter(b => b.status === 'ongoing' && !b.completedAt).length
          const dragged = dragId ? (state.baskets.find(x => x.id === dragId) ?? null) : null
          const completed = state.baskets.filter(b => b.completedAt).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 880 }}>
              {(() => {
                const showMaint = state.tweaks.showMaintenance ?? false
                const maintCount = state.baskets.filter(b => b.status === 'maintenance' && !b.completedAt).length
                const renderLane = (lane: { key: BasketStatus; label: string }) => {
                  const projs = state.baskets.filter(b => b.status === lane.key && !b.completedAt)
                  const laneKey = 'newproj:' + lane.key
                  const ongoingFull = lane.key === 'ongoing' && ongoingCount >= ONGOING_CAP
                  // A full Ongoing lane rejects drops (unless the card is already ongoing).
                  const accepts = !!dragId && !(ongoingFull && dragged?.status !== 'ongoing')
                  return (
                    <section key={lane.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
                        <span style={{ ...T.kicker, fontSize: 10.5, color: lane.key === 'ongoing' ? c.accent : c.dim }}>{lane.label}</span>
                        <span style={{ ...mono, fontSize: 10.5, color: c.faint }}>
                          {lane.key === 'ongoing' ? `${ongoingCount}/${ONGOING_CAP}` : projs.length}
                        </span>
                        {lane.key === 'maintenance' && (
                          <button
                            onClick={() => setState(s => ({ ...s, tweaks: { ...s.tweaks, showMaintenance: false } }))}
                            style={{ ...mono, fontSize: 10.5, color: c.faint, marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            hide
                          </button>
                        )}
                      </div>
                      <div
                        onDragOver={(e) => { if (accepts) { e.preventDefault(); if (overLane !== lane.key) setOverLane(lane.key) } }}
                        onDrop={(e) => { e.preventDefault(); if (accepts && dragId) setBasketStatus(dragId, lane.key); setDragId(null); setOverLane(null) }}
                        style={{
                          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(224px, 1fr))', gap: 10,
                          borderRadius: 12, padding: 5, margin: -5,
                          outline: accepts && overLane === lane.key ? `2px dashed ${c.accentLine}` : '2px dashed transparent',
                          background: accepts && overLane === lane.key ? c.accentSoft : 'transparent',
                          transition: 'background .15s ease, outline-color .15s ease',
                        }}
                      >
                        {projs.map(b => {
                          const open = state.tasks.filter(t => t.basketId === b.id && !t.done).length
                          const total = state.tasks.filter(t => t.basketId === b.id).length
                          return (
                            <button
                              key={b.id}
                              className="fr-row"
                              draggable
                              onDragStart={(e) => { setDragId(b.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', b.id) } catch { /* ignore */ } }}
                              onDragEnd={() => { setDragId(null); setOverLane(null) }}
                              onClick={() => setSelectedId(b.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                                background: c.surface2, border: `1px solid ${dragId === b.id ? c.accentLine : c.hair}`, borderRadius: 12,
                                padding: '13px 14px', cursor: 'grab', minWidth: 0,
                                opacity: dragId === b.id ? 0.4 : 1,
                              }}
                            >
                              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                              <span style={{ ...T.bodyStrong, color: c.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                              <span style={{ ...mono, fontSize: 10.5, color: c.faint, flexShrink: 0 }}>{open}/{total}</span>
                              <span aria-hidden="true" style={{ color: c.faint, fontSize: 14, flexShrink: 0 }}>›</span>
                            </button>
                          )
                        })}
                        <input
                          className="fr-in"
                          aria-label={`New ${lane.label} project`}
                          placeholder={ongoingFull ? 'Ongoing is full (2/2)' : '+ new project…'}
                          disabled={ongoingFull}
                          value={basketInputs[laneKey] ?? ''}
                          onChange={(e) => setBasketInputs({ ...basketInputs, [laneKey]: e.target.value })}
                          onKeyDown={(e) => {
                            const v = (basketInputs[laneKey] ?? '').trim()
                            if (e.key === 'Enter' && v) { createBasket(v, lane.key); setBasketInputs({ ...basketInputs, [laneKey]: '' }) }
                          }}
                          style={{
                            fontFamily: 'var(--sans)', fontSize: 13, minWidth: 0,
                            border: `1px dashed ${c.line}`, borderRadius: 12,
                            padding: '13px 14px', outline: 'none', background: 'transparent',
                            color: c.text, opacity: ongoingFull ? 0.5 : 1,
                          }}
                        />
                      </div>
                    </section>
                  )
                }
                // Maintenance is hidden by default and rendered last (out of the
                // prime second slot) only when the user reveals it via the link.
                return (
                  <>
                    {BASKET_STATUSES.filter(l => l.key !== 'maintenance').map(renderLane)}
                    {showMaint
                      ? renderLane(BASKET_STATUSES.find(l => l.key === 'maintenance')!)
                      : (
                        <button
                          onClick={() => setState(s => ({ ...s, tweaks: { ...s.tweaks, showMaintenance: true } }))}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
                            background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                            color: c.faint, fontSize: 12,
                          }}
                        >
                          <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>›</span>
                          <span style={{ borderBottom: `1px dashed ${c.line}`, paddingBottom: 1 }}>
                            Show maintenance{maintCount > 0 ? ` (${maintCount})` : ''}
                          </span>
                        </button>
                      )}
                  </>
                )
              })()}

              {/* ---------- Completed shelf (archive; reopenable) ---------- */}
              {completed.length > 0 && (
                <section style={{ borderTop: `1px solid ${c.surface3}`, paddingTop: 16 }}>
                  <button
                    onClick={() => setCompletedOpen(o => !o)}
                    aria-expanded={completedOpen}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, marginBottom: completedOpen ? 12 : 0,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    }}
                  >
                    <span aria-hidden="true" style={{ color: c.dim, fontSize: 11, display: 'inline-block', transform: completedOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s ease' }}>▾</span>
                    <span style={{ ...T.kicker, fontSize: 10.5, color: c.dim }}>Completed</span>
                    <span style={{ ...mono, fontSize: 10.5, color: c.faint }}>{completed.length}</span>
                  </button>
                  {completedOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {completed.map(b => {
                        const total = state.tasks.filter(t => t.basketId === b.id).length
                        return (
                          <div
                            key={b.id}
                            className="fr-row"
                            onClick={() => setSelectedId(b.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                              background: c.surface2, border: `1px solid ${c.surface3}`, borderRadius: 12,
                              padding: '11px 14px', cursor: 'pointer', minWidth: 0, opacity: 0.72,
                            }}
                          >
                            <span aria-hidden="true" style={{ color: b.color, fontSize: 15, flexShrink: 0, lineHeight: 1 }}>✓</span>
                            <span style={{ ...T.bodyStrong, color: c.dim, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through', textDecorationColor: c.faint }}>{b.name}</span>
                            {total > 0 && <span style={{ ...mono, fontSize: 10.5, color: c.faint, flexShrink: 0 }}>{total} {total === 1 ? 'task' : 'tasks'}</span>}
                            <span style={{ ...mono, fontSize: 10.5, color: c.faint, flexShrink: 0 }}>{new Date(b.completedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); reopenBasket(b.id) }}
                              className="fr-press"
                              style={{ fontFamily: 'var(--sans)', fontSize: 11.5, color: c.dim, background: 'transparent', border: `1px solid ${c.line}`, borderRadius: 7, padding: '3px 9px', cursor: 'pointer', flexShrink: 0 }}
                            >Reopen</button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )
        })()}
      </div>
      </main>

      {/* ---------- project drawer (slides in from the right) ---------- */}
      {drawerProject && (() => {
        const b = drawerProject
        const all = state.tasks.filter(t => t.basketId === b.id)
        const shown = (hideCompleted ? all.filter(t => !t.done) : all).sort((x, y) => Number(x.done) - Number(y.done))
        const openN = all.filter(t => !t.done).length
        const isDone = !!b.completedAt
        const laneLabel = isDone
          ? `completed · ${new Date(b.completedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : (BASKET_STATUSES.find(s => s.key === b.status)?.label ?? '')
        const ongoingFull = state.baskets.filter(x => x.status === 'ongoing' && !x.completedAt).length >= ONGOING_CAP
        const addKey = 'drawer:' + b.id
        // Completed projects swap the lane controls for a single Reopen action.
        const detailMenu: MenuEntry[] = isDone
          ? [
              { kind: 'item', label: 'Reopen project', onClick: () => reopenBasket(b.id) },
              { kind: 'divider' },
              { kind: 'item', label: 'Rename', onClick: () => setDetailEditing(true) },
              { kind: 'colors', value: b.color, onPick: (hex) => setBasketColor(b.id, hex) },
              { kind: 'divider' },
              { kind: 'item', label: 'Delete project', onClick: () => deleteBasket(b), danger: true },
            ]
          : [
              { kind: 'label', label: 'Move to lane' },
              ...BASKET_STATUSES.filter(s => s.key !== b.status).map<MenuEntry>(s => ({
                kind: 'item',
                label: s.label + (s.key === 'ongoing' && ongoingFull ? ' (full)' : ''),
                onClick: () => setBasketStatus(b.id, s.key),
                disabled: s.key === 'ongoing' && ongoingFull,
              })),
              { kind: 'divider' },
              { kind: 'item', label: 'Complete project', onClick: () => completeBasket(b) },
              { kind: 'item', label: 'Rename', onClick: () => setDetailEditing(true) },
              { kind: 'colors', value: b.color, onPick: (hex) => setBasketColor(b.id, hex) },
              { kind: 'divider' },
              { kind: 'item', label: 'Delete project', onClick: () => deleteBasket(b), danger: true },
            ]
        return (
          <Fragment>
            <div className="fr-drawer-backdrop" onClick={() => setSelectedId(null)} aria-hidden="true" />
            <aside className="fr-drawer" role="dialog" aria-modal="true" aria-label={`Project: ${b.name}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {detailEditing ? (
                  <InlineEdit
                    value={b.name}
                    onCommit={(v) => { renameBasket(b.id, v); setDetailEditing(false) }}
                    onCancel={() => setDetailEditing(false)}
                    style={{ fontSize: 19, fontWeight: 700, flex: 1, minWidth: 0 }}
                  />
                ) : (
                  <span
                    onClick={() => setDetailEditing(true)}
                    title="Rename"
                    style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: b.color, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  >{b.name}</span>
                )}
                <MenuButton ariaLabel={`Options for project "${b.name}"`} entries={detailMenu} />
                <button
                  onClick={() => setSelectedId(null)}
                  aria-label="Close project"
                  style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: c.surface2, color: c.dim, cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
                >✕</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, minHeight: 28 }}>
                <span style={{ ...mono, fontSize: 11, color: c.faint, whiteSpace: 'nowrap' }}>{laneLabel.toLowerCase()} · {openN} open</span>
                <span style={{ flex: 1 }} />
                {all.some(t => t.done) && hideToggle}
              </div>
              {shown.length === 0 && (
                <div style={{ ...mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
                  {all.length === 0 ? 'No tasks yet — add the first below.' : 'No open tasks — all done.'}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shown.map(t => taskRow(t))}
                <input
                  className="fr-in"
                  placeholder="+ add task…  (enter)"
                  value={basketInputs[addKey] ?? ''}
                  onChange={(e) => setBasketInputs({ ...basketInputs, [addKey]: e.target.value })}
                  onKeyDown={(e) => {
                    const v = (basketInputs[addKey] ?? '').trim()
                    if (e.key === 'Enter' && v) {
                      setState(s => ({ ...s, tasks: [...s.tasks, { id: uid(), title: v, mins: 25, energy: 'Med', basketId: b.id, done: false, createdAt: Date.now() }] }))
                      setBasketInputs({ ...basketInputs, [addKey]: '' })
                    }
                  }}
                  style={{
                    fontFamily: 'var(--sans)', fontSize: 13,
                    border: `1px dashed ${c.line}`, borderRadius: 10,
                    padding: '10px 12px', outline: 'none', background: 'transparent', color: c.text,
                  }}
                />
              </div>
            </aside>
          </Fragment>
        )
      })()}
      {statsModal}
      {customizeModal}
      {undoState && (
        <div
          className="fr-modal"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 22, margin: '0 auto', width: 'fit-content',
            zIndex: 90, background: c.surface2, border: `1px solid ${c.line}`, borderRadius: 12,
            boxShadow: 'var(--shadow-lift)', padding: '8px 8px 8px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <span style={{ fontFamily: 'var(--sans)', fontSize: 13, color: c.text }}>{undoState.msg}</span>
          <Btn size="sm" variant="soft" onClick={runUndo}>Undo</Btn>
        </div>
      )}

      {/* ---------- New habit modal ---------- */}
      {newHabitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New habit"
          onClick={() => setNewHabitOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            className="fr-modal"
            onClick={e => e.stopPropagation()}
            style={{ width: 360, maxWidth: '100%', background: c.surface, border: `1px solid ${c.line}`, borderRadius: 16, boxShadow: 'var(--shadow-lift)', padding: 22 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--sans)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: c.text }}>New habit</h2>
              <button onClick={() => setNewHabitOpen(false)} aria-label="Close" className="fr-press" style={{ width: 28, height: 28, borderRadius: 8, padding: 0, background: 'transparent', border: 'none', color: c.dim, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); submitNewHabit() }}>
              <input
                className="fr-in"
                autoFocus
                placeholder="Habit name"
                value={nhName}
                onChange={e => setNhName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 14, borderRadius: 10, border: `1px solid ${c.line}`, background: c.surface2, color: c.text, fontFamily: 'var(--sans)', fontSize: 14 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint }}>Type</span>
                <Segmented options={['Daily', 'Weekly'] as const} value={nhKind} onChange={setNhKind} />
              </div>
              {nhKind === 'Weekly' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint }}>Times / week</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button type="button" className="fr-press" aria-label="Fewer per week" onClick={() => setNhTarget(t => Math.max(1, t - 1))} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.line}`, background: c.surface2, color: c.text, fontSize: 16, lineHeight: 1, padding: 0, cursor: 'pointer' }}>−</button>
                    <span style={{ ...mono, fontSize: 15, fontWeight: 700, color: c.text, minWidth: 14, textAlign: 'center' }}>{nhTarget}</span>
                    <button type="button" className="fr-press" aria-label="More per week" onClick={() => setNhTarget(t => Math.min(7, t + 1))} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${c.line}`, background: c.surface2, color: c.text, fontSize: 16, lineHeight: 1, padding: 0, cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <span style={{ ...T.kicker, fontSize: 9.5, color: c.faint }}>Color</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PROJECT_COLORS.map(hex => (
                    <button key={hex} type="button" aria-label={`Colour ${hex}`} onClick={() => setNhColor(hex)} style={{ width: 20, height: 20, borderRadius: '50%', padding: 0, cursor: 'pointer', background: hex, border: `2px solid ${nhColor === hex ? '#fff' : 'transparent'}` }} />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={nhBusy || !nhName.trim()}
                className="fr-btn"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: c.accent, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (nhBusy || !nhName.trim()) ? 'default' : 'pointer', opacity: (nhBusy || !nhName.trim()) ? 0.6 : 1 }}
              >
                {nhBusy ? 'Adding…' : 'Add habit'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------- New goal modal ---------- */}
      {newGoalOpen && (() => {
        const tier = GOAL_HORIZONS.find(h => h.key === ngHorizon)!
        // Parent options = goals one tier up (the up-link target).
        const parentOpts = tier.parent ? goals.filter(g => !g.archived && g.horizon === tier.parent) : []
        const inStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${c.line}`, background: c.surface2, color: c.text, fontFamily: 'var(--sans)', fontSize: 14 }
        const lbl: CSSProperties = { ...T.kicker, fontSize: 9.5, color: c.faint, display: 'block', marginBottom: 6 }
        return (
          <div
            role="dialog" aria-modal="true" aria-label="New goal"
            onClick={() => setNewGoalOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <div
              className="fr-modal"
              onClick={e => e.stopPropagation()}
              style={{ width: 400, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: c.surface, border: `1px solid ${c.line}`, borderRadius: 16, boxShadow: 'var(--shadow-lift)', padding: 22 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontFamily: 'var(--sans)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: c.text }}>New goal</h2>
                <button onClick={() => setNewGoalOpen(false)} aria-label="Close" className="fr-press" style={{ width: 28, height: 28, borderRadius: 8, padding: 0, background: 'transparent', border: 'none', color: c.dim, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
              <form onSubmit={e => { e.preventDefault(); submitNewGoal() }}>
                <label style={lbl}>Horizon</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {GOAL_HORIZONS.map(h => {
                    const on = ngHorizon === h.key
                    return (
                      <button key={h.key} type="button" onClick={() => { setNgHorizon(h.key); setNgParent('') }} style={{
                        fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '6px 11px', cursor: 'pointer',
                        border: `1px solid ${on ? h.color : c.hair}`,
                        background: on ? `${h.color}22` : 'transparent',
                        color: on ? c.text : c.dim,
                      }}>{h.label}</button>
                    )
                  })}
                </div>

                <input
                  className="fr-in" autoFocus
                  placeholder={tier.metric ? 'e.g. Run 1,000 km this year' : 'e.g. Be financially free'}
                  value={ngTitle} onChange={e => setNgTitle(e.target.value)}
                  style={{ ...inStyle, marginBottom: 14 }}
                />

                {tier.metric && (
                  <>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Current</label>
                        <input className="fr-in" type="number" inputMode="decimal" placeholder="0" value={ngCurrent} onChange={e => setNgCurrent(e.target.value)} style={inStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Target</label>
                        <input className="fr-in" type="number" inputMode="decimal" placeholder="1000" value={ngTarget} onChange={e => setNgTarget(e.target.value)} style={inStyle} />
                      </div>
                      <div style={{ width: 84 }}>
                        <label style={lbl}>Unit</label>
                        <input className="fr-in" placeholder="km" value={ngUnit} onChange={e => setNgUnit(e.target.value)} style={inStyle} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={lbl}>Due date</label>
                      <input className="fr-in" type="date" value={ngDue} onChange={e => setNgDue(e.target.value)} style={inStyle} />
                    </div>
                  </>
                )}

                {tier.parent && (
                  <div style={{ marginBottom: 18 }}>
                    <label style={lbl}>Ladders up to ({GOAL_HORIZONS.find(h => h.key === tier.parent)!.label})</label>
                    {parentOpts.length === 0 ? (
                      <div style={{ ...mono, fontSize: 11, color: c.faint }}>No {GOAL_HORIZONS.find(h => h.key === tier.parent)!.label.toLowerCase()} goal yet — add one first to link upward.</div>
                    ) : (
                      <select value={ngParent} onChange={e => setNgParent(e.target.value)} style={{ ...inStyle, appearance: 'auto' }}>
                        <option value="">— none —</option>
                        {parentOpts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={ngBusy || !ngTitle.trim()}
                  className="fr-btn"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: c.accent, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: (ngBusy || !ngTitle.trim()) ? 'default' : 'pointer', opacity: (ngBusy || !ngTitle.trim()) ? 0.6 : 1 }}
                >
                  {ngBusy ? 'Adding…' : 'Add goal'}
                </button>
              </form>
            </div>
          </div>
        )
      })()}

      {/* ---------- Habit history modal (calendar heatmap + retroactive marking) ---------- */}
      {historyHabitId && (() => {
        const h = habits.find(x => x.id === historyHabitId)
        if (!h) return null
        const color = h.color || c.accent
        const weekly = h.kind === 'Weekly'
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`History: ${h.name}`}
            onClick={() => setHistoryHabitId(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <div
              className="fr-modal"
              onClick={e => e.stopPropagation()}
              style={{ width: 720, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', background: c.surface, border: `1px solid ${c.line}`, borderRadius: 16, boxShadow: 'var(--shadow-lift)', padding: 22 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <h2 style={{ fontFamily: 'var(--sans)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: c.text }}>{h.icon ? `${h.icon} ` : ''}{h.name}</h2>
                <span style={{ ...mono, fontSize: 10, color: c.faint }}>{weekly ? `${h.targetCount}×/week` : 'Daily'}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => setHistoryHabitId(null)} aria-label="Close" className="fr-press" style={{ width: 28, height: 28, borderRadius: 8, padding: 0, background: 'transparent', border: 'none', color: c.dim, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                <StatChip value={`🔥 ${h.currentStreak}`} label={weekly ? (h.currentStreak === 1 ? 'week streak' : 'weeks streak') : (h.currentStreak === 1 ? 'day streak' : 'days streak')} />
                <StatChip value={`${h.longestStreak}`} label={weekly ? 'best · weeks' : 'best · days'} />
                {weekly && <StatChip value={`${h.thisWeekCount}/${h.targetCount}`} label="this week" />}
                <StatChip value={`${historyDates.length}`} label="check-ins" />
              </div>
              {historyLoading ? (
                <div style={{ ...mono, fontSize: 11, color: c.faint }}>Loading…</div>
              ) : (
                <>
                  <HabitHeatmap dates={historyDates} color={color} onToggle={(date, done) => toggleDate(h, date, done)} />
                  <div style={{ ...mono, fontSize: 10, color: c.faint, marginTop: 10 }}>Tap any day to add or remove a check-in — including past days.</div>
                </>
              )}
            </div>
          </div>
        )
      })()}

    </div>
  )
}
