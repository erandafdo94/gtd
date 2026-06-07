import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/* ===== Types ===== */
type Energy = 'high' | 'med' | 'low'
type Priority = 1 | 2 | 3
type TimeKey = 'quick' | 'chunk' | 'deep'
type Screen = 'home' | 'settings' | 'words' | 'journal'
type BlockState = 'idle' | 'timing' | 'reflect' | 'done'
type BlockOutcome = 'done' | 'partial' | 'more' | 'discard'
type SavedTask = { text: string; done: boolean }
type Project = { id: number; name: string; energy: Energy; priority: Priority; avgBlock: TimeKey; tasks?: SavedTask[] }
type ThemeChoice = 'light' | 'dark'
type TrackId = 'lofi' | 'chill' | 'synth' | 'alpha'
type TaskItem = { id: number; text: string; done: boolean }
type Session = {
  id: number
  startedAt: number
  endedAt: number
  durationMs: number
  blockMs: number
  energy: Energy
  projectId: number | null
  projectName: string | null
  intention: string
  completed: boolean
  outcome?: 'done' | 'partial'
  tasks?: SavedTask[]
  distractions?: number
}

/* ===== Storage keys ===== */
const STORAGE_KEY = 'focus_projects'
const LEGACY_KEY = 'focus_areas'
const SESSIONS_KEY = 'focus_sessions'
const THEME_KEY = 'focus_theme'
const MAIN_TASK_KEY = 'focus_main_task'
const OTD_KEY = 'focus_otd'
const WORDS_KEY = 'focus_saved_words'
const JOURNAL_KEY = 'focus_journal'
const ONBOARDED_KEY = 'focus_onboarded'
const DAY_MS = 24 * 60 * 60 * 1000

/* ===== Design tokens ===== */
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const

const T = {
  kicker:     { fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' as const },
  label:      { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' },
  caption:    { fontSize: 12, fontWeight: 500, letterSpacing: '0.01em' },
  body:       { fontSize: 14, fontWeight: 400, lineHeight: 1.5 },
  bodyStrong: { fontSize: 14, fontWeight: 600 },
  subhead:    { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' },
  stat:       { fontSize: 34, fontWeight: 600, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' as const },
  banner:     { fontSize: 19, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const },
  countdown:  { fontSize: 76, fontWeight: 600, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1 },
}

const MODES: Record<Energy, { key: Energy; label: string; tip: string; cssVar: string }> = {
  high: { key: 'high', label: 'Deep Work',  tip: 'Phone in another room. One tab. Go.',  cssVar: 'var(--mode-high)' },
  med:  { key: 'med',  label: 'Steady',     tip: 'Close email. Pick one goal.',          cssVar: 'var(--mode-med)'  },
  low:  { key: 'low',  label: 'Knock-outs', tip: 'Just start. Tiny wins count.',         cssVar: 'var(--mode-low)'  },
}

const TIME_MIN: Record<TimeKey, number> = { quick: 15, chunk: 40, deep: 55 }
const TIME_OPTIONS: { key: TimeKey; label: string; mins: number }[] = [
  { key: 'quick', label: '15',    mins: 15 },
  { key: 'chunk', label: '30–45', mins: 40 },
  { key: 'deep',  label: '60+',   mins: 55 },
]
const ENERGY_OPTIONS: { key: Energy; label: string }[] = [
  { key: 'low',  label: 'Low'  },
  { key: 'med',  label: 'Med'  },
  { key: 'high', label: 'High' },
]
const ENERGY_DOWN: Record<Energy, Energy> = { high: 'med', med: 'low', low: 'low' }
const PRIORITIES: Priority[] = [1, 2, 3]

const SEED: Project[] = [
  { id: 1,  name: 'Inbox sweep',     energy: 'low',  priority: 2, avgBlock: 'quick' },
  { id: 2,  name: 'Quick errands',   energy: 'low',  priority: 3, avgBlock: 'quick' },
  { id: 3,  name: 'Reading & notes', energy: 'low',  priority: 2, avgBlock: 'chunk' },
  { id: 4,  name: 'Learning',        energy: 'med',  priority: 1, avgBlock: 'chunk' },
  { id: 5,  name: 'Standup notes',   energy: 'med',  priority: 2, avgBlock: 'quick' },
  { id: 6,  name: 'Side build',      energy: 'med',  priority: 2, avgBlock: 'deep'  },
  { id: 7,  name: 'Hard email',      energy: 'high', priority: 1, avgBlock: 'quick' },
  { id: 8,  name: 'Refactor',        energy: 'high', priority: 1, avgBlock: 'chunk' },
  { id: 9,  name: 'Main project',    energy: 'high', priority: 1, avgBlock: 'deep'  },
]

type TrackInfo = { id: TrackId; label: string; name: string; videoId: string }
const TRACKS: TrackInfo[] = [
  { id: 'lofi',  label: 'Study', name: 'Lofi study beats',      videoId: 'X4VbdwhkE10' },
  { id: 'chill', label: 'Chill', name: 'Lofi chill',            videoId: 'hIH1joP9_FU' },
  { id: 'synth', label: 'Synth', name: 'Synthwave radio',       videoId: 'acjs8sDZDro' },
  { id: 'alpha', label: 'Alpha', name: 'Alpha-wave hyperfocus', videoId: 'WPni755-Krg' },
]

const QUOTES: [string, string][] = [
  ['You have power over your mind — not outside events. Realize this, and you will find strength.', 'Marcus Aurelius'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['It is not that we have a short time to live, but that we waste much of it.', 'Seneca'],
  ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['First say to yourself what you would be; then do what you have to do.', 'Epictetus'],
  ['How long are you going to wait before you demand the best for yourself?', 'Epictetus'],
  ['Concentrate every minute on doing what\'s in front of you, with precision.', 'Marcus Aurelius'],
  ['Well begun is half done.', 'Aristotle'],
]

type WordEntry = { word: string; ipa: string; definition: string }
const WORDS: WordEntry[] = [
  { word: 'equanimity',     ipa: '/ˌekwəˈnɪməti/',     definition: 'mental calmness, composure, and evenness of temper, especially in a difficult situation.' },
  { word: 'sanguine',       ipa: '/ˈsæŋɡwɪn/',         definition: 'optimistic or positive, especially in an apparently bad or difficult situation.' },
  { word: 'ephemeral',      ipa: '/ɪˈfemərəl/',        definition: 'lasting for a very short time; transient.' },
  { word: 'kairos',         ipa: '/ˈkaɪrɒs/',          definition: 'the right, critical, or opportune moment for decision or action (Greek).' },
  { word: 'sophrosyne',     ipa: '/soʊˈfrɒsɪni/',      definition: 'a healthy state of mind characterized by self-control, moderation, and self-knowledge (Greek).' },
  { word: 'indefatigable',  ipa: '/ˌɪndɪˈfætɪɡəbəl/',  definition: 'persisting tirelessly; incapable of being fatigued.' },
  { word: 'telos',          ipa: '/ˈtɛlɒs/',           definition: 'an ultimate object or aim; the end toward which an action is directed (Greek).' },
  { word: 'ataraxia',       ipa: '/ˌætəˈræksiə/',      definition: 'a state of serene calmness; freedom from worry or preoccupation (Greek).' },
  { word: 'phronesis',      ipa: '/froʊˈniːsɪs/',      definition: 'practical wisdom; the ability to discern the right course of action in particular circumstances (Greek).' },
  { word: 'hexis',          ipa: '/ˈheksɪs/',          definition: 'a stable, settled disposition or habit built through repeated action (Greek).' },
  { word: 'eudaimonia',     ipa: '/juːdaɪˈmoʊniə/',    definition: 'human flourishing; the contented state of living well and acting well (Greek).' },
  { word: 'nascent',        ipa: '/ˈnæsənt/',          definition: 'just coming into existence and beginning to display signs of future potential.' },
  { word: 'magnanimous',    ipa: '/mæɡˈnænɪməs/',      definition: 'generous or forgiving, especially toward a rival or less powerful person.' },
  { word: 'otium',          ipa: '/ˈoʊtiəm/',          definition: 'productive leisure; time used for reflection or quiet work, valued by Stoic and classical writers (Latin).' },
]

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/* ===== Helpers ===== */
function fitCount(avg: TimeKey, block: TimeKey): number {
  return Math.floor(TIME_MIN[block] / TIME_MIN[avg])
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return []  // fresh install — onboarding fills this in
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const cleaned = parsed
      .filter((x: any) =>
        x && typeof x.id === 'number' && typeof x.name === 'string' &&
        (x.energy === 'high' || x.energy === 'med' || x.energy === 'low'))
      .map((x: any): Project => ({
        id: x.id,
        name: x.name,
        energy: x.energy,
        priority: (x.priority === 1 || x.priority === 2 || x.priority === 3) ? x.priority : 2,
        avgBlock: (x.avgBlock === 'quick' || x.avgBlock === 'chunk' || x.avgBlock === 'deep') ? x.avgBlock : 'chunk',
        tasks: Array.isArray(x.tasks)
          ? x.tasks
              .filter((t: any) => t && typeof t.text === 'string' && typeof t.done === 'boolean')
              .map((t: any): SavedTask => ({ text: t.text, done: !!t.done }))
          : [],
      }))
    return cleaned
  } catch {
    return SEED
  }
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s: any) =>
      s && typeof s.id === 'number' && typeof s.durationMs === 'number' &&
      typeof s.startedAt === 'number' && typeof s.endedAt === 'number' &&
      (s.energy === 'high' || s.energy === 'med' || s.energy === 'low'))
  } catch {
    return []
  }
}

function fmtMin(minutes: number): string {
  if (minutes < 1) return '0m'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded}m`
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function msToMin(ms: number): number {
  return ms / 60000
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function getLast7Days(now: number, sessions: Session[]): { label: string; minutes: number; mode: Energy }[] {
  const result: { label: string; minutes: number; mode: Energy }[] = []
  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDay(now - i * DAY_MS)
    const dayEnd = dayStart + DAY_MS
    const ds = sessions.filter(s => s.endedAt >= dayStart && s.endedAt < dayEnd)
    const minutes = ds.reduce((sum, s) => sum + msToMin(s.durationMs), 0)
    const tally: Record<Energy, number> = { high: 0, med: 0, low: 0 }
    ds.forEach(s => { tally[s.energy] += msToMin(s.durationMs) })
    let mode: Energy = 'med'
    let best = -1
    ;(['high', 'med', 'low'] as Energy[]).forEach(m => {
      if (tally[m] > best) { best = tally[m]; mode = m }
    })
    result.push({ label: DAY_LABELS[new Date(dayStart).getDay()], minutes, mode })
  }
  return result
}

function computeByMode(sessions: Session[]): { mode: Energy; minutes: number }[] {
  const totals: Record<Energy, number> = { high: 0, med: 0, low: 0 }
  sessions.forEach(s => { totals[s.energy] += msToMin(s.durationMs) })
  return [
    { mode: 'high', minutes: totals.high },
    { mode: 'med',  minutes: totals.med  },
    { mode: 'low',  minutes: totals.low  },
  ]
}

function computeByProject(sessions: Session[], topN: number): { name: string; minutes: number; energy: Energy }[] {
  const map = new Map<string, { name: string; minutes: number; energy: Energy }>()
  sessions.forEach(s => {
    const key = s.projectId !== null ? `p${s.projectId}` : `n${s.projectName ?? ''}`
    const name = s.projectName ?? '(no project)'
    const existing = map.get(key)
    if (existing) existing.minutes += msToMin(s.durationMs)
    else map.set(key, { name, minutes: msToMin(s.durationMs), energy: s.energy })
  })
  return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes).slice(0, topN)
}

function playChime() {
  try {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 660
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)
    osc.start(now)
    osc.stop(now + 1.25)
    osc.onended = () => ctx.close().catch(() => {})
  } catch { /* never throw */ }
}

function getInitialTheme(): ThemeChoice {
  try {
    const fromAttr = document.documentElement.dataset.theme
    if (fromAttr === 'light' || fromAttr === 'dark') return fromAttr
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch { /* ignore */ }
  return 'light'
}

function dayOfYear(d: Date = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 0).getTime()
  return Math.floor((d.getTime() - start) / 86400000)
}

function dailyQuote(): [string, string] {
  const i = ((dayOfYear() % QUOTES.length) + QUOTES.length) % QUOTES.length
  return QUOTES[i]
}

function dailyWord(): WordEntry {
  const i = ((dayOfYear() % WORDS.length) + WORDS.length) % WORDS.length
  return WORDS[i]
}

type SavedWord = { word: string; ipa: string; definition: string; savedAt: number }
type JournalEntry = { id: number; createdAt: number; updatedAt: number; text: string }

function loadSavedWords(): SavedWord[] {
  try {
    const raw = localStorage.getItem(WORDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((w: any) =>
      w && typeof w.word === 'string' && typeof w.definition === 'string'
      && typeof w.ipa === 'string' && typeof w.savedAt === 'number'
    )
  } catch { return [] }
}

function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: JournalEntry[] = []
    parsed.forEach((e: any, i: number) => {
      if (!e || typeof e.text !== 'string' || e.text.length === 0) return
      // New shape
      if (typeof e.id === 'number') {
        out.push({
          id: e.id,
          createdAt: typeof e.createdAt === 'number' ? e.createdAt : e.id,
          updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : e.id,
          text: e.text,
        })
        return
      }
      // Legacy one-per-day shape: { date: 'YYYY-MM-DD', text, updatedAt }
      if (typeof e.date === 'string') {
        const baseTs = (() => {
          const d = new Date(e.date + 'T12:00:00')
          return isNaN(d.getTime()) ? Date.now() - i * 1000 : d.getTime()
        })()
        const updatedAt = typeof e.updatedAt === 'number' ? e.updatedAt : baseTs
        out.push({
          id: baseTs + i, // ensure unique even if multiple legacy entries existed
          createdAt: baseTs,
          updatedAt,
          text: e.text,
        })
      }
    })
    return out
  } catch { return [] }
}

function fmtJournalTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const sameYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today · ${time}`
  if (sameYesterday) return `Yesterday · ${time}`
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + time
}

