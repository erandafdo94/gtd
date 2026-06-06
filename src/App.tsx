import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Energy = 'high' | 'med' | 'low'
type Priority = 1 | 2 | 3
type TimeKey = 'quick' | 'chunk' | 'deep'
type Screen = 'checkin' | 'call' | 'timer' | 'done' | 'settings'
type Project = { id: number; name: string; energy: Energy; priority: Priority }

const STORAGE_KEY = 'focus_projects'
const LEGACY_KEY = 'focus_areas'

const TIME_MIN: Record<TimeKey, number> = { quick: 15, chunk: 40, deep: 55 }
const ENERGY_DOWN: Record<Energy, Energy> = { high: 'med', med: 'low', low: 'low' }
const MODE_COLOR: Record<Energy, string> = { high: '#d97757', med: '#6a7fb5', low: '#5b8c7a' }
const MODE_META: Record<Energy, { label: string; tip: string }> = {
  high: { label: 'Deep Work', tip: 'Phone in another room. One tab. Go.' },
  med:  { label: 'Steady',    tip: 'Close email. Pick one goal.' },
  low:  { label: 'Knock-outs', tip: 'Just start. Tiny wins count.' },
}

const SEED: Project[] = [
  { id: 1, name: 'Main project',        energy: 'high', priority: 1 },
  { id: 2, name: 'Side build',          energy: 'high', priority: 2 },
  { id: 3, name: 'Learning / courses',  energy: 'med',  priority: 1 },
  { id: 4, name: 'Reading & notes',     energy: 'med',  priority: 2 },
  { id: 5, name: 'Admin & inbox',       energy: 'low',  priority: 2 },
  { id: 6, name: 'Quick errands',       energy: 'low',  priority: 3 },
]

const TIME_OPTIONS: { key: TimeKey; label: string }[] = [
  { key: 'quick', label: '15 min' },
  { key: 'chunk', label: '30–45' },
  { key: 'deep',  label: '60+'    },
]
const ENERGY_ORDER: Energy[] = ['low', 'med', 'high']
const PRIORITIES: Priority[] = [1, 2, 3]

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
      }))
    return cleaned.length ? cleaned : SEED
  } catch {
    return SEED
  }
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
}

function playChime() {
  try {
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext
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
  } catch {
    // never throw
  }
}

