import { Link } from 'react-router-dom'
import { Button, CoinPill } from '../components/ui'
import { Logo } from '../components/Logo'
import CrystalizedBall from '../components/CrystalizedBall'
import { useTheme } from '../state/ThemeContext'

const FEATURES = [
  {
    title: 'Build your routine',
    body: 'Morning, gym, study or wind-down. Add tasks and give every one a time you plan to do it.',
  },
  {
    title: 'Check in on time',
    body: 'Tick a task near its scheduled time to earn coins and +30 to +50 ELO. Every minute off the schedule costs 1 ELO.',
  },
  {
    title: 'Miss the window',
    body: 'Outside 20 minutes, every minute off costs 2 ELO instead. A task 30 minutes late loses 60 ELO. Late check-ins earn no coins.',
  },
  {
    title: 'Spend it on your profile',
    body: 'Colour themes from 2,000 coins, meme and image themes for 5,000, and your own uploaded profile picture for 100. Look the part.',
  },
  {
    title: 'Build a streak',
    body: 'Finish every task inside its time window and the whole day is perfect, with 200 bonus coins.',
  },
  {
    title: 'Climb the ladder',
    body: 'Consistent timing pushes you up six tiers. The ladder page holds your rank and standing.',
  },
]

export function LandingPage() {
  const { themeSlug, theme } = useTheme()
  const ballTheme = themeSlug === 'light' ? 'light' : 'dark'
  const ballColor = theme.vars['--accent'] ?? '#dcdcdc'

  return (
    <div className="app-shell">
      <div className="app-content">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="secondary" size="md">
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button size="md">Sign up</Button>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-2 text-center md:pt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-muted">
            DayGuide · routines, coins and a timing ladder
          </p>

          <div className="relative mx-auto mt-2 h-[320px] w-full max-w-2xl sm:h-[430px]">
            <CrystalizedBall
              preset="eclipse"
              color={ballColor}
              theme={ballTheme}
              size={0.86}
              crackle={0.5}
              fill={0.5}
              interactive
              hoverStrength={0.7}
              strands={4}
              flares={0.4}
              glow={0.7}
              sparks={0.35}
              particleCount={14000}
              motion="drift"
              depth={0.7}
              haze={0.5}
              dustSpeed={0.8}
            />
          </div>

          <h1 className="relative z-10 mx-auto -mt-10 max-w-4xl text-balance text-4xl leading-[1.05] sm:-mt-14 sm:text-6xl">
            Turn your daily routine into competitiveness
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
            Build a checklist you actually finish. Give every task a time, check in near that time to earn coins and ELO,
            and climb the ladder through consistency.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                Sign up — it is free
              </Button>
            </Link>
            <Link to="/login" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Log in
              </Button>
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
            <CoinPill coins={200} />
            <span>for every perfect routine</span>
            <span aria-hidden>·</span>
            <span className="font-semibold">+30 to +50 ELO</span>
            <span aria-hidden>·</span>
            <span>on-time check-ins</span>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="mb-6 text-center text-3xl sm:text-4xl">Everything you get on day one</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <article key={feature.title} className="glass p-5">
                <span className="text-xs font-bold uppercase tracking-[0.24em] text-muted">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 text-base font-bold">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="glass p-6 sm:p-9">
            <h2 className="text-3xl sm:text-4xl">How the timing ladder works</h2>
            <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { step: '01', title: 'Build your routine', body: 'Add tasks and the exact time you plan to do each one.' },
                { step: '02', title: 'Check in', body: 'Tap a task when you finish it. Your local time is compared with its schedule.' },
                { step: '03', title: 'Earn or lose ELO', body: 'Inside 20 minutes earns +30 to +50. Outside it, each minute off costs 2 ELO (30 minutes late is -60).' },
                { step: '04', title: 'Climb the ladder', body: 'Keep every task on time for a perfect day and 200 bonus coins.' },
              ].map((item) => (
                <li key={item.step} className="glass-2 p-4">
                  <span className="text-xs font-bold tracking-[0.24em] text-muted">{item.step}</span>
                  <h3 className="mt-1.5 text-sm font-bold">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-3xl px-4 pb-16 pt-6 text-center">
          <h2 className="text-3xl sm:text-4xl">Your routine is already happening. Get paid for it.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            Free to start, 100 welcome coins in your pocket, and a blank routine builder waiting for your first task.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                Create my account
              </Button>
            </Link>
            <Link to="/login" className="w-full sm:w-auto">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                I already have one
              </Button>
            </Link>
          </div>
        </section>

        <footer className="px-4 py-6 text-center text-xs text-muted">
          DayGuide · built with React, FastAPI and Supabase
        </footer>
      </div>
    </div>
  )
}