function speakWord(text: string) {
  if (typeof window === 'undefined') return
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    console.warn('SpeechSynthesis not available in this browser.')
    return
  }
  try {
    // Some browsers (Safari especially) stall the queue after long idle.
    if (synth.paused) synth.resume()
    const queued = synth.speaking || synth.pending
    if (queued) synth.cancel()
    const fire = () => {
      try {
        const utter = new SpeechSynthesisUtterance(text)
        utter.rate = 0.85
        utter.pitch = 1.0
        utter.volume = 1
        utter.lang = 'en-US'
        synth.speak(utter)
      } catch (e) {
        console.warn('SpeechSynthesis.speak failed:', e)
      }
    }
    // Chrome bug: cancel()+speak() in the same tick drops the speech.
    if (queued) window.setTimeout(fire, 80)
    else fire()
  } catch (e) {
    console.warn('SpeechSynthesis error:', e)
  }
}

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDateShort(): string {
  const d = new Date()
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const month = d.toLocaleDateString(undefined, { month: 'short' })
  const day = d.getDate()
  return `${weekday} · ${month} ${day}`
}

type MainTaskState = { text: string; done: boolean; projectId?: number }
type MainTaskSuggestion = { text: string; projectName: string; projectId: number; fromParked: boolean }

function suggestMainTask(projects: Project[]): MainTaskSuggestion | null {
  const ENERGY_RANK: Record<Energy, number> = { high: 0, med: 1, low: 2 }
  const ranked = projects
    .filter(p => p.name.trim().length > 0)
    .slice()
    .sort((a, b) => a.priority - b.priority || ENERGY_RANK[a.energy] - ENERGY_RANK[b.energy] || a.id - b.id)
  for (const p of ranked) {
    const next = p.tasks?.find(t => !t.done)
    if (next) return { text: next.text, projectName: p.name, projectId: p.id, fromParked: true }
  }
  const top = ranked[0]
  if (top) return { text: `Move ${top.name} forward`, projectName: top.name, projectId: top.id, fromParked: false }
  return null
}

function loadMainTask(): MainTaskState | null {
  try {
    const raw = localStorage.getItem(MAIN_TASK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
      return {
        text: parsed.text,
        done: typeof parsed.done === 'boolean' ? parsed.done : false,
        projectId: typeof parsed.projectId === 'number' ? parsed.projectId : undefined,
      }
    }
    return null
  } catch { return null }
}

type OnThisDay = { text: string; year: number; url: string }

async function fetchOnThisDay(): Promise<OnThisDay | null> {
  try {
    const cachedRaw = localStorage.getItem(OTD_KEY)
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (cached && cached.date === todayKey() && typeof cached.text === 'string' && typeof cached.year === 'number') {
        return { text: cached.text, year: cached.year, url: typeof cached.url === 'string' ? cached.url : '' }
      }
    }
  } catch { /* cache read failed; fall through to fetch */ }

  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const ev = Array.isArray(data?.events) ? data.events[0] : null
    if (!ev || typeof ev.text !== 'string' || typeof ev.year !== 'number') return null
    const page = Array.isArray(ev.pages) ? ev.pages[0] : null
    const pageUrl: string = page?.content_urls?.desktop?.page ?? ''
    const out: OnThisDay = { text: ev.text, year: ev.year, url: pageUrl }
    try {
      localStorage.setItem(OTD_KEY, JSON.stringify({ date: todayKey(), ...out }))
    } catch { /* ignore quota */ }
    return out
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

function priorityShade(p: Priority, base: string): string {
  if (p === 1) return base
  if (p === 2) return 'var(--text-on-chip)'
  return 'var(--text-faint)'
}