const styles = {
  page: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '24px 24px',
    paddingTop: 'max(24px, env(safe-area-inset-top, 24px))',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
    minHeight: 440,
    display: 'flex',
    flexDirection: 'column',
    color: '#2a2a28',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  } as CSSProperties,
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    minHeight: 44,
  } as CSSProperties,
  navBtn: {
    background: 'transparent',
    border: 'none',
    color: '#7a7a76',
    fontSize: 20,
    width: 44,
    height: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    borderRadius: 22,
  } as CSSProperties,
  projectsBtn: {
    background: '#ffffff',
    border: '1.5px solid #e0ded7',
    borderRadius: 22,
    padding: '0 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#5a5a56',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    lineHeight: 1,
    minHeight: 44,
  } as CSSProperties,
  kicker: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#b0aea6',
    marginBottom: 12,
  } as CSSProperties,
  h: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.2,
    margin: '0 0 24px 0',
  } as CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#9a9a95',
    marginBottom: 10,
    display: 'block',
  } as CSSProperties,
  row: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20,
  } as CSSProperties,
  chip: (active: boolean, activeColor: string): CSSProperties => ({
    flex: '1 1 0',
    minWidth: 70,
    padding: '14px 6px',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 12,
    border: `2px solid ${active ? activeColor : '#e6e4dd'}`,
    background: active ? activeColor : '#ffffff',
    color: active ? '#ffffff' : '#6a6a66',
    textAlign: 'center',
    transition: 'all 0.12s',
  }),
  projectChip: (active: boolean, activeColor: string): CSSProperties => ({
    padding: '12px 16px',
    minHeight: 44,
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 22,
    border: `2px solid ${active ? activeColor : '#e6e4dd'}`,
    background: active ? activeColor : '#ffffff',
    color: active ? '#ffffff' : '#5a5a56',
    transition: 'all 0.12s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  }),
  priorityTag: (active: boolean, color: string): CSSProperties => ({
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.5,
    padding: '2px 6px',
    borderRadius: 6,
    background: active ? 'rgba(255,255,255,0.25)' : color,
    color: '#ffffff',
    lineHeight: 1,
  }),
  primary: (color: string | null, disabled: boolean): CSSProperties => ({
    width: '100%',
    padding: '15px 0',
    fontSize: 16,
    fontWeight: 700,
    borderRadius: 12,
    border: 'none',
    color: '#ffffff',
    background: disabled ? '#dcdad3' : (color ?? '#2a2a28'),
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: 'auto',
  }),
  ghost: {
    width: '100%',
    padding: '12px 0',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 12,
    border: '1.5px solid #e0ded7',
    background: 'transparent',
    color: '#7a7a76',
  } as CSSProperties,
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: 12,
    border: '1.5px solid #ddd',
    background: '#ffffff',
    outline: 'none',
  } as CSSProperties,
  card: (color: string): CSSProperties => ({
    background: '#faf9f5',
    border: `2px solid ${color}`,
    borderRadius: 14,
    padding: '16px 18px',
    marginBottom: 22,
  }),
  cardTop: (color: string): CSSProperties => ({
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color,
    marginBottom: 6,
  }),
  cardTip: {
    color: '#7a7a76',
    fontSize: 14,
    lineHeight: 1.4,
  } as CSSProperties,
  muted: {
    color: '#b0aea6',
    fontSize: 14,
    marginBottom: 20,
  } as CSSProperties,
  projectRow: {
    background: '#faf9f5',
    border: '1px solid #e8e6df',
    borderRadius: 10,
    padding: '10px 12px',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,
  projectInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: 500,
    color: '#2a2a28',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: 0,
    minWidth: 0,
  } as CSSProperties,
  priorityCycle: (color: string): CSSProperties => ({
    background: color,
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    minWidth: 44,
    height: 36,
    padding: '0 10px',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.5,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#c0392b',
    fontSize: 18,
    fontWeight: 700,
    width: 44,
    height: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    borderRadius: 22,
    flexShrink: 0,
  } as CSSProperties,
}

function priorityShade(p: Priority, base: string): string {
  if (p === 1) return base
  if (p === 2) return '#5a5a56'
  return '#7a7a76'
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [screen, setScreen] = useState<Screen>('checkin')
  const [energy, setEnergy] = useState<Energy | null>(null)
  const [time, setTime] = useState<TimeKey | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [intention, setIntention] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [paused, setPaused] = useState(false)
  const lastEnergyRef = useRef<Energy | null>(null)
  const endsAtRef = useRef<number>(0)
  const remainingMsRef = useRef<number>(0)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
    } catch {
      // ignore quota errors
    }
  }, [projects])

  useEffect(() => {
    if (screen !== 'timer' || paused) return
    const tick = () => {
      const left = Math.ceil((endsAtRef.current - Date.now()) / 1000)
      if (left <= 0) {
        setSecondsLeft(0)
        playChime()
        setScreen('done')
        return
      }
      setSecondsLeft(left)
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [screen, paused])

  function resetAll() {
    setScreen('checkin')
    setEnergy(null)
    setTime(null)
    setProjectId(null)
    setIntention('')
    setSecondsLeft(0)
    setPaused(false)
  }

  function startTimer() {
    if (!time) return
    const totalMs = TIME_MIN[time] * 60 * 1000
    endsAtRef.current = Date.now() + totalMs
    remainingMsRef.current = totalMs
    setSecondsLeft(Math.ceil(totalMs / 1000))
    setPaused(false)
    lastEnergyRef.current = energy
    setScreen('timer')
  }

  function togglePause() {
    setPaused(p => {
      if (!p) {
        remainingMsRef.current = Math.max(0, endsAtRef.current - Date.now())
      } else {
        endsAtRef.current = Date.now() + remainingMsRef.current
      }
      return !p
    })
  }

  function easier() {
    if (!energy) return
    const next = ENERGY_DOWN[energy]
    setEnergy(next)
    setProjectId(null)
  }

  function cyclePriority(id: number) {
    setProjects(prev => prev.map(p =>
      p.id === id ? { ...p, priority: (p.priority === 3 ? 1 : (p.priority + 1)) as Priority } : p
    ))
  }

  if (screen === 'checkin') return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <span />
        <button style={styles.projectsBtn} onClick={() => setScreen('settings')}>
          <span style={{ fontSize: 14 }}>⚙</span> Projects
        </button>
      </div>
      <div style={styles.kicker}>SIT DOWN · CHECK IN</div>
      <h1 style={styles.h}>How are you right now?</h1>

      <span style={styles.label}>Energy</span>
      <div style={styles.row}>
        {ENERGY_ORDER.map(e => (
          <button
            key={e}
            style={styles.chip(energy === e, MODE_COLOR[e])}
            onClick={() => setEnergy(e)}
          >
            {e === 'low' ? 'Low' : e === 'med' ? 'Med' : 'High'}
          </button>
        ))}
      </div>

      <span style={styles.label}>Time you've got</span>
      <div style={styles.row}>
        {TIME_OPTIONS.map(t => (
          <button
            key={t.key}
            style={styles.chip(time === t.key, '#2a2a28')}
            onClick={() => setTime(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        style={styles.primary(energy ? MODE_COLOR[energy] : null, !(energy && time))}
        disabled={!(energy && time)}
        onClick={() => setScreen('call')}
      >
        Route me →
      </button>
    </div>
  )

  if (screen === 'call' && energy && time) {
    const mode = MODE_META[energy]
    const color = MODE_COLOR[energy]
    const mins = TIME_MIN[time]
    const matching = projects
      .filter(p => p.energy === energy)
      .sort((a, b) => a.priority - b.priority || a.id - b.id)

    return (
      <div style={styles.page}>
        <div style={styles.topBar}>
          <button style={styles.navBtn} aria-label="Back" onClick={() => { setProjectId(null); setIntention(''); setScreen('checkin') }}>←</button>
          <span />
        </div>
        <div style={styles.kicker}>YOUR CALL</div>

        <div style={styles.card(color)}>
          <div style={styles.cardTop(color)}>{mode.label.toUpperCase()} · {mins} MIN</div>
          <div style={styles.cardTip}>{mode.tip}</div>
        </div>

        <span style={styles.label}>Pick a project</span>
        {matching.length > 0 ? (
          <div style={styles.row}>
            {matching.map(p => {
              const active = projectId === p.id
              return (
                <button
                  key={p.id}
                  style={styles.projectChip(active, color)}
                  onClick={() => setProjectId(p.id)}
                >
                  <span style={styles.priorityTag(active, priorityShade(p.priority, color))}>
                    P{p.priority}
                  </span>
                  {p.name}
                </button>
              )
            })}
          </div>
        ) : (
          <div style={styles.muted}>No projects for this energy yet — add some in Projects, or just start.</div>
        )}

        <span style={styles.label}>One thing (optional)</span>
        <input
          style={{ ...styles.input, marginBottom: 16 }}
          placeholder="What's the single win?"
          value={intention}
          onChange={e => setIntention(e.target.value)}
        />

        <button style={{ ...styles.ghost, marginBottom: 12 }} onClick={easier}>
          Not feeling it → something easier
        </button>

        <button style={styles.primary(color, false)} onClick={startTimer}>
          Start {mins} min →
        </button>
      </div>
    )
  }

  if (screen === 'timer') {
    const e = lastEnergyRef.current ?? energy ?? 'med'
    const mode = MODE_META[e]
    const color = MODE_COLOR[e]
    const project = projects.find(p => p.id === projectId)

    return (
      <div style={{ ...styles.page, alignItems: 'stretch', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ ...styles.kicker, color, marginTop: 24 }}>
          {mode.label.toUpperCase()}{project ? ` · ${project.name}` : ''}
        </div>

        {intention.trim() && (
          <div style={{ fontSize: 18, fontWeight: 600, color: '#3a3a37', marginBottom: 20 }}>
            {intention}
          </div>
        )}

        <div style={{
          fontSize: 72,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color,
          margin: '24px 0 32px',
          lineHeight: 1,
        }}>
          {fmt(secondsLeft)}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, justifyContent: 'center' }}>
          <button
            style={styles.chip(paused, color)}
            onClick={togglePause}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            style={styles.chip(false, color)}
            onClick={() => setScreen('done')}
          >
            Done early
          </button>
        </div>

        <button style={{ ...styles.ghost, marginTop: 'auto' }} onClick={resetAll}>
          Reset
        </button>
      </div>
    )
  }

  if (screen === 'done') {
    const e = lastEnergyRef.current ?? 'med'
    const color = MODE_COLOR[e]
    return (
      <div style={{ ...styles.page, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 40, color, marginTop: 'auto' }}>✓</div>
        <h1 style={{ ...styles.h, marginTop: 16, marginBottom: 8 }}>Block done.</h1>
        <div style={{ color: '#7a7a76', fontSize: 15, marginBottom: 32 }}>
          Stand up, breathe, drink water.
        </div>
        <button style={styles.primary(color, false)} onClick={resetAll}>
          Go again
        </button>
      </div>
    )
  }

  // settings
  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <button style={styles.navBtn} aria-label="Back" onClick={() => setScreen('checkin')}>←</button>
        <span />
      </div>
      <div style={styles.kicker}>YOUR PROJECTS</div>
      <h1 style={styles.h}>Projects</h1>

      {(['high', 'med', 'low'] as Energy[]).map(level => {
        const color = MODE_COLOR[level]
        const list = projects
          .filter(p => p.energy === level)
          .sort((a, b) => a.priority - b.priority || a.id - b.id)
        return (
          <div key={level} style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color,
              marginBottom: 10,
            }}>
              {level} energy · {MODE_META[level].label}
            </div>
            {list.length === 0 ? (
              <div style={{ color: '#b0aea6', fontSize: 14, marginBottom: 8 }}>none yet</div>
            ) : list.map(p => (
              <div key={p.id} style={styles.projectRow}>
                <button
                  style={styles.priorityCycle(priorityShade(p.priority, color))}
                  aria-label={`Priority ${p.priority}, click to cycle`}
                  title="Click to cycle priority"
                  onClick={() => cyclePriority(p.id)}
                >
                  P{p.priority}
                </button>
                <input
                  style={styles.projectInput}
                  value={p.name}
                  onChange={e => {
                    const v = e.target.value
                    setProjects(prev => prev.map(x => x.id === p.id ? { ...x, name: v } : x))
                  }}
                />
                <button
                  style={styles.removeBtn}
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setProjects(prev => prev.filter(x => x.id !== p.id))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )
      })}

      <AddProject onAdd={(name, energy, priority) => {
        const nextId = projects.reduce((m, p) => Math.max(m, p.id), 0) + 1
        setProjects(prev => [...prev, { id: nextId, name, energy, priority }])
      }} />

      <button
        style={{ ...styles.primary('#2a2a28', false), marginTop: 24 }}
        onClick={() => setScreen('checkin')}
      >
        Done
      </button>
    </div>
  )
}

function AddProject({ onAdd }: { onAdd: (name: string, energy: Energy, priority: Priority) => void }) {
  const [name, setName] = useState('')
  const [energy, setEnergy] = useState<Energy | null>(null)
  const [priority, setPriority] = useState<Priority>(2)

  function submit() {
    const trimmed = name.trim()
    if (!trimmed || !energy) return
    onAdd(trimmed, energy, priority)
    setName('')
    setEnergy(null)
    setPriority(2)
  }

  const ready = !!(name.trim() && energy)

  return (
    <div style={{ marginTop: 8 }}>
      <span style={styles.label}>Add a project</span>
      <input
        style={{ ...styles.input, marginBottom: 12 }}
        placeholder="Client website"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
      />
      <span style={styles.label}>Energy</span>
      <div style={styles.row}>
        {ENERGY_ORDER.map(lvl => (
          <button
            key={lvl}
            style={styles.chip(energy === lvl, MODE_COLOR[lvl])}
            onClick={() => setEnergy(lvl)}
          >
            {lvl === 'low' ? 'Low' : lvl === 'med' ? 'Med' : 'High'}
          </button>
        ))}
      </div>
      <span style={styles.label}>Priority</span>
      <div style={{ ...styles.row, marginBottom: 14 }}>
        {PRIORITIES.map(p => (
          <button
            key={p}
            style={styles.chip(priority === p, '#2a2a28')}
            onClick={() => setPriority(p)}
          >
            P{p}
          </button>
        ))}
      </div>
      <button
        style={{
          ...styles.ghost,
          opacity: ready ? 1 : 0.5,
          cursor: ready ? 'pointer' : 'not-allowed',
        }}
        disabled={!ready}
        onClick={submit}
      >
        + Add project
      </button>
    </div>
  )
}
