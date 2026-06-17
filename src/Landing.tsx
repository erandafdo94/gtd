import { Helmet } from 'react-helmet-async'
import type { CSSProperties } from 'react'

const SITE_URL = 'https://focusrouter.com'
const TITLE = 'Focus Router — a calm console for getting things done'
const DESCRIPTION =
  'Focus Router is a GTD-style task console with project lanes, a today list capped at five, a focus timer with energy-aware sessions, and a built-in habit tracker. Local-first, dark-only.'

const wrap: CSSProperties = {
  maxWidth: 1080,
  margin: '0 auto',
  padding: '0 24px',
  position: 'relative',
  zIndex: 1,
}
const kicker: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'var(--dim)',
}
const h1: CSSProperties = {
  fontSize: 'clamp(40px, 6vw, 64px)',
  lineHeight: 1.05,
  letterSpacing: '-0.025em',
  fontWeight: 700,
  margin: '20px 0 18px',
  color: 'var(--text)',
}
const lede: CSSProperties = {
  fontSize: 18,
  lineHeight: 1.55,
  color: 'var(--text-2)',
  maxWidth: 640,
  margin: '0 0 28px',
}
const ctaRow: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' }
const ctaPrimary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 22px',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  textDecoration: 'none',
  borderRadius: 'var(--r-ctrl)',
  fontWeight: 600,
  fontSize: 15,
  boxShadow: '0 8px 24px -10px var(--accent-glow)',
}
const ctaGhost: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 22px',
  background: 'transparent',
  color: 'var(--text)',
  textDecoration: 'none',
  borderRadius: 'var(--r-ctrl)',
  fontWeight: 600,
  fontSize: 15,
  border: '1px solid var(--line)',
}
const section: CSSProperties = { padding: '64px 0', borderTop: '1px solid var(--hair)' }
const grid3: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
}
const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--hair)',
  borderRadius: 'var(--r-card)',
  padding: 22,
}
const cardTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.005em',
  margin: '8px 0 6px',
  color: 'var(--text)',
}
const cardBody: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: 'var(--text-2)',
  margin: 0,
}
const cardKicker: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.01em',
  color: 'var(--accent)',
}
const sectionH: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: '0 0 24px',
  color: 'var(--text)',
}
const faqItem: CSSProperties = {
  borderTop: '1px solid var(--hair)',
  padding: '20px 0',
}
const faqQ: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  margin: '0 0 6px',
  color: 'var(--text)',
}
const faqA: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: 'var(--text-2)',
  margin: 0,
}
const footer: CSSProperties = {
  borderTop: '1px solid var(--hair)',
  padding: '32px 0 48px',
  fontSize: 13,
  color: 'var(--faint)',
  display: 'flex',
  gap: 18,
  flexWrap: 'wrap',
  justifyContent: 'space-between',
}

const FEATURES = [
  {
    kicker: 'projects',
    title: 'Five lanes, two ongoing',
    body:
      'GTD-style project status — Ongoing, Maintenance, Up next, Backlog, Someday. The Ongoing lane is capped at two, so you actually finish what you start.',
  },
  {
    kicker: 'today',
    title: 'Pick five. That’s the day.',
    body:
      'Each morning, choose up to five tasks for today. The dashboard surfaces them with the energy level they need so you match the right task to the right hour.',
  },
  {
    kicker: 'timer',
    title: 'Focus sessions with an outcome',
    body:
      'A pomodoro-style timer that ends with a one-tap outcome — complete, partial, distracted — so your stats reflect the truth, not just minutes elapsed.',
  },
  {
    kicker: 'habits',
    title: 'Daily and weekly streaks',
    body:
      'A habit tracker with consecutive-day streaks for daily routines and per-week targets for the things you do three or four times a week.',
  },
  {
    kicker: 'wind-down',
    title: 'A bedtime that nudges back',
    body:
      'Set a bedtime and a wind-down lead time. The dashboard gently reminds you to wrap up so the productivity tool stops being the reason you’re still up.',
  },
  {
    kicker: 'extras',
    title: 'Word, tip, music, ticker',
    body:
      'Optional widgets: a word of the day, a research-backed learning tip, a focus-music station, and a tiny BTC ticker. Toggle off anything you don’t want.',
  },
]

const FAQS = [
  {
    q: 'Do I need an account?',
    a: 'No. Focus Router is local-first — your tasks, projects, and habits live in your browser. Optional sign-in syncs across devices when the backend is live.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'Not yet. The web app is responsive and works on mobile browsers; a native wrapper is on the roadmap once the backend ships.',
  },
  {
    q: 'How is this different from Todoist or Things?',
    a: 'Focus Router is opinionated about flow, not just storage. The Ongoing-project cap, the five-task daily limit, the energy-aware suggestions, and the timer-with-outcome loop all push you to finish work — not just file it.',
  },
  {
    q: 'What’s with the name?',
    a: 'You don’t need another list. You need something that decides what you should do next. That’s the routing part.',
  },
]

export default function Landing() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Focus Router',
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Web',
    description: DESCRIPTION,
    url: SITE_URL,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }

  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={SITE_URL + '/'} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL + '/'} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={SITE_URL + '/og.png'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={SITE_URL + '/og.png'} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <header style={{ ...wrap, paddingTop: 28, paddingBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
          Focus Router
        </span>
        <a href="/app" style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          Open app &rarr;
        </a>
      </header>

      <section style={{ ...wrap, padding: '72px 24px 56px' }}>
        <div style={kicker}>GTD &middot; Focus &middot; Habits</div>
        <h1 style={h1}>
          A calm console for getting things done.
        </h1>
        <p style={lede}>
          Focus Router is a dark, opinionated task console. Five project lanes, two ongoing at a time,
          five tasks per day, and a timer that ends with an honest outcome. Built so you actually finish work
          instead of just organising it.
        </p>
        <div style={ctaRow}>
          <a href="/app" style={ctaPrimary}>Open the app</a>
          <a href="#features" style={ctaGhost}>See what it does</a>
        </div>
      </section>

      <section id="features" style={{ ...wrap, ...section }}>
        <h2 style={sectionH}>What’s inside</h2>
        <div style={grid3}>
          {FEATURES.map((f) => (
            <div key={f.kicker} style={card}>
              <div style={cardKicker}>{f.kicker}</div>
              <h3 style={cardTitle}>{f.title}</h3>
              <p style={cardBody}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...wrap, ...section }}>
        <h2 style={sectionH}>Questions</h2>
        <div>
          {FAQS.map((f) => (
            <div key={f.q} style={faqItem}>
              <p style={faqQ}>{f.q}</p>
              <p style={faqA}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...wrap, ...section, textAlign: 'center' as const }}>
        <h2 style={sectionH}>Pick five. Start the timer.</h2>
        <p style={{ ...lede, margin: '0 auto 24px' }}>
          The app is free, runs in your browser, and starts working the moment you open it.
        </p>
        <a href="/app" style={ctaPrimary}>Open Focus Router</a>
      </section>

      <footer style={{ ...wrap, ...footer }}>
        <span>&copy; Focus Router</span>
        <span>
          <a href="/app" style={{ color: 'inherit' }}>Open app</a>
        </span>
      </footer>
    </>
  )
}