/* ===== Atoms ===== */
function Card({
  children, elevated, accent, style,
}: {
  children: ReactNode
  elevated?: boolean
  accent?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        background: elevated ? 'var(--surface)' : 'var(--card-bg)',
        border: '1px solid var(--border-soft)',
        borderRadius: 16,
        boxShadow: elevated ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        padding: SP.xl,
        position: 'relative',
        ...(accent ? { borderTop: `2px solid ${accent}` } : null),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function Kicker({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <div style={{ ...T.kicker, color: color ?? 'var(--text-label)', ...style }}>{children}</div>
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
      <Kicker>{label}</Kicker>
      {children}
    </div>
  )
}

function Segmented<O extends { key: string; label: string }>({
  options, value, onChange, accentFor,
}: {
  options: readonly O[]
  value: O['key']
  onChange: (k: O['key']) => void
  accentFor?: (k: O['key']) => string
}) {
  return (
    <div style={{ display: 'flex', gap: SP.sm }}>
      {options.map(o => {
        const on = value === o.key
        const accent = on && accentFor ? accentFor(o.key) : null
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              flex: 1, minHeight: 44, padding: '0 8px',
              ...T.bodyStrong, fontSize: 14,
              borderRadius: 11,
              border: `1px solid ${on ? (accent ?? 'var(--text-on-chip)') : 'var(--border-chip)'}`,
              background: on ? (accent ? `color-mix(in srgb, ${accent} 12%, transparent)` : 'var(--tint-strong)') : 'transparent',
              color: on ? (accent ?? 'var(--text-strong)') : 'var(--text-body)',
              transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease, transform 80ms ease',
              cursor: 'pointer',
            }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.975)' }}
            onMouseUp={e => { e.currentTarget.style.transform = '' }}
            onMouseLeave={e => { e.currentTarget.style.transform = '' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Bar({
  label, valueText, value, max, color,
}: {
  label: ReactNode
  valueText: string
  value: number
  max: number
  color: string
}) {
  const pct = max ? Math.max(0.04, value / max) : 0.04
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.sm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ ...T.body, fontSize: 13, color: 'var(--text-strong)' }}>{label}</span>
        <span style={{ ...T.caption, color: 'var(--text-body)', fontVariantNumeric: 'tabular-nums' }}>{valueText}</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'var(--tint-strong)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 4, transition: 'width 320ms cubic-bezier(0.2,0.7,0.2,1)' }} />
      </div>
    </div>
  )
}

function Sparkline({ days, empty }: { days: { label: string; minutes: number; mode: Energy }[]; empty?: boolean }) {
  const max = Math.max(60, ...days.map(d => d.minutes))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: SP.sm, height: 84 }}>
      {days.map((d, i) => {
        const h = empty ? 8 : Math.max(4, Math.round((d.minutes / max) * 76))
        const col = empty
          ? 'var(--border-chip)'
          : (d.minutes ? MODES[d.mode].cssVar : 'var(--border-chip)')
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.sm }}>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div
                title={empty ? '' : fmtMin(d.minutes)}
                style={{
                  width: '100%', height: h, maxWidth: 26,
                  background: col, borderRadius: 5,
                  opacity: empty ? 0.5 : (d.minutes ? 1 : 0.6),
                  transition: 'height 260ms cubic-bezier(0.2,0.7,0.2,1)',
                }}
              />
            </div>
            <div style={{ ...T.caption, fontSize: 10, color: 'var(--text-faint)' }}>{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function SubSection({
  kicker, right, children, first,
}: {
  kicker: ReactNode
  right?: ReactNode
  children: ReactNode
  first?: boolean
}) {
  return (
    <div style={{
      paddingTop: first ? 0 : SP.lg,
      marginTop: first ? 0 : SP.lg,
      borderTop: first ? 'none' : '1px solid var(--border-soft)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SP.md }}>
        <Kicker>{kicker}</Kicker>
        {right ? <span style={{ ...T.caption, color: 'var(--text-faint)' }}>{right}</span> : null}
      </div>
      {children}
    </div>
  )
}

/* ===== Stats sidebar ===== */
function StatsSidebar({ sessions }: { sessions: Session[] }) {
  const now = Date.now()
  const empty = sessions.length === 0
  const days = getLast7Days(now, sessions)
  const weekStart = startOfDay(now - 6 * DAY_MS)
  const wk = sessions.filter(s => s.endedAt >= weekStart)
  const weekMin = days.reduce((a, d) => a + d.minutes, 0)
  const byMode = computeByMode(wk)
  const modeMax = Math.max(1, ...byMode.map(m => m.minutes))
  const topProjects = computeByProject(wk, 4)
  const projMax = Math.max(1, ...topProjects.map(p => p.minutes))
  const lifeMins = sessions.reduce((a, s) => a + msToMin(s.durationMs), 0)
  const lifeBlocks = sessions.length

  if (empty) {
    return (
      <Card style={{ display: 'flex', flexDirection: 'column', gap: SP.lg }}>
        <SubSection kicker="Last 7 days" first>
          <Sparkline days={days} empty />
        </SubSection>
        <div style={{ textAlign: 'center', padding: `${SP.md}px ${SP.sm}px ${SP.xs}px` }}>
          <div style={{ ...T.bodyStrong, color: 'var(--text-strong)', marginBottom: SP.xs }}>No blocks yet</div>
          <div style={{ ...T.body, fontSize: 13, color: 'var(--text-body)', maxWidth: 220, margin: '0 auto' }}>
            Your first focus block starts the story. Stats fill in here as you go.
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: SP.lg, display: 'flex', flexDirection: 'column', gap: SP.md }}>
          {(['high', 'med', 'low'] as Energy[]).map(m => (
            <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: SP.sm }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ ...T.body, fontSize: 13, color: 'var(--text-faint)' }}>{MODES[m].label}</span>
                <span style={{ ...T.caption, color: 'var(--text-faint)' }}>—</span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'var(--tint-strong)' }} />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <SubSection kicker="Last 7 days" right={fmtMin(weekMin)} first>
        <Sparkline days={days} />
      </SubSection>

      <SubSection kicker="By mode · week">
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
          {byMode.map(m => (
            <Bar
              key={m.mode}
              label={MODES[m.mode].label}
              valueText={fmtMin(m.minutes)}
              value={m.minutes}
              max={modeMax}
              color={MODES[m.mode].cssVar}
            />
          ))}
        </div>
      </SubSection>

      <SubSection kicker="Top projects · week">
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
          {topProjects.length ? topProjects.map((p, i) => (
            <Bar
              key={i}
              label={p.name}
              valueText={fmtMin(p.minutes)}
              value={p.minutes}
              max={projMax}
              color="var(--text-chip-mid)"
            />
          )) : <span style={{ ...T.body, color: 'var(--text-faint)' }}>No projects this week</span>}
        </div>
      </SubSection>

      <SubSection kicker="Lifetime">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.sm }}>
          <span style={{ ...T.subhead, fontSize: 22, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{fmtMin(lifeMins)}</span>
          <span style={{ ...T.body, color: 'var(--text-faint)' }}>·</span>
          <span style={{ ...T.body, color: 'var(--text-body)' }}>{lifeBlocks} blocks</span>
        </div>
      </SubSection>
    </Card>
  )
}

/* ===== Music card ===== */
function Equalizer({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12 }} aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <span key={i} style={{
          width: 2.5, background: color, borderRadius: 2,
          height: 12, transformOrigin: 'bottom',
          animation: `fr-eq 900ms ${i * 130}ms ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

function MusicCard() {
  const [activeId, setActiveId] = useState<TrackId | null>(null)
  const [playing, setPlaying] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const srcRef = useRef<string | null>(null)

  // keep srcRef in sync with activeId so the iframe mounts with a stable URL
  // (we change videos via postMessage instead of swapping the src prop)
  if (activeId !== null && srcRef.current === null) {
    const t = TRACKS.find(x => x.id === activeId)
    if (t) {
      srcRef.current = `https://www.youtube-nocookie.com/embed/${t.videoId}?autoplay=1&modestbranding=1&rel=0&loop=1&playlist=${t.videoId}&enablejsapi=1`
    }
  }
  if (activeId === null && srcRef.current !== null) {
    srcRef.current = null
  }

  function postCommand(func: string, args: (string | number)[] = []) {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
    } catch { /* ignore */ }
  }

  function clickTrack(id: TrackId) {
    if (activeId === id) {
      if (playing) {
        postCommand('pauseVideo')
        setPlaying(false)
      } else {
        postCommand('playVideo')
        setPlaying(true)
      }
      return
    }
    if (activeId === null) {
      setActiveId(id)
      setPlaying(true)
      return
    }
    const t = TRACKS.find(x => x.id === id)
    if (!t) return
    postCommand('loadVideoById', [t.videoId])
    setActiveId(id)
    setPlaying(true)
  }

  function stop() {
    postCommand('stopVideo')
    setActiveId(null)
    setPlaying(false)
  }

  const activeTrack = activeId !== null ? TRACKS.find(t => t.id === activeId) ?? null : null

  return (
    <Card style={{ padding: SP.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--text-label)', fontSize: 14 }}>♪</span>
          <Kicker>Focus music</Kicker>
        </div>
        <div style={{ display: 'flex', gap: SP.sm, flexWrap: 'wrap' }}>
          {TRACKS.map(t => {
            const on = activeId === t.id
            const showPause = on && playing
            return (
              <button
                key={t.id}
                onClick={() => clickTrack(t.id)}
                aria-label={on ? (playing ? `Pause ${t.name}` : `Resume ${t.name}`) : `Play ${t.name}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  ...T.bodyStrong, fontSize: 13,
                  minHeight: 40, padding: '0 14px', borderRadius: 999,
                  border: `1px solid ${on ? 'var(--text-on-chip)' : 'var(--border-chip)'}`,
                  background: on ? 'var(--btn-neutral)' : 'var(--card-bg)',
                  color: on ? 'var(--page-bg)' : 'var(--text-strong)',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  opacity: on && !playing ? 0.72 : 1,
                }}
              >
                <span aria-hidden="true" style={{
                  fontSize: showPause ? 12 : 11, lineHeight: 1, transform: 'translateY(-0.5px)',
                }}>
                  {showPause ? '⏸' : '▶'}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      {activeTrack && srcRef.current && (
        <div className="fr-anim-fade" style={{
          display: 'flex', alignItems: 'center', gap: SP.md,
          paddingTop: SP.md, marginTop: SP.md,
          borderTop: '1px solid var(--border-soft)',
          flexWrap: 'wrap',
        }}>
          {playing ? (
            <Equalizer color="var(--text-chip-mid)" />
          ) : (
            <span aria-hidden="true" style={{
              display: 'inline-flex', gap: 3, alignItems: 'center', height: 12,
            }}>
              <span style={{ width: 2.5, height: 12, background: 'var(--text-chip-mid)', borderRadius: 2 }} />
              <span style={{ width: 2.5, height: 12, background: 'var(--text-chip-mid)', borderRadius: 2 }} />
            </span>
          )}
          <span style={{ ...T.caption, color: 'var(--text-body)', flex: 1, minWidth: 0 }}>
            {playing ? 'Now playing' : 'Paused'} · {activeTrack.name}
          </span>
          <button
            onClick={stop}
            aria-label="Stop music"
            title="Stop"
            style={{
              minHeight: 28, padding: '0 12px', borderRadius: 999,
              background: 'transparent', border: '1px solid var(--border-chip)',
              color: 'var(--text-body)', ...T.caption, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕ Stop
          </button>
          <iframe
            ref={iframeRef}
            title={activeTrack.name}
            src={srcRef.current}
            allow="autoplay; encrypted-media"
            loading="lazy"
            style={{ border: 0, width: 0, height: 0, opacity: 0, position: 'absolute' }}
          />
        </div>
      )}
    </Card>
  )
}

/* ===== Today header (date + Stoic quote) ===== */
function TodayHeader() {
  const [q, by] = dailyQuote()
  const date = fmtDateShort()
  return (
    <div className="fr-anim-fade" style={{ display: 'flex', alignItems: 'flex-start', gap: SP.md, maxWidth: 620, padding: '0 2px' }}>
      <span aria-hidden="true" style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: 'var(--mode-high)', opacity: 0.55, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs, minWidth: 0 }}>
        <span style={{ ...T.kicker, color: 'var(--text-strong)', letterSpacing: '0.12em' }}>{date}</span>
        <p style={{ margin: 0, ...T.body, fontSize: 15, fontStyle: 'italic', color: 'var(--text-body)' }}>
          {q}
          <span style={{ fontStyle: 'normal', color: 'var(--text-faint)', marginLeft: SP.sm }}>— {by}</span>
        </p>
      </div>
    </div>
  )
}

/* ===== Main task for today ===== */
function MainTaskCard({
  projects, task, onSetTask,
}: {
  projects: Project[]
  task: MainTaskState | null
  onSetTask: (next: MainTaskState | null) => void
}) {
  const [draft, setDraft] = useState('')

  function commit(text: string, projectId?: number) {
    const trimmed = text.trim()
    if (!trimmed) return
    onSetTask({ text: trimmed, done: false, projectId })
    setDraft('')
  }

  function toggleDone() {
    if (!task) return
    onSetTask({ ...task, done: !task.done })
  }

  function clearTask() {
    onSetTask(null)
    setDraft('')
  }

  const suggestion = task === null ? suggestMainTask(projects) : null

  return (
    <Card style={{ padding: SP.lg }}>
      <Kicker>Today's main thing</Kicker>

      {task === null ? (
        <>
          <div style={{ marginTop: SP.md, display: 'flex', alignItems: 'center', gap: SP.md }}>
            <span
              aria-hidden="true"
              style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                border: '1.5px dashed var(--border-input)',
                background: 'transparent',
              }}
            />
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(draft) }}
              onBlur={() => commit(draft)}
              placeholder="What's the one thing today?"
              aria-label="Set today's main task"
              style={{
                flex: 1, minWidth: 0,
                minHeight: 36, padding: '0 2px',
                border: 'none', background: 'transparent',
                color: 'var(--text-strong)',
                ...T.body, fontSize: 16,
                outline: 'none',
              }}
            />
          </div>
          {suggestion && (
            <div
              className="fr-anim-fade"
              style={{
                display: 'flex', alignItems: 'center', gap: SP.sm,
                marginTop: SP.md, paddingTop: SP.md,
                borderTop: '1px solid var(--border-soft)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ ...T.caption, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Suggested
              </span>
              <button
                onClick={() => commit(suggestion.text, suggestion.projectId)}
                aria-label={`Use suggested task: ${suggestion.text}`}
                title={suggestion.text}
                style={{
                  flex: 1, minWidth: 140, textAlign: 'left',
                  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                  ...T.body, fontSize: 14, color: 'var(--text-strong)',
                  fontStyle: suggestion.fromParked ? 'normal' : 'italic',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {suggestion.text}
                <span style={{ ...T.caption, color: 'var(--text-faint)', marginLeft: SP.sm, fontStyle: 'normal' }}>
                  · from {suggestion.projectName}
                </span>
              </button>
              <button
                onClick={() => commit(suggestion.text, suggestion.projectId)}
                aria-label="Use this suggestion"
                style={{
                  flexShrink: 0,
                  minHeight: 32, padding: '0 12px', borderRadius: 999,
                  border: '1px solid var(--border-chip)',
                  background: 'transparent',
                  color: 'var(--text-strong)',
                  ...T.caption, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Use →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="fr-anim-fade" style={{ marginTop: SP.md, display: 'flex', alignItems: 'center', gap: SP.md }}>
          <button
            onClick={toggleDone}
            aria-label={task.done ? `Mark "${task.text}" not done` : `Mark "${task.text}" done`}
            style={{
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              border: `1.5px solid ${task.done ? 'var(--mode-high)' : 'var(--border-input)'}`,
              background: task.done ? 'var(--mode-high)' : 'transparent',
              color: 'var(--surface)',
              display: 'grid', placeItems: 'center',
              fontSize: 13, cursor: 'pointer', padding: 0,
              transition: 'all 160ms ease',
            }}
          >{task.done ? '✓' : ''}</button>
          <span
            style={{
              flex: 1, minWidth: 0,
              ...T.body, fontSize: 16, fontWeight: 600,
              color: task.done ? 'var(--text-faint)' : 'var(--text-strong)',
              textDecoration: task.done ? 'line-through' : 'none',
              transition: 'color 160ms ease',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={task.text}
          >{task.text}</span>
          <button
            onClick={clearTask}
            aria-label="Clear today's main task"
            title={task.done ? 'Set a new one' : 'Clear'}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'transparent', border: 'none',
              color: 'var(--text-faint)', cursor: 'pointer', fontSize: 14,
            }}
          >✕</button>
        </div>
      )}
    </Card>
  )
}

/* ===== On this day (Wikipedia) ===== */
function OnThisDayCard() {
  const [data, setData] = useState<OnThisDay | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchOnThisDay().then(result => {
      if (cancelled) return
      setData(result)
      setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  if (!ready || !data) return null
  return (
    <Card style={{ padding: SP.lg, display: 'flex', flexDirection: 'column', gap: SP.sm }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.sm }}>
        <Kicker>On this day · {data.year}</Kicker>
        {data.url ? (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...T.caption, color: 'var(--text-faint)', textDecoration: 'none' }}
          >
            wikipedia ↗
          </a>
        ) : null}
      </div>
      <p
        title={data.text}
        style={{
          margin: 0, ...T.body, fontSize: 14, color: 'var(--text-strong)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {data.text}
      </p>
    </Card>
  )
}

/* ===== Word of the day ===== */
function SpeakerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </svg>
  )
}

function WordOfDayCard({
  savedWords, onSave,
}: {
  savedWords: SavedWord[]
  onSave: (w: SavedWord) => void
}) {
  const entry = dailyWord()
  const saved = savedWords.some(s => s.word === entry.word)
  return (
    <Card style={{ padding: SP.lg, display: 'flex', flexDirection: 'column', gap: SP.sm }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm }}>
        <Kicker>Word of the day</Kicker>
        <button
          onClick={() => !saved && onSave({ ...entry, savedAt: Date.now() })}
          disabled={saved}
          aria-label={saved ? `${entry.word} saved` : `Save ${entry.word} to your words`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            minHeight: 28, padding: '0 10px', borderRadius: 999,
            border: `1px solid ${saved ? 'var(--border-soft)' : 'var(--border-chip)'}`,
            background: 'transparent',
            color: saved ? 'var(--text-faint)' : 'var(--text-strong)',
            ...T.caption, fontWeight: 700,
            cursor: saved ? 'default' : 'pointer',
          }}
        >
          {saved ? '✓ Saved' : '+ Save'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, flexWrap: 'wrap' }}>
        <span style={{ ...T.subhead, fontSize: 19, color: 'var(--text-strong)' }}>{entry.word}</span>
        <span style={{
          ...T.caption, color: 'var(--text-faint)',
          fontFamily: 'ui-serif, Georgia, serif', fontStyle: 'italic', fontSize: 13,
        }}>{entry.ipa}</span>
        <button
          onClick={() => speakWord(entry.word)}
          aria-label={`Hear ${entry.word} pronounced`}
          title="Hear pronunciation"
          style={{
            width: 28, height: 28, borderRadius: 14,
            background: 'transparent', border: 'none',
            color: 'var(--text-body)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <SpeakerIcon />
        </button>
      </div>
      <p style={{ margin: 0, ...T.body, fontSize: 14, color: 'var(--text-body)', lineHeight: 1.5 }}>
        {entry.definition}
      </p>
    </Card>
  )
}

/* ===== Stat strip ===== */
function StatStrip({ sessions }: { sessions: Session[] }) {
  const now = Date.now()
  const todayStart = startOfDay(now)
  const today = sessions.filter(s => s.endedAt >= todayStart).reduce((a, s) => a + msToMin(s.durationMs), 0)
  const weekStart = startOfDay(now - 6 * DAY_MS)
  const wk = sessions.filter(s => s.endedAt >= weekStart)
  const weekMin = wk.reduce((a, s) => a + msToMin(s.durationMs), 0)
  const items: { label: string; value: string }[] = [
    { label: 'Today',     value: fmtMin(today) },
    { label: 'This week', value: fmtMin(weekMin) },
    { label: 'Blocks',    value: String(wk.length) },
  ]
  return (
    <div className="fr-statstrip" style={{ marginBottom: SP.xl }}>
      {items.map(it => (
        <div key={it.label} style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-soft)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
          padding: `${SP.lg}px ${SP.xl}px`,
          display: 'flex', flexDirection: 'column', gap: SP.xs,
        }}>
          <span style={{ ...T.stat, color: 'var(--text-strong)' }}>{it.value}</span>
          <Kicker>{it.label}</Kicker>
        </div>
      ))}
    </div>
  )
}

/* ===== Focus block ===== */
type FocusBlockProps = {
  projects: Project[]
  blockState: BlockState
  energy: Energy
  setEnergy: (e: Energy) => void
  time: TimeKey
  setTime: (t: TimeKey) => void
  projectId: number | null
  setProjectId: (id: number | null) => void
  intention: string
  setIntention: (v: string) => void
  secondsLeft: number
  paused: boolean
  tasks: TaskItem[]
  taskDraft: string
  setTaskDraft: (v: string) => void
  onStart: () => void
  onTogglePause: () => void
  onDoneEarly: () => void
  onReset: () => void
  onRestart: () => void
  onEasier: () => void
  onAddTask: () => void
  onToggleTask: (id: number) => void
  onRemoveTask: (id: number) => void
  onBumpDistracted: () => void
  onReflect: (outcome: BlockOutcome) => void
  distractionCount: number
  lastEnergy: Energy
  reflectSummary: {
    energy: Energy
    minutes: number
    projectName: string | null
    tasksDone: number
    totalTasks: number
    distractions: number
  } | null
  doneSummary: {
    energy: Energy
    minutes: number
    projectName: string | null
    tasksDone: number
    totalTasks: number
    distractions: number
    outcome: 'done' | 'partial'
  } | null
  mainTask: MainTaskState | null
  onPickMainTask: () => void
}

function FocusBlock(p: FocusBlockProps) {
  const mode = MODES[p.energy]
  const mins = TIME_MIN[p.time]
  const totalSecs = mins * 60

  const matches = p.projects
    .filter(x => x.energy === p.energy && fitCount(x.avgBlock, p.time) >= 1)
    .sort((a, b) => a.priority - b.priority || a.id - b.id)

  const mm = String(Math.floor(p.secondsLeft / 60)).padStart(2, '0')
  const ss = String(p.secondsLeft % 60).padStart(2, '0')
  const progress = totalSecs ? 1 - p.secondsLeft / totalSecs : 0

  const timingMode = MODES[p.lastEnergy]
  const timingProject = p.projects.find(x => x.id === p.projectId)
  const tickAnim = p.blockState === 'timing' && !p.paused && p.secondsLeft % 2 === 0

  const idleView = (
    <div key="idle" className="fr-anim-rise" style={{ display: 'flex', flexDirection: 'column', gap: SP.xl }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.md }}>
        <span style={{
          width: 10, height: 10, borderRadius: 3, background: mode.cssVar,
          boxShadow: `0 0 0 4px color-mix(in srgb, ${mode.cssVar} 16%, transparent)`,
        }} />
        <div style={{ ...T.banner, color: 'var(--text-strong)' }}>
          {mode.label}{' '}
          <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}>· {mins} MIN</span>
        </div>
      </div>

      <Field label="Energy">
        <Segmented options={ENERGY_OPTIONS} value={p.energy} onChange={p.setEnergy} accentFor={(k) => MODES[k as Energy].cssVar} />
      </Field>
      <Field label="Time">
        <Segmented options={TIME_OPTIONS} value={p.time} onChange={p.setTime} />
      </Field>

      <Field label={`Pick a project · ${matches.length}`}>
        {(() => {
          const mt = p.mainTask
          if (!mt || mt.done) return null
          const mainProj = mt.projectId !== undefined
            ? p.projects.find(pr => pr.id === mt.projectId) ?? null
            : null
          const mainColor = mainProj ? MODES[mainProj.energy].cssVar : 'var(--text-on-chip)'
          const hint = mainProj
            ? `· ${mainProj.name}`
            : '· prefill intention'
          return (
            <button
              onClick={p.onPickMainTask}
              aria-label={`Set up block for today's main thing: ${mt.text}`}
              style={{
                display: 'flex', alignItems: 'center', gap: SP.md,
                width: '100%', textAlign: 'left',
                padding: '12px 14px', marginBottom: SP.md,
                borderRadius: 12,
                border: `1px solid ${mainColor}`,
                background: mainProj
                  ? `color-mix(in srgb, ${mainColor} 8%, transparent)`
                  : 'var(--tint-strong)',
                color: 'var(--text-strong)',
                cursor: 'pointer',
                transition: 'all 160ms ease',
                flexWrap: 'wrap',
              }}
            >
              <span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: 2, background: mainColor, flexShrink: 0,
                boxShadow: mainProj
                  ? `0 0 0 3px color-mix(in srgb, ${mainColor} 20%, transparent)`
                  : 'none',
              }} />
              <span style={{
                ...T.caption, fontWeight: 700, color: 'var(--text-faint)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                flexShrink: 0,
              }}>Main thing</span>
              <span style={{
                flex: 1, minWidth: 0,
                ...T.body, fontSize: 14, fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={mt.text}>{mt.text}</span>
              <span style={{
                ...T.caption, color: 'var(--text-faint)', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: SP.xs,
              }}>
                <span>{hint}</span>
                <span aria-hidden="true">→</span>
              </span>
            </button>
          )
        })()}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.sm }}>
          {matches.length ? matches.map(pr => {
            const on = p.projectId === pr.id
            return (
              <button
                key={pr.id}
                onClick={() => p.setProjectId(on ? null : pr.id)}
                style={{
                  minHeight: 44, padding: '0 16px', borderRadius: 999,
                  ...T.bodyStrong, fontSize: 14,
                  border: `1px solid ${on ? mode.cssVar : 'var(--border-chip)'}`,
                  background: on ? `color-mix(in srgb, ${mode.cssVar} 14%, transparent)` : 'var(--card-bg)',
                  color: on ? 'var(--text-strong)' : 'var(--text-on-chip)',
                  transition: 'all 160ms ease',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {pr.name}
              </button>
            )
          }) : (
            <span style={{ ...T.body, color: 'var(--text-faint)' }}>
              No project for this combo — add one in <span style={{ color: 'var(--text-body)' }}>Projects ⚙</span>.
            </span>
          )}
        </div>
      </Field>

      {p.intention.trim() && (
        <div style={{
          padding: '10px 14px', borderRadius: 11,
          border: '1px solid var(--border-soft)', background: 'var(--tint-strong)',
          display: 'flex', alignItems: 'center', gap: SP.sm,
        }}>
          <span style={{ ...T.caption, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Intent
          </span>
          <span style={{ ...T.body, fontSize: 14, color: 'var(--text-strong)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.intention}>
            {p.intention}
          </span>
          <button
            onClick={() => p.setIntention('')}
            aria-label="Clear intent"
            style={{
              width: 24, height: 24, borderRadius: 8,
              background: 'transparent', border: 'none', color: 'var(--text-faint)',
              cursor: 'pointer', fontSize: 12, padding: 0,
            }}
          >✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: SP.md, alignItems: 'center', marginTop: SP.xs }}>
        <button
          onClick={p.onEasier}
          style={{
            minHeight: 44, padding: '0 16px', borderRadius: 11,
            ...T.bodyStrong, fontSize: 14, color: 'var(--text-body)',
            background: 'transparent', border: '1px solid var(--border-ghost)',
            cursor: 'pointer',
          }}
        >
          Not feeling it
        </button>
        <button
          onClick={p.onStart}
          disabled={!p.projectId}
          style={{
            flex: 1, minHeight: 48, borderRadius: 12,
            ...T.subhead, fontSize: 16,
            background: p.projectId ? 'var(--btn-neutral)' : 'var(--disabled-bg)',
            color: p.projectId ? 'var(--page-bg)' : 'var(--text-faint)',
            border: 'none',
            boxShadow: p.projectId ? 'var(--shadow-sm)' : 'none',
            transition: 'background 180ms ease, transform 80ms ease',
            cursor: p.projectId ? 'pointer' : 'not-allowed',
          }}
        >
          Start →
        </button>
      </div>
    </div>
  )

  const timingView = (
    <div key="timing" className="fr-anim-rise" style={{ display: 'flex', flexDirection: 'column', gap: SP.xl }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.md }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: timingMode.cssVar }} />
        <span style={{ ...T.label, color: 'var(--text-label)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{timingMode.label}</span>
        {timingProject && <span style={{ ...T.caption, color: 'var(--text-body)' }}>· {timingProject.name}</span>}
      </div>

      <div style={{ textAlign: 'center', padding: `${SP.sm}px 0` }}>
        <div style={{ ...T.countdown, color: 'var(--text-strong)' }}>
          <span style={{ animation: tickAnim ? 'fr-tick 1s ease' : 'none' }}>{mm}</span>
          <span style={{ color: 'var(--text-faint)' }}>:</span>
          <span>{ss}</span>
        </div>
        {p.intention.trim() && <div style={{ ...T.body, color: 'var(--text-body)', marginTop: SP.md }}>{p.intention}</div>}
      </div>

      <div style={{ height: 4, borderRadius: 3, background: 'var(--tint-strong)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: timingMode.cssVar, borderRadius: 3, transition: 'width 980ms linear' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
        <Kicker>This block</Kicker>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.sm }}>
          {p.tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: SP.md }}>
              <button
                onClick={() => p.onToggleTask(t.id)}
                aria-label={t.done ? `Mark "${t.text}" not done` : `Mark "${t.text}" done`}
                style={{
                  display: 'flex', alignItems: 'center', gap: SP.md,
                  flex: 1, minHeight: 44, padding: '0 4px',
                  background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: `1.5px solid ${t.done ? timingMode.cssVar : 'var(--border-input)'}`,
                  background: t.done ? timingMode.cssVar : 'transparent',
                  color: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 12,
                  transition: 'all 150ms ease',
                }}>{t.done ? '✓' : ''}</span>
                <span style={{ ...T.body, color: t.done ? 'var(--text-faint)' : 'var(--text-strong)', textDecoration: t.done ? 'line-through' : 'none', flex: 1 }}>{t.text}</span>
              </button>
              <button
                onClick={() => p.onRemoveTask(t.id)}
                aria-label={`Remove "${t.text}"`}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'transparent', border: 'none', color: 'var(--text-faint)',
                  cursor: 'pointer', fontSize: 14,
                }}
              >✕</button>
            </div>
          ))}
          <input
            value={p.taskDraft}
            onChange={e => p.setTaskDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') p.onAddTask() }}
            placeholder="+ add a task"
            style={{ minHeight: 40, padding: '0 8px', borderRadius: 9, border: '1px dashed var(--border-input)', background: 'transparent', color: 'var(--ink)', ...T.body, outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: SP.md, flexWrap: 'wrap' }}>
        <button
          onClick={p.onTogglePause}
          style={{ flex: '1 1 100px', minHeight: 44, borderRadius: 11, ...T.bodyStrong, fontSize: 14, background: 'transparent', border: '1px solid var(--border-ghost)', color: 'var(--text-strong)', cursor: 'pointer' }}
        >
          {p.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={p.onBumpDistracted}
          aria-label={`Log a distraction. ${p.distractionCount} logged.`}
          style={{
            flex: '1 1 100px', minHeight: 44, borderRadius: 11,
            ...T.bodyStrong, fontSize: 14,
            background: 'transparent',
            border: '1px solid var(--border-ghost)',
            color: 'var(--text-body)',
            cursor: 'pointer',
            transition: 'transform 80ms ease',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)' }}
          onMouseUp={e => { e.currentTarget.style.transform = '' }}
          onMouseLeave={e => { e.currentTarget.style.transform = '' }}
        >
          Distracted
          {p.distractionCount > 0 && (
            <span style={{ marginLeft: 4, opacity: 0.7, fontWeight: 600 }}>· {p.distractionCount}</span>
          )}
        </button>
        <button
          onClick={p.onDoneEarly}
          style={{ flex: '1 1 100px', minHeight: 44, borderRadius: 11, ...T.bodyStrong, fontSize: 14, background: 'transparent', border: '1px solid var(--border-ghost)', color: 'var(--text-body)', cursor: 'pointer' }}
        >
          Done early
        </button>
      </div>

      <button
        onClick={p.onRestart}
        aria-label="Got distracted — restart this block from the beginning"
        style={{
          alignSelf: 'center',
          display: 'inline-flex', alignItems: 'center', gap: SP.sm,
          background: 'transparent', border: 'none',
          color: 'var(--text-body)', cursor: 'pointer',
          ...T.caption, fontWeight: 600,
          padding: '6px 10px', borderRadius: 8,
          minHeight: 36,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>↻</span>
        Got distracted · restart
      </button>
    </div>
  )

  const doneMode = p.doneSummary ? MODES[p.doneSummary.energy] : timingMode

  /* ----- REFLECT: end-of-block prompt ----- */
  const reflectMode = p.reflectSummary ? MODES[p.reflectSummary.energy] : timingMode
  const reflectView = (
    <div key="reflect" className="fr-anim-rise" style={{ display: 'flex', flexDirection: 'column', gap: SP.xl }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.md }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: reflectMode.cssVar }} />
        <span style={{ ...T.label, color: 'var(--text-label)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{reflectMode.label}</span>
        {p.reflectSummary?.projectName && <span style={{ ...T.caption, color: 'var(--text-body)' }}>· {p.reflectSummary.projectName}</span>}
      </div>

      <div>
        <h2 style={{ ...T.subhead, fontSize: 20, margin: 0, color: 'var(--text-strong)' }}>How did that go?</h2>
        {p.reflectSummary && (
          <div style={{ ...T.body, color: 'var(--text-body)', marginTop: SP.sm, lineHeight: 1.55 }}>
            You worked for <strong style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{fmtMin(p.reflectSummary.minutes)}</strong>
            {p.reflectSummary.totalTasks > 0 && (
              <> · <strong style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{p.reflectSummary.tasksDone}/{p.reflectSummary.totalTasks}</strong> tasks done</>
            )}
            {p.reflectSummary.distractions > 0 && (
              <> · {p.reflectSummary.distractions} distraction{p.reflectSummary.distractions === 1 ? '' : 's'} logged</>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.sm }}>
        <button
          onClick={() => p.onReflect('done')}
          style={{
            display: 'flex', alignItems: 'center', gap: SP.md,
            minHeight: 52, padding: '0 18px', borderRadius: 12,
            border: `1px solid ${reflectMode.cssVar}`,
            background: `color-mix(in srgb, ${reflectMode.cssVar} 10%, transparent)`,
            color: 'var(--text-strong)', ...T.subhead, fontSize: 16,
            cursor: 'pointer', textAlign: 'left',
            transition: 'all 160ms ease',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 16, color: reflectMode.cssVar }}>✓</span>
          <span style={{ flex: 1 }}>Done</span>
          <span style={{ ...T.caption, color: 'var(--text-faint)', fontWeight: 500 }}>task complete</span>
        </button>

        <button
          onClick={() => p.onReflect('partial')}
          style={{
            display: 'flex', alignItems: 'center', gap: SP.md,
            minHeight: 48, padding: '0 18px', borderRadius: 12,
            border: '1px solid var(--border-ghost)',
            background: 'transparent',
            color: 'var(--text-strong)', ...T.bodyStrong, fontSize: 15,
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--text-body)' }}>⊕</span>
          <span style={{ flex: 1 }}>Partial</span>
          <span style={{ ...T.caption, color: 'var(--text-faint)', fontWeight: 500 }}>made progress</span>
        </button>

        <button
          onClick={() => p.onReflect('more')}
          style={{
            display: 'flex', alignItems: 'center', gap: SP.md,
            minHeight: 48, padding: '0 18px', borderRadius: 12,
            border: '1px solid var(--border-ghost)',
            background: 'transparent',
            color: 'var(--text-strong)', ...T.bodyStrong, fontSize: 15,
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--text-body)' }}>↻</span>
          <span style={{ flex: 1 }}>More time</span>
          <span style={{ ...T.caption, color: 'var(--text-faint)', fontWeight: 500 }}>start another block</span>
        </button>

        <button
          onClick={() => p.onReflect('discard')}
          style={{
            display: 'flex', alignItems: 'center', gap: SP.md,
            minHeight: 44, padding: '0 18px', borderRadius: 12,
            border: '1px dashed var(--border-input)',
            background: 'transparent',
            color: 'var(--text-body)', ...T.body, fontSize: 14,
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--text-faint)' }}>×</span>
          <span style={{ flex: 1 }}>Didn't count</span>
          <span style={{ ...T.caption, color: 'var(--text-faint)', fontWeight: 500 }}>discard this block</span>
        </button>
      </div>
    </div>
  )

  const doneView = (
    <div key="done" className="fr-anim-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.lg, padding: `${SP.lg}px 0`, textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 72, height: 72, display: 'grid', placeItems: 'center' }}>
        {p.doneSummary?.outcome === 'done' && (
          <span aria-hidden="true" style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: `radial-gradient(circle, ${doneMode.cssVar} 0%, transparent 70%)`,
            animation: 'fr-bloom 700ms ease-out',
          }} />
        )}
        <span style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `color-mix(in srgb, ${doneMode.cssVar} 16%, transparent)`,
          display: 'grid', placeItems: 'center',
        }}>
          {p.doneSummary?.outcome === 'partial' ? (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="9" stroke={doneMode.cssVar} strokeWidth="2.5" strokeDasharray="28 60" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M7 14.5 L12 19 L21 9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: doneMode.cssVar }} />
            </svg>
          )}
        </span>
      </div>
      <div>
        <div style={{ ...T.subhead, fontSize: 18, color: 'var(--text-strong)' }}>
          {p.doneSummary?.outcome === 'partial' ? 'Block logged' : 'Block complete'}
        </div>
        {p.doneSummary && (
          <div style={{ ...T.body, color: 'var(--text-body)', marginTop: SP.sm }}>
            {fmtMin(p.doneSummary.minutes)} of {doneMode.label}{p.doneSummary.projectName ? ` on ${p.doneSummary.projectName}` : ''}
            {p.doneSummary.totalTasks ? ` · ${p.doneSummary.tasksDone}/${p.doneSummary.totalTasks} tasks` : ''}
            {p.doneSummary.distractions > 0 && (
              <>
                {' · '}
                {p.doneSummary.distractions} distraction{p.doneSummary.distractions === 1 ? '' : 's'}
              </>
            )}
          </div>
        )}
      </div>
      <button
        onClick={p.onReset}
        style={{
          minHeight: 48, padding: '0 24px', borderRadius: 12,
          ...T.subhead, fontSize: 16,
          background: 'var(--btn-neutral)', color: 'var(--page-bg)', border: 'none',
          boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
        }}
      >
        Start another →
      </button>
    </div>
  )

  return (
    <Card elevated accent={p.blockState === 'timing' ? timingMode.cssVar : undefined} style={{ minHeight: 440, transition: 'border-color 240ms ease' }}>
      {p.blockState === 'idle'    ? idleView    :
       p.blockState === 'timing'  ? timingView  :
       p.blockState === 'reflect' ? reflectView :
       doneView}
    </Card>
  )
}

/* ===== Settings ===== */
function ProjectTasksPanel({
  tasks, onChange, color,
}: {
  tasks: SavedTask[]
  onChange: (next: SavedTask[]) => void
  color: string
}) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (!v) return
    onChange([...tasks, { text: v, done: false }])
    setDraft('')
  }
  function toggle(i: number) {
    onChange(tasks.map((t, idx) => idx === i ? { ...t, done: !t.done } : t))
  }
  function remove(i: number) {
    onChange(tasks.filter((_, idx) => idx !== i))
  }
  return (
    <div className="fr-anim-fade" style={{ paddingTop: SP.md, marginLeft: 44, display: 'flex', flexDirection: 'column', gap: SP.sm }}>
      {tasks.length === 0 && (
        <div style={{ ...T.caption, color: 'var(--text-faint)' }}>No parked tasks yet — add what's waiting for this project.</div>
      )}
      {tasks.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: SP.sm }}>
          <button
            onClick={() => toggle(i)}
            aria-label={t.done ? `Mark "${t.text}" not done` : `Mark "${t.text}" done`}
            style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              border: `1.5px solid ${t.done ? color : 'var(--border-input)'}`,
              background: t.done ? color : 'transparent',
              color: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 11,
              cursor: 'pointer', padding: 0,
            }}
          >{t.done ? '✓' : ''}</button>
          <span style={{
            ...T.body, fontSize: 13, flex: 1, minWidth: 0,
            color: t.done ? 'var(--text-faint)' : 'var(--text-strong)',
            textDecoration: t.done ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{t.text}</span>
          <button
            onClick={() => remove(i)}
            aria-label={`Remove "${t.text}"`}
            style={{
              width: 28, height: 28, borderRadius: 8, background: 'transparent',
              border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 12,
            }}
          >✕</button>
        </div>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }}
        placeholder="+ add a task"
        style={{
          minHeight: 36, padding: '0 8px', borderRadius: 8,
          border: '1px dashed var(--border-input)', background: 'transparent',
          color: 'var(--ink)', ...T.body, fontSize: 13, outline: 'none',
        }}
      />
    </div>
  )
}

function Settings({
  projects, onUpdate, onRemove, onAdd, onBack, onClearSessions, hasSessions,
}: {
  projects: Project[]
  onUpdate: (id: number, patch: Partial<Project>) => void
  onRemove: (id: number) => void
  onAdd: (energy: Energy) => void
  onBack: () => void
  onClearSessions: () => void
  hasSessions: boolean
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  const groups: { key: Energy; label: string }[] = [
    { key: 'high', label: 'High energy' },
    { key: 'med',  label: 'Medium energy' },
    { key: 'low',  label: 'Low energy' },
  ]
  return (
    <div className="fr-anim-rise" style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: SP.xl }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.md }}>
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            minHeight: 40, minWidth: 40, borderRadius: 10,
            border: '1px solid var(--border-ghost)',
            background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 16, cursor: 'pointer',
          }}
        >←</button>
        <h1 style={{ ...T.subhead, fontSize: 20, margin: 0, color: 'var(--text-strong)' }}>Projects</h1>
      </div>

      {groups.map(g => {
        const items = projects.filter(p => p.energy === g.key).sort((a, b) => a.priority - b.priority || a.id - b.id)
        const mode = MODES[g.key]
        return (
          <Card key={g.key} style={{ padding: SP.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, marginBottom: SP.md }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: mode.cssVar }} />
              <Kicker>{g.label}</Kicker>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map((p, idx) => {
                const open = openId === p.id
                const taskCount = p.tasks?.length ?? 0
                const doneCount = p.tasks?.filter(t => t.done).length ?? 0
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      padding: `${SP.md}px 0`,
                      borderTop: idx === 0 ? 'none' : '1px solid var(--border-soft)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => onUpdate(p.id, { priority: (p.priority === 3 ? 1 : (p.priority + 1)) as Priority })}
                        aria-label={`Priority ${p.priority}, tap to cycle`}
                        title="Tap to cycle priority"
                        style={{
                          flexShrink: 0,
                          minWidth: 36, height: 36, padding: '0 8px', borderRadius: 8,
                          background: 'transparent',
                          border: `1px solid ${priorityShade(p.priority, mode.cssVar)}`,
                          color: priorityShade(p.priority, mode.cssVar),
                          ...T.caption, fontWeight: 700, fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                        }}
                      >P{p.priority}</button>

                      <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 11, border: '1px solid var(--border-input)', background: 'var(--card-bg)', flexShrink: 0 }}>
                        {TIME_OPTIONS.map(t => {
                          const on = p.avgBlock === t.key
                          return (
                            <button
                              key={t.key}
                              onClick={() => onUpdate(p.id, { avgBlock: t.key })}
                              title={`${t.mins} min`}
                              style={{
                                minWidth: 38, minHeight: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: on ? 'var(--surface)' : 'transparent',
                                color: on ? 'var(--text-strong)' : 'var(--text-faint)',
                                boxShadow: on ? 'var(--shadow-sm)' : 'none',
                                ...T.caption, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                transition: 'all 140ms ease',
                              }}
                            >{t.mins}</button>
                          )
                        })}
                      </div>

                      <input
                        value={p.name}
                        placeholder="Project name"
                        onChange={e => onUpdate(p.id, { name: e.target.value })}
                        style={{
                          flex: 1, minWidth: 120,
                          minHeight: 44, borderRadius: 10,
                          border: '1px solid var(--border-input)', background: 'var(--surface)',
                          color: 'var(--ink)', ...T.body, padding: '0 12px', outline: 'none',
                        }}
                      />

                      <button
                        onClick={() => setOpenId(open ? null : p.id)}
                        aria-label={open ? `Hide tasks for ${p.name || 'project'}` : `Show tasks for ${p.name || 'project'}`}
                        title="Tasks"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          minWidth: 56, height: 44, padding: '0 10px', borderRadius: 10,
                          border: `1px solid ${open ? 'var(--text-on-chip)' : 'var(--border-ghost)'}`,
                          background: open ? 'var(--tint-strong)' : 'transparent',
                          color: 'var(--text-strong)', flexShrink: 0,
                          cursor: 'pointer',
                          ...T.caption, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <span aria-hidden="true" style={{ fontSize: 11, transition: 'transform 160ms ease', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
                        <span>{taskCount > 0 ? `${doneCount}/${taskCount}` : '0'}</span>
                      </button>

                      <button
                        onClick={() => onRemove(p.id)}
                        aria-label="Delete"
                        style={{
                          width: 44, height: 44, borderRadius: 10,
                          border: '1px solid var(--border-ghost)',
                          background: 'transparent', color: 'var(--text-faint)', flexShrink: 0,
                          cursor: 'pointer', fontSize: 14,
                        }}
                      >✕</button>
                    </div>

                    {open && (
                      <ProjectTasksPanel
                        tasks={p.tasks ?? []}
                        color={mode.cssVar}
                        onChange={next => onUpdate(p.id, { tasks: next })}
                      />
                    )}
                  </div>
                )
              })}
              <button
                onClick={() => onAdd(g.key)}
                style={{
                  marginTop: SP.md, minHeight: 44, borderRadius: 10,
                  border: '1px dashed var(--border-input)', background: 'transparent',
                  color: 'var(--text-body)', ...T.bodyStrong, fontSize: 13, cursor: 'pointer',
                }}
              >
                + Add {g.label.toLowerCase()} project
              </button>
            </div>
          </Card>
        )
      })}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: SP.sm, gap: SP.md, flexWrap: 'wrap' }}>
        <span style={{ ...T.caption, color: 'var(--text-faint)' }}>Data lives in this browser only.</span>
        <button
          onClick={onClearSessions}
          disabled={!hasSessions}
          style={{
            minHeight: 40, padding: '0 14px', borderRadius: 10,
            border: '1px solid var(--border-ghost)', background: 'transparent',
            color: hasSessions ? 'var(--danger)' : 'var(--text-faint)',
            ...T.bodyStrong, fontSize: 13,
            cursor: hasSessions ? 'pointer' : 'not-allowed',
          }}
        >
          Clear all sessions
        </button>
      </div>
    </div>
  )
}

