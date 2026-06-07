import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/* ===== Types ===== */
type Energy = 'high' | 'med' | 'low'
type Priority = 1 | 2 | 3
type TimeKey = 'quick' | 'chunk' | 'deep'
type Screen = 'home' | 'settings'
type BlockState = 'idle' | 'timing' | 'done'
type Project = { id: number; name: string; energy: Energy; priority: Priority; avgBlock: TimeKey }
type ThemeChoice = 'light' | 'dark'
type TrackId = 'lofi' | 'chill' | 'synth'
type TaskItem = { id: number; text: string; done: boolean }
type SavedTask = { text: string; done: boolean }
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
  tasks?: SavedTask[]
}

/* ===== Storage keys ===== */
const STORAGE_KEY = 'focus_projects'
const LEGACY_KEY = 'focus_areas'
const SESSIONS_KEY = 'focus_sessions'
const THEME_KEY = 'focus_theme'
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
  { id: 'lofi',  label: 'Study', name: 'Lofi study beats', videoId: 'X4VbdwhkE10' },
  { id: 'chill', label: 'Chill', name: 'Lofi chill',       videoId: 'hIH1joP9_FU' },
  { id: 'synth', label: 'Synth', name: 'Synthwave radio',  videoId: 'acjs8sDZDro' },
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

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/* ===== Helpers ===== */
function fitCount(avg: TimeKey, block: TimeKey): number {
  return Math.floor(TIME_MIN[block] / TIME_MIN[avg])
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return SEED
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return SEED
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
      }))
    return cleaned.length ? cleaned : SEED
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

function dailyQuote(): [string, string] {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0).getTime()
  const day = Math.floor((now.getTime() - start) / 86400000)
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length]
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