/* ===== Words view ===== */
function WordsView({ savedWords, onRemove }: {
  savedWords: SavedWord[]
  onRemove: (word: string) => void
}) {
  const sorted = [...savedWords].sort((a, b) => b.savedAt - a.savedAt)
  return (
    <div className="fr-anim-rise" style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: SP.xl }}>
      <div>
        <Kicker>Your words</Kicker>
        <h1 style={{ ...T.subhead, fontSize: 22, margin: `${SP.sm}px 0 0`, color: 'var(--text-strong)' }}>
          Saved words
        </h1>
      </div>
      {sorted.length === 0 ? (
        <Card style={{ padding: SP.xl, textAlign: 'center' }}>
          <div style={{ ...T.bodyStrong, color: 'var(--text-strong)', marginBottom: SP.xs }}>No saved words yet</div>
          <div style={{ ...T.body, color: 'var(--text-body)', fontSize: 14 }}>
            Tap "+ Save" on the word of the day and it'll land here.
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
          {sorted.map(w => (
            <Card key={w.word} style={{ padding: SP.lg, display: 'flex', flexDirection: 'column', gap: SP.sm }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, flexWrap: 'wrap' }}>
                <span style={{ ...T.subhead, fontSize: 19, color: 'var(--text-strong)' }}>{w.word}</span>
                <span style={{
                  ...T.caption, color: 'var(--text-faint)',
                  fontFamily: 'ui-serif, Georgia, serif', fontStyle: 'italic', fontSize: 13,
                }}>{w.ipa}</span>
                <button
                  onClick={() => speakWord(w.word)}
                  aria-label={`Hear ${w.word} pronounced`}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    background: 'transparent', border: 'none', color: 'var(--text-body)',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}
                ><SpeakerIcon /></button>
                <span style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: SP.sm,
                  ...T.caption, color: 'var(--text-faint)',
                }}>
                  <span>{new Date(w.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <button
                    onClick={() => onRemove(w.word)}
                    aria-label={`Remove ${w.word}`}
                    style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: 'transparent', border: 'none', color: 'var(--text-faint)',
                      cursor: 'pointer', fontSize: 13,
                    }}
                  >✕</button>
                </span>
              </div>
              <p style={{ margin: 0, ...T.body, fontSize: 14, color: 'var(--text-body)', lineHeight: 1.5 }}>
                {w.definition}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== Journal view ===== */
function JournalEntryCard({
  entry, onUpdate, onRemove,
}: {
  entry: JournalEntry
  onUpdate: (id: number, text: string) => void
  onRemove: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.text)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => { if (!editing) setDraft(entry.text) }, [entry.text, editing])
  useEffect(() => { if (editing) taRef.current?.focus() }, [editing])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      onRemove(entry.id)
    } else if (trimmed !== entry.text.trim()) {
      onUpdate(entry.id, draft)
    }
    setEditing(false)
  }

  return (
    <Card style={{ padding: SP.lg, display: 'flex', flexDirection: 'column', gap: SP.sm }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm }}>
        <span style={{ ...T.caption, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '0.04em' }}>
          {fmtJournalTimestamp(entry.createdAt)}
          {entry.updatedAt > entry.createdAt + 1000 && (
            <span style={{ ...T.caption, fontWeight: 500, color: 'var(--text-faint)', marginLeft: SP.sm }}>
              edited
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: SP.xs }}>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit entry"
              title="Edit"
              style={{
                minHeight: 28, padding: '0 10px', borderRadius: 999,
                background: 'transparent', border: '1px solid var(--border-chip)',
                color: 'var(--text-body)', ...T.caption, fontWeight: 700, cursor: 'pointer',
              }}
            >Edit</button>
          )}
          <button
            onClick={() => onRemove(entry.id)}
            aria-label="Delete entry"
            title="Delete"
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'transparent', border: 'none', color: 'var(--text-faint)',
              cursor: 'pointer', fontSize: 13,
            }}
          >✕</button>
        </div>
      </div>
      {editing ? (
        <>
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setDraft(entry.text); setEditing(false) }
            }}
            style={{
              width: '100%', minHeight: 140, padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border-input)', background: 'var(--surface)',
              color: 'var(--ink)', ...T.body, fontSize: 14, lineHeight: 1.6,
              outline: 'none', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: SP.sm, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setDraft(entry.text); setEditing(false) }}
              style={{
                minHeight: 32, padding: '0 12px', borderRadius: 999,
                background: 'transparent', border: '1px solid var(--border-chip)',
                color: 'var(--text-body)', ...T.caption, fontWeight: 700, cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              onClick={commit}
              style={{
                minHeight: 32, padding: '0 14px', borderRadius: 999,
                background: 'var(--btn-neutral)', border: 'none',
                color: 'var(--page-bg)', ...T.caption, fontWeight: 700, cursor: 'pointer',
              }}
            >Save</button>
          </div>
        </>
      ) : (
        <p style={{ margin: 0, ...T.body, fontSize: 14, color: 'var(--text-body)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {entry.text}
        </p>
      )}
    </Card>
  )
}

function JournalView() {
  const [entries, setEntries] = useState<JournalEntry[]>(loadJournal)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries)) } catch { /* ignore quota */ }
  }, [entries])

  function addEntry() {
    const text = draft
    if (text.trim().length === 0) return
    const now = Date.now()
    const entry: JournalEntry = { id: now, createdAt: now, updatedAt: now, text }
    setEntries(prev => [entry, ...prev])
    setDraft('')
  }

  function updateEntry(id: number, text: string) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, text, updatedAt: Date.now() } : e))
  }

  function removeEntry(id: number) {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="fr-anim-rise" style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: SP.xl }}>
      <div>
        <Kicker>Your journal</Kicker>
        <h1 style={{ ...T.subhead, fontSize: 22, margin: `${SP.sm}px 0 0`, color: 'var(--text-strong)' }}>
          {fmtDateShort()}
        </h1>
      </div>

      <Card style={{ padding: SP.lg, display: 'flex', flexDirection: 'column', gap: SP.sm }}>
        <Kicker>New entry</Kicker>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              addEntry()
            }
          }}
          placeholder="A thought, a win, a blocker, a note to self…"
          aria-label="New journal entry"
          style={{
            width: '100%',
            minHeight: 140,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid var(--border-input)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            ...T.body, fontSize: 15, lineHeight: 1.55,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SP.sm }}>
          <span style={{ ...T.caption, color: 'var(--text-faint)' }}>
            {wordCount > 0
              ? `${wordCount} ${wordCount === 1 ? 'word' : 'words'} · ⌘↵ to save`
              : 'Capture anything. Save creates a new timestamped entry.'}
          </span>
          <button
            onClick={addEntry}
            disabled={wordCount === 0}
            style={{
              minHeight: 36, padding: '0 16px', borderRadius: 999,
              border: 'none',
              background: wordCount === 0 ? 'var(--disabled-bg)' : 'var(--btn-neutral)',
              color: wordCount === 0 ? 'var(--text-faint)' : 'var(--page-bg)',
              ...T.caption, fontWeight: 700, fontSize: 13,
              cursor: wordCount === 0 ? 'not-allowed' : 'pointer',
              boxShadow: wordCount === 0 ? 'none' : 'var(--shadow-sm)',
            }}
          >Save entry</button>
        </div>
      </Card>

      {sorted.length === 0 ? (
        <Card style={{ padding: SP.xl, textAlign: 'center' }}>
          <div style={{ ...T.bodyStrong, color: 'var(--text-strong)', marginBottom: SP.xs }}>No entries yet</div>
          <div style={{ ...T.body, color: 'var(--text-body)', fontSize: 14 }}>
            Anything you save lands here, newest first. Tap any entry to edit later.
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
          {sorted.map(e => (
            <JournalEntryCard key={e.id} entry={e} onUpdate={updateEntry} onRemove={removeEntry} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== Welcome / first-run onboarding ===== */
function WelcomeView({ onComplete }: { onComplete: (initial: Project[]) => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [drafts, setDrafts] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [energy, setEnergy] = useState<Energy>('high')
  const [timeKey, setTimeKey] = useState<TimeKey>('chunk')
  const inputRef = useRef<HTMLInputElement | null>(null)

  function addDraft() {
    const trimmed = name.trim()
    if (!trimmed) return
    const nextId = drafts.reduce((m, p) => Math.max(m, p.id), 0) + 1
    setDrafts(prev => [...prev, { id: nextId, name: trimmed, energy, priority: 2, avgBlock: timeKey }])
    setName('')
    inputRef.current?.focus()
  }
  function removeDraft(id: number) {
    setDrafts(prev => prev.filter(p => p.id !== id))
  }
  function useSamples() {
    onComplete(SEED)
  }
  function finish() {
    if (drafts.length === 0) return
    onComplete(drafts)
  }

  return (
    <div
      className="fr-anim-fade"
      style={{
        minHeight: '100dvh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: SP.lg,
        background: 'var(--page-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: SP.xxl }}>
          <span style={{ fontSize: 32, color: 'var(--mode-high)', lineHeight: 1 }}>◐</span>
          <div style={{ ...T.bodyStrong, fontSize: 14, color: 'var(--text-strong)', marginTop: SP.xs, letterSpacing: '0.02em' }}>
            Focus Router
          </div>
        </div>

        <div role="presentation" style={{ display: 'flex', justifyContent: 'center', gap: SP.xs, marginBottom: SP.xl }}>
          {[1, 2].map(n => (
            <span
              key={n}
              aria-hidden="true"
              style={{
                width: step === n ? 18 : 6, height: 6, borderRadius: 3,
                background: step === n ? 'var(--mode-high)' : 'var(--border-chip)',
                transition: 'all 200ms ease',
              }}
            />
          ))}
        </div>

        <Card elevated style={{ padding: SP.xl, display: 'flex', flexDirection: 'column', gap: SP.lg }}>
          {step === 1 ? (
            <>
              <h1 style={{ ...T.banner, fontSize: 20, margin: 0, color: 'var(--text-strong)', letterSpacing: '0.03em' }}>
                Sit down.
              </h1>
              <p style={{ margin: 0, ...T.body, fontSize: 15, color: 'var(--text-body)', lineHeight: 1.6 }}>
                Focus Router gets you into a focus block — pick how you feel and how much time you have, and it surfaces a project that fits. Then it runs the timer.
              </p>
              <p style={{ margin: 0, ...T.body, fontSize: 14, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                Two taps to start. No to-do list to manage.
              </p>
              <button
                onClick={() => setStep(2)}
                style={{
                  marginTop: SP.sm,
                  minHeight: 48, padding: '0 18px', borderRadius: 12,
                  border: 'none', background: 'var(--btn-neutral)',
                  color: 'var(--page-bg)', ...T.subhead, fontSize: 16,
                  cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                }}
              >
                Set up my projects →
              </button>
            </>
          ) : (
            <>
              <h1 style={{ ...T.banner, fontSize: 19, margin: 0, color: 'var(--text-strong)', letterSpacing: '0.03em' }}>
                What are you working on?
              </h1>
              <p style={{ margin: 0, ...T.body, fontSize: 14, color: 'var(--text-body)', lineHeight: 1.55 }}>
                These are the buckets you'll focus against. Tag each with the kind of energy it needs and a typical block length.
                You can edit them later in Projects.
              </p>

              {drafts.length > 0 && (
                <div className="fr-anim-fade" style={{ display: 'flex', flexDirection: 'column', gap: SP.sm }}>
                  {drafts.map(p => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: SP.sm,
                        padding: '10px 12px', borderRadius: 10,
                        background: 'var(--tint-strong)',
                      }}
                    >
                      <span aria-hidden="true" style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: MODES[p.energy].cssVar, flexShrink: 0,
                      }} />
                      <span style={{ flex: 1, ...T.bodyStrong, fontSize: 14, color: 'var(--text-strong)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                      <span style={{ ...T.caption, color: 'var(--text-faint)' }}>
                        {MODES[p.energy].label.split(' ')[0]} · {TIME_OPTIONS.find(t => t.key === p.avgBlock)?.label}
                      </span>
                      <button
                        onClick={() => removeDraft(p.id)}
                        aria-label={`Remove ${p.name}`}
                        style={{
                          width: 28, height: 28, borderRadius: 8,
                          background: 'transparent', border: 'none', color: 'var(--text-faint)',
                          cursor: 'pointer', fontSize: 13,
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.sm, paddingTop: drafts.length > 0 ? SP.sm : 0, borderTop: drafts.length > 0 ? '1px solid var(--border-soft)' : 'none', marginTop: drafts.length > 0 ? SP.xs : 0 }}>
                <input
                  ref={inputRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addDraft() }}
                  placeholder="e.g. Main project, Inbox sweep, Side build"
                  aria-label="Project name"
                  autoFocus
                  style={{
                    width: '100%', minHeight: 44, padding: '0 14px', borderRadius: 11,
                    border: '1px solid var(--border-input)', background: 'var(--surface)',
                    color: 'var(--ink)', ...T.body, fontSize: 15, outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
                  <span style={{ ...T.kicker, color: 'var(--text-label)' }}>Energy</span>
                  <Segmented
                    options={ENERGY_OPTIONS}
                    value={energy}
                    onChange={(k) => setEnergy(k as Energy)}
                    accentFor={(k) => MODES[k as Energy].cssVar}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
                  <span style={{ ...T.kicker, color: 'var(--text-label)' }}>Typical block</span>
                  <Segmented
                    options={TIME_OPTIONS}
                    value={timeKey}
                    onChange={(k) => setTimeKey(k as TimeKey)}
                  />
                </div>

                <button
                  onClick={addDraft}
                  disabled={!name.trim()}
                  style={{
                    marginTop: SP.xs,
                    minHeight: 40, padding: '0 14px', borderRadius: 11,
                    border: '1px dashed var(--border-input)', background: 'transparent',
                    color: name.trim() ? 'var(--text-strong)' : 'var(--text-faint)',
                    ...T.bodyStrong, fontSize: 13,
                    cursor: name.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  + Add project
                </button>
              </div>

              <button
                onClick={finish}
                disabled={drafts.length === 0}
                style={{
                  minHeight: 48, padding: '0 18px', borderRadius: 12,
                  border: 'none',
                  background: drafts.length === 0 ? 'var(--disabled-bg)' : 'var(--btn-neutral)',
                  color: drafts.length === 0 ? 'var(--text-faint)' : 'var(--page-bg)',
                  ...T.subhead, fontSize: 16,
                  cursor: drafts.length === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: drafts.length === 0 ? 'none' : 'var(--shadow-sm)',
                }}
              >
                {drafts.length === 0
                  ? 'Add at least one to continue'
                  : `Open dashboard · ${drafts.length} project${drafts.length === 1 ? '' : 's'} →`}
              </button>

              <button
                onClick={useSamples}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-faint)', ...T.caption, fontWeight: 600,
                  cursor: 'pointer', padding: 4, alignSelf: 'center',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}
              >
                Or skip — give me sample projects to explore
              </button>
            </>
          )}
        </Card>

        {step === 2 && (
          <button
            onClick={() => setStep(1)}
            style={{
              display: 'block', margin: `${SP.md}px auto 0`,
              background: 'transparent', border: 'none',
              color: 'var(--text-faint)', ...T.caption, fontWeight: 600,
              cursor: 'pointer', padding: 4,
            }}
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  )
}

/* ===== Sidebar ===== */
function Sidebar({
  screen, onSelectScreen, theme, onToggleTheme, open, onClose,
}: {
  screen: Screen
  onSelectScreen: (s: Screen) => void
  theme: ThemeChoice
  onToggleTheme: () => void
  open: boolean
  onClose: () => void
}) {
  const items: { key: Screen; label: string; icon: string }[] = [
    { key: 'home',     label: 'Dashboard', icon: '◐' },
    { key: 'settings', label: 'Projects',  icon: '⚙' },
    { key: 'words',    label: 'Words',     icon: 'Aa' },
    { key: 'journal',  label: 'Journal',   icon: '✎' },
  ]
  function select(key: Screen) {
    onSelectScreen(key)
    onClose()
  }
  return (
    <aside
      className={`fr-sidebar ${open ? 'fr-sidebar-open' : ''}`}
      role="navigation"
      aria-label="Primary"
    >
      <button
        onClick={() => select('home')}
        aria-label="Focus Router home"
        style={{
          display: 'flex', alignItems: 'center', gap: SP.md,
          background: 'none', border: 'none', padding: '4px 8px',
          cursor: 'pointer', marginBottom: SP.xxl, textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 22, color: 'var(--mode-high)' }}>◐</span>
        <span style={{ ...T.bodyStrong, fontSize: 15, color: 'var(--text-strong)' }}>Focus Router</span>
      </button>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: SP.xs }}>
        {items.map(item => {
          const active = screen === item.key
          return (
            <button
              key={item.key}
              onClick={() => select(item.key)}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: SP.md,
                width: '100%', textAlign: 'left',
                padding: '10px 12px', borderRadius: 10,
                border: '1px solid transparent',
                background: active ? 'var(--tint-strong)' : 'transparent',
                color: active ? 'var(--text-strong)' : 'var(--text-body)',
                cursor: 'pointer', minHeight: 40,
                ...T.bodyStrong, fontSize: 14,
                transition: 'all 150ms ease',
              }}
            >
              <span aria-hidden="true" style={{
                fontSize: 15, width: 18, textAlign: 'center',
                color: active ? 'var(--mode-high)' : 'var(--text-faint)',
              }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {active && (
                <span aria-hidden="true" style={{
                  width: 4, height: 4, borderRadius: 4, background: 'var(--mode-high)',
                }} />
              )}
            </button>
          )
        })}
      </nav>

      <div style={{
        marginTop: 'auto',
        paddingTop: SP.md,
        borderTop: '1px solid var(--border-soft)',
        display: 'flex', flexDirection: 'column', gap: SP.xs,
      }}>
        <button
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            display: 'flex', alignItems: 'center', gap: SP.md,
            width: '100%', textAlign: 'left',
            padding: '10px 12px', borderRadius: 10,
            border: '1px solid transparent', background: 'transparent',
            color: 'var(--text-body)', cursor: 'pointer', minHeight: 40,
            ...T.bodyStrong, fontSize: 14,
          }}
        >
          <span aria-hidden="true" style={{
            fontSize: 15, width: 18, textAlign: 'center', color: 'var(--text-faint)',
          }}>{theme === 'dark' ? '◐' : '◑'}</span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </aside>
  )
}

/* ===== App ===== */
export default function App() {
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [sessions, setSessions] = useState<Session[]>(loadSessions)
  const [screen, setScreen] = useState<Screen>('home')
  const [blockState, setBlockState] = useState<BlockState>('idle')
  const [energy, setEnergy] = useState<Energy>('high')
  const [time, setTime] = useState<TimeKey>('deep')
  const [projectId, setProjectId] = useState<number | null>(null)
  const [intention, setIntention] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [paused, setPaused] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(getInitialTheme)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [taskDraft, setTaskDraft] = useState('')
  const [doneSummary, setDoneSummary] = useState<FocusBlockProps['doneSummary']>(null)
  const [reflectSummary, setReflectSummary] = useState<FocusBlockProps['reflectSummary']>(null)
  const [mainTask, setMainTask] = useState<MainTaskState | null>(loadMainTask)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try {
      if (localStorage.getItem(ONBOARDED_KEY) === 'true') return false
      // Auto-onboard returning users (any prior data means they're not first-time)
      const priorKeys = [STORAGE_KEY, LEGACY_KEY, SESSIONS_KEY, MAIN_TASK_KEY, JOURNAL_KEY, WORDS_KEY]
      const hasAnyData = priorKeys.some(k => localStorage.getItem(k) !== null)
      if (hasAnyData) {
        try { localStorage.setItem(ONBOARDED_KEY, 'true') } catch { /* ignore */ }
        return false
      }
      return true
    } catch { return false }
  })

  function finishOnboarding(initial: Project[]) {
    // Re-number ids to avoid collisions with any future internal logic
    const seeded = initial.map((p, i) => ({ ...p, id: i + 1 }))
    setProjects(seeded)
    try { localStorage.setItem(ONBOARDED_KEY, 'true') } catch { /* ignore */ }
    setShowWelcome(false)
  }
  const [savedWords, setSavedWords] = useState<SavedWord[]>(loadSavedWords)
  const lastEnergyRef = useRef<Energy>('high')
  const endsAtRef = useRef<number>(0)
  const remainingMsRef = useRef<number>(0)
  const sessionStartRef = useRef<number>(0)
  const pauseAccumRef = useRef<number>(0)
  const lastPauseAtRef = useRef<number | null>(null)
  const taskIdRef = useRef<number>(1)
  const distractCountRef = useRef<number>(0)
  const [distractionCount, setDistractionCount] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)) } catch { /* ignore */ }
  }, [projects])

  useEffect(() => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)) } catch { /* ignore */ }
  }, [sessions])

  useEffect(() => {
    try {
      if (mainTask === null) localStorage.removeItem(MAIN_TASK_KEY)
      else localStorage.setItem(MAIN_TASK_KEY, JSON.stringify(mainTask))
    } catch { /* ignore */ }
  }, [mainTask])

  useEffect(() => {
    try { localStorage.setItem(WORDS_KEY, JSON.stringify(savedWords)) } catch { /* ignore */ }
  }, [savedWords])

  function saveWord(w: SavedWord) {
    setSavedWords(prev => prev.some(x => x.word === w.word) ? prev : [w, ...prev])
  }
  function removeWord(word: string) {
    setSavedWords(prev => prev.filter(w => w.word !== word))
  }

  function pickMainTask() {
    if (!mainTask || mainTask.done) return
    // Always prefill the intention with the main task text
    setIntention(mainTask.text)
    // If a project is linked AND still exists, also lock in energy/time/project
    if (mainTask.projectId === undefined) return
    const proj = projects.find(p => p.id === mainTask.projectId)
    if (!proj) return
    setEnergy(proj.energy)
    setTime(proj.avgBlock)
    setProjectId(proj.id)
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1a1917' : '#f3efe3')
  }, [theme])

  useEffect(() => {
    if (blockState !== 'timing' || paused) return
    const tick = () => {
      const left = Math.ceil((endsAtRef.current - Date.now()) / 1000)
      if (left <= 0) {
        setSecondsLeft(0)
        playChime()
        enterReflect()
        return
      }
      setSecondsLeft(left)
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockState, paused])

  function computeReflectSummary() {
    if (sessionStartRef.current === 0) return null
    const now = Date.now()
    let pauseTotal = pauseAccumRef.current
    if (lastPauseAtRef.current !== null) pauseTotal += now - lastPauseAtRef.current
    const durationMs = Math.max(0, now - sessionStartRef.current - pauseTotal)
    const project = projects.find(x => x.id === projectId)
    return {
      energy: lastEnergyRef.current,
      minutes: Math.max(0, Math.round(msToMin(durationMs))),
      projectName: project?.name ?? null,
      tasksDone: tasks.filter(t => t.done).length,
      totalTasks: tasks.length,
      distractions: distractCountRef.current,
    }
  }

  function enterReflect() {
    const summary = computeReflectSummary()
    if (summary) setReflectSummary(summary)
    setBlockState('reflect')
  }

  function recordSession(outcome: 'done' | 'partial') {
    if (sessionStartRef.current === 0) return null
    const now = Date.now()
    let pauseTotal = pauseAccumRef.current
    if (lastPauseAtRef.current !== null) pauseTotal += now - lastPauseAtRef.current
    const durationMs = Math.max(0, now - sessionStartRef.current - pauseTotal)
    const project = projects.find(x => x.id === projectId)
    const sessionEnergy = lastEnergyRef.current
    const sessionBlockMs = TIME_MIN[time] * 60 * 1000
    const session: Session = {
      id: now,
      startedAt: sessionStartRef.current,
      endedAt: now,
      durationMs,
      blockMs: sessionBlockMs,
      energy: sessionEnergy,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      intention: intention.trim(),
      completed: outcome === 'done',
      outcome,
      distractions: distractCountRef.current,
    }
    const sessionWithTasks: Session = tasks.length > 0
      ? { ...session, tasks: tasks.map(t => ({ text: t.text, done: t.done })) }
      : session
    setSessions(prev => [...prev, sessionWithTasks])
    const summary = {
      energy: sessionEnergy,
      minutes: Math.max(1, Math.round(msToMin(durationMs))),
      projectName: project?.name ?? null,
      tasksDone: tasks.filter(t => t.done).length,
      totalTasks: tasks.length,
      distractions: distractCountRef.current,
      outcome,
    }
    setDoneSummary(summary)
    sessionStartRef.current = 0
    return summary
  }

  function resetDistraction() {
    distractCountRef.current = 0
    setDistractionCount(0)
  }

  function bumpDistracted() {
    distractCountRef.current += 1
    setDistractionCount(distractCountRef.current)
  }

  function reflectAs(outcome: BlockOutcome) {
    if (outcome === 'discard') {
      // Discard fully — no session recorded
      sessionStartRef.current = 0
      resetAll()
      return
    }
    if (outcome === 'more') {
      recordSession('partial')
      // Start another block with the same setup
      const sameProjectId = projectId
      const sameEnergy = energy
      const sameTime = time
      // re-start timer with same params (preserve project/energy/time)
      if (sameProjectId !== null) {
        const totalMs = TIME_MIN[sameTime] * 60 * 1000
        const now = Date.now()
        endsAtRef.current = now + totalMs
        remainingMsRef.current = totalMs
        sessionStartRef.current = now
        pauseAccumRef.current = 0
        lastPauseAtRef.current = null
        setSecondsLeft(Math.ceil(totalMs / 1000))
        setPaused(false)
        resetDistraction()
        lastEnergyRef.current = sameEnergy
        const project = projects.find(p => p.id === sameProjectId)
        const seed: TaskItem[] = (project?.tasks ?? []).map(t => ({
          id: taskIdRef.current++,
          text: t.text,
          done: t.done,
        }))
        setTasks(seed)
        setTaskDraft('')
        setReflectSummary(null)
        setBlockState('timing')
      } else {
        resetAll()
      }
      return
    }
    // done or partial
    recordSession(outcome)
    setReflectSummary(null)
    setBlockState('done')
  }

  function startTimer() {
    if (!projectId) return
    const totalMs = TIME_MIN[time] * 60 * 1000
    const now = Date.now()
    endsAtRef.current = now + totalMs
    remainingMsRef.current = totalMs
    sessionStartRef.current = now
    pauseAccumRef.current = 0
    lastPauseAtRef.current = null
    setSecondsLeft(Math.ceil(totalMs / 1000))
    setPaused(false)
    resetDistraction()
    lastEnergyRef.current = energy
    const project = projects.find(p => p.id === projectId)
    const seed: TaskItem[] = (project?.tasks ?? []).map(t => ({
      id: taskIdRef.current++,
      text: t.text,
      done: t.done,
    }))
    setTasks(seed)
    setTaskDraft('')
    setDoneSummary(null)
    setBlockState('timing')
  }

  function togglePause() {
    setPaused(prev => {
      const now = Date.now()
      if (!prev) {
        // entering pause — freeze timer
        remainingMsRef.current = Math.max(0, endsAtRef.current - now)
        lastPauseAtRef.current = now
      } else {
        // exiting pause — un-freeze
        if (lastPauseAtRef.current !== null) {
          endsAtRef.current = now + remainingMsRef.current
          pauseAccumRef.current += now - lastPauseAtRef.current
          lastPauseAtRef.current = null
        }
      }
      return !prev
    })
  }

  function restartBlock() {
    if (!time) return
    const totalMs = TIME_MIN[time] * 60 * 1000
    const now = Date.now()
    endsAtRef.current = now + totalMs
    remainingMsRef.current = totalMs
    sessionStartRef.current = now
    pauseAccumRef.current = 0
    lastPauseAtRef.current = null
    setSecondsLeft(Math.ceil(totalMs / 1000))
    setPaused(false)
    resetDistraction()
    // keep tasks (and their done state), intention, energy/time/project untouched
  }

  function doneEarly() {
    enterReflect()
  }

  function resetAll() {
    setBlockState('idle')
    setProjectId(null)
    setIntention('')
    setSecondsLeft(0)
    setPaused(false)
    resetDistraction()
    setTasks([])
    setTaskDraft('')
    setDoneSummary(null)
    setReflectSummary(null)
  }

  function easier() {
    const nextE = ENERGY_DOWN[energy]
    setEnergy(nextE)
    if (time !== 'quick') setTime('quick')
    setProjectId(null)
  }

  function toggleTheme() {
    setTheme(t => {
      const next: ThemeChoice = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(THEME_KEY, next) } catch { /* ignore */ }
      return next
    })
  }

  function syncTasksToProject(next: TaskItem[]) {
    if (projectId === null) return
    setProjects(prev => prev.map(p => p.id === projectId ? {
      ...p,
      tasks: next.map(t => ({ text: t.text, done: t.done })),
    } : p))
  }

  function addTask() {
    const v = taskDraft.trim()
    if (!v) return
    const id = taskIdRef.current++
    const next = [...tasks, { id, text: v, done: false }]
    setTasks(next)
    syncTasksToProject(next)
    setTaskDraft('')
  }

  function toggleTask(id: number) {
    const next = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
    setTasks(next)
    syncTasksToProject(next)
  }

  function removeTask(id: number) {
    const next = tasks.filter(t => t.id !== id)
    setTasks(next)
    syncTasksToProject(next)
  }

  function updateProject(id: number, patch: Partial<Project>) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  function removeProject(id: number) {
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  function addProject(en: Energy) {
    const nextId = projects.reduce((m, p) => Math.max(m, p.id), 0) + 1
    setProjects(prev => [...prev, { id: nextId, name: '', energy: en, priority: 2, avgBlock: 'chunk' }])
  }

  // ensure projectId stays valid when energy/time changes
  useEffect(() => {
    if (projectId === null) return
    const stillValid = projects.find(p => p.id === projectId && p.energy === energy && fitCount(p.avgBlock, time) >= 1)
    if (!stillValid) setProjectId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energy, time])

  if (showWelcome) {
    return <WelcomeView onComplete={finishOnboarding} />
  }

  return (
    <div className="fr-shell">
      <Sidebar
        screen={screen}
        onSelectScreen={setScreen}
        theme={theme}
        onToggleTheme={toggleTheme}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div
        className={`fr-backdrop ${sidebarOpen ? 'fr-backdrop-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <main className="fr-main">
        <div className="fr-mobile-topbar">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 12,
              border: '1px solid var(--border-ghost)', background: 'var(--card-bg)',
              color: 'var(--text-strong)', fontSize: 18, cursor: 'pointer',
            }}
          >☰</button>
          <span style={{ ...T.bodyStrong, fontSize: 15, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: SP.sm }}>
            <span style={{ color: 'var(--mode-high)' }}>◐</span>
            Focus Router
          </span>
          <span style={{ width: 44 }} aria-hidden="true" />
        </div>

        {screen === 'settings' ? (
        <Settings
          projects={projects}
          onUpdate={updateProject}
          onRemove={removeProject}
          onAdd={addProject}
          onBack={() => setScreen('home')}
          onClearSessions={() => setSessions([])}
          hasSessions={sessions.length > 0}
        />
      ) : screen === 'words' ? (
        <WordsView savedWords={savedWords} onRemove={removeWord} />
      ) : screen === 'journal' ? (
        <JournalView />
      ) : (
        <>
          <div style={{ marginBottom: SP.xl }}>
            <TodayHeader />
          </div>
          <StatStrip sessions={sessions} />
          <div className="fr-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.lg }}>
              <MainTaskCard projects={projects} task={mainTask} onSetTask={setMainTask} />
              <FocusBlock
                projects={projects}
                blockState={blockState}
                energy={energy}
                setEnergy={setEnergy}
                time={time}
                setTime={setTime}
                projectId={projectId}
                setProjectId={setProjectId}
                intention={intention}
                setIntention={setIntention}
                secondsLeft={secondsLeft}
                paused={paused}
                tasks={tasks}
                taskDraft={taskDraft}
                setTaskDraft={setTaskDraft}
                onStart={startTimer}
                onTogglePause={togglePause}
                onDoneEarly={doneEarly}
                onReset={resetAll}
                onRestart={restartBlock}
                onEasier={easier}
                onBumpDistracted={bumpDistracted}
                onReflect={reflectAs}
                distractionCount={distractionCount}
                reflectSummary={reflectSummary}
                onAddTask={addTask}
                onToggleTask={toggleTask}
                onRemoveTask={removeTask}
                lastEnergy={lastEnergyRef.current}
                doneSummary={doneSummary}
                mainTask={mainTask}
                onPickMainTask={pickMainTask}
              />
              <MusicCard />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.lg }}>
              <OnThisDayCard />
              <WordOfDayCard savedWords={savedWords} onSave={saveWord} />
              <StatsSidebar sessions={sessions} />
            </div>
          </div>
        </>
        )}
      </main>
    </div>
  )
}

// PRIORITIES exported for parity with seed/persistence; referenced once to mark intent
void PRIORITIES