function MusicCard({ trackId, onToggle }: { trackId: TrackId | null; onToggle: (id: TrackId) => void }) {
  const playing = trackId !== null ? TRACKS.find(t => t.id === trackId) ?? null : null
  return (
    <Card style={{ padding: SP.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--text-label)', fontSize: 14 }}>♪</span>
          <Kicker>Focus music</Kicker>
        </div>
        <div style={{ display: 'flex', gap: SP.sm }}>
          {TRACKS.map(t => {
            const on = trackId === t.id
            return (
              <button
                key={t.id}
                onClick={() => onToggle(t.id)}
                aria-label={on ? `Stop ${t.name}` : `Play ${t.name}`}
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
                }}
              >
                <span aria-hidden="true" style={{ fontSize: on ? 10 : 11, lineHeight: 1, transform: 'translateY(-0.5px)' }}>
                  {on ? '◼' : '▶'}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>
      {playing && (
        <div className="fr-anim-fade" style={{ display: 'flex', alignItems: 'center', gap: SP.md, paddingTop: SP.md, marginTop: SP.md, borderTop: '1px solid var(--border-soft)' }}>
          <Equalizer color="var(--text-chip-mid)" />
          <span style={{ ...T.caption, color: 'var(--text-body)', flex: 1 }}>
            Now playing · {playing.name}
          </span>
          <iframe
            key={playing.videoId}
            title={playing.name}
            src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&modestbranding=1&rel=0&loop=1&playlist=${playing.videoId}`}
            allow="autoplay; encrypted-media"
            loading="lazy"
            style={{ border: 0, width: 0, height: 0, opacity: 0, position: 'absolute' }}
          />
        </div>
      )}
    </Card>
  )
}

/* ===== Daily note ===== */
function DailyNote() {
  const [q, by] = dailyQuote()
  return (
    <div className="fr-anim-fade" style={{ display: 'flex', alignItems: 'flex-start', gap: SP.md, maxWidth: 620, marginBottom: SP.xxl, padding: '0 2px' }}>
      <span aria-hidden="true" style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: 'var(--mode-high)', opacity: 0.55, flexShrink: 0 }} />
      <p style={{ margin: 0, ...T.body, fontSize: 15, fontStyle: 'italic', color: 'var(--text-body)' }}>
        {q}
        <span style={{ fontStyle: 'normal', color: 'var(--text-faint)', marginLeft: SP.sm }}>— {by}</span>
      </p>
    </div>
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
  onEasier: () => void
  onAddTask: () => void
  onToggleTask: (id: number) => void
  onRemoveTask: (id: number) => void
  lastEnergy: Energy
  doneSummary: { energy: Energy; minutes: number; projectName: string | null; tasksDone: number; totalTasks: number } | null
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

      <Field label="One thing (optional)">
        <input
          value={p.intention}
          onChange={e => p.setIntention(e.target.value)}
          placeholder="Phone in another room. Ship the auth refactor."
          style={{
            minHeight: 44, padding: '0 14px', borderRadius: 11,
            border: '1px solid var(--border-input)', background: 'var(--card-bg)',
            color: 'var(--ink)', ...T.body, fontSize: 14, outline: 'none',
          }}
        />
      </Field>

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

      <div style={{ display: 'flex', gap: SP.md }}>
        <button
          onClick={p.onTogglePause}
          style={{ flex: 1, minHeight: 44, borderRadius: 11, ...T.bodyStrong, fontSize: 14, background: 'transparent', border: '1px solid var(--border-ghost)', color: 'var(--text-strong)', cursor: 'pointer' }}
        >
          {p.paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={p.onDoneEarly}
          style={{ flex: 1, minHeight: 44, borderRadius: 11, ...T.bodyStrong, fontSize: 14, background: 'transparent', border: '1px solid var(--border-ghost)', color: 'var(--text-body)', cursor: 'pointer' }}
        >
          Done early
        </button>
      </div>
    </div>
  )

  const doneMode = p.doneSummary ? MODES[p.doneSummary.energy] : timingMode
  const doneView = (
    <div key="done" className="fr-anim-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.lg, padding: `${SP.lg}px 0`, textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 72, height: 72, display: 'grid', placeItems: 'center' }}>
        <span aria-hidden="true" style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `radial-gradient(circle, ${doneMode.cssVar} 0%, transparent 70%)`,
          animation: 'fr-bloom 700ms ease-out',
        }} />
        <span style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `color-mix(in srgb, ${doneMode.cssVar} 16%, transparent)`,
          display: 'grid', placeItems: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M7 14.5 L12 19 L21 9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: doneMode.cssVar }} />
          </svg>
        </span>
      </div>
      <div>
        <div style={{ ...T.subhead, fontSize: 18, color: 'var(--text-strong)' }}>Block complete</div>
        {p.doneSummary && (
          <div style={{ ...T.body, color: 'var(--text-body)', marginTop: SP.sm }}>
            {fmtMin(p.doneSummary.minutes)} of {doneMode.label}{p.doneSummary.projectName ? ` on ${p.doneSummary.projectName}` : ''}
            {p.doneSummary.totalTasks ? ` · ${p.doneSummary.tasksDone}/${p.doneSummary.totalTasks} tasks` : ''}
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
      {p.blockState === 'idle' ? idleView : p.blockState === 'timing' ? timingView : doneView}
    </Card>
  )
}

/* ===== Settings ===== */
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
              {items.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: SP.md,
                    padding: `${SP.md}px 0`,
                    borderTop: idx === 0 ? 'none' : '1px solid var(--border-soft)',
                  }}
                >
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
                      flex: 1, minWidth: 0,
                      minHeight: 44, borderRadius: 10,
                      border: '1px solid var(--border-input)', background: 'var(--surface)',
                      color: 'var(--ink)', ...T.body, padding: '0 12px', outline: 'none',
                    }}
                  />

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
              ))}
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
  const [musicTrackId, setMusicTrackId] = useState<TrackId | null>(null)
  const [doneSummary, setDoneSummary] = useState<FocusBlockProps['doneSummary']>(null)
  const lastEnergyRef = useRef<Energy>('high')
  const endsAtRef = useRef<number>(0)
  const remainingMsRef = useRef<number>(0)
  const sessionStartRef = useRef<number>(0)
  const pauseAccumRef = useRef<number>(0)
  const lastPauseAtRef = useRef<number | null>(null)
  const taskIdRef = useRef<number>(1)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)) } catch { /* ignore */ }
  }, [projects])

  useEffect(() => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)) } catch { /* ignore */ }
  }, [sessions])

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
        recordSession(true)
        setBlockState('done')
        return
      }
      setSecondsLeft(left)
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockState, paused])

  function recordSession(completed: boolean) {
    if (sessionStartRef.current === 0) return
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
      completed,
    }
    const sessionWithTasks: Session = tasks.length > 0
      ? { ...session, tasks: tasks.map(t => ({ text: t.text, done: t.done })) }
      : session
    setSessions(prev => [...prev, sessionWithTasks])
    setDoneSummary({
      energy: sessionEnergy,
      minutes: Math.max(1, Math.round(msToMin(durationMs))),
      projectName: project?.name ?? null,
      tasksDone: tasks.filter(t => t.done).length,
      totalTasks: tasks.length,
    })
    sessionStartRef.current = 0
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
    lastEnergyRef.current = energy
    setTasks([])
    setTaskDraft('')
    setDoneSummary(null)
    setBlockState('timing')
  }

  function togglePause() {
    setPaused(prev => {
      const now = Date.now()
      if (!prev) {
        remainingMsRef.current = Math.max(0, endsAtRef.current - now)
        lastPauseAtRef.current = now
      } else {
        endsAtRef.current = now + remainingMsRef.current
        if (lastPauseAtRef.current !== null) {
          pauseAccumRef.current += now - lastPauseAtRef.current
          lastPauseAtRef.current = null
        }
      }
      return !prev
    })
  }

  function doneEarly() {
    recordSession(false)
    setBlockState('done')
  }

  function resetAll() {
    setBlockState('idle')
    setProjectId(null)
    setIntention('')
    setSecondsLeft(0)
    setPaused(false)
    setTasks([])
    setTaskDraft('')
    setDoneSummary(null)
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

  function addTask() {
    const v = taskDraft.trim()
    if (!v) return
    const id = taskIdRef.current++
    setTasks(prev => [...prev, { id, text: v, done: false }])
    setTaskDraft('')
  }

  function toggleTask(id: number) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  function removeTask(id: number) {
    setTasks(prev => prev.filter(t => t.id !== id))
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

  function setMusic(id: TrackId) {
    setMusicTrackId(prev => prev === id ? null : id)
  }

  // ensure projectId stays valid when energy/time changes
  useEffect(() => {
    if (projectId === null) return
    const stillValid = projects.find(p => p.id === projectId && p.energy === energy && fitCount(p.avgBlock, time) >= 1)
    if (!stillValid) setProjectId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energy, time])

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: `${SP.xl}px ${SP.xl}px ${SP.huge}px` }}>
      <div className="fr-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.xxl, padding: '0 2px' }}>
        <button
          onClick={() => setScreen('home')}
          aria-label="Focus Router home"
          style={{ display: 'flex', alignItems: 'center', gap: SP.md, background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 20, color: 'var(--mode-high)' }}>◐</span>
          <span style={{ ...T.bodyStrong, fontSize: 15, letterSpacing: '0.01em', color: 'var(--text-strong)' }}>Focus Router</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm }}>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title="Toggle theme"
            style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid var(--border-ghost)', background: 'var(--card-bg)', color: 'var(--text-body)', fontSize: 15, cursor: 'pointer' }}
          >
            {theme === 'light' ? '◑' : '◐'}
          </button>
          <button
            onClick={() => setScreen(screen === 'settings' ? 'home' : 'settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: SP.sm,
              minHeight: 40, padding: '0 14px', borderRadius: 999,
              border: '1px solid var(--border-ghost)', background: 'var(--card-bg)',
              color: 'var(--text-strong)', ...T.bodyStrong, fontSize: 13, cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 14 }}>⚙</span> Projects
          </button>
        </div>
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
      ) : (
        <>
          <DailyNote />
          <StatStrip sessions={sessions} />
          <div className="fr-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.lg }}>
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
                onEasier={easier}
                onAddTask={addTask}
                onToggleTask={toggleTask}
                onRemoveTask={removeTask}
                lastEnergy={lastEnergyRef.current}
                doneSummary={doneSummary}
              />
              <MusicCard trackId={musicTrackId} onToggle={setMusic} />
            </div>
            <StatsSidebar sessions={sessions} />
          </div>
        </>
      )}
    </div>
  )
}

// PRIORITIES exported for parity with seed/persistence; referenced once to mark intent
void PRIORITIES
