import { Link } from 'react-router-dom'
import { Button, CoinPill } from '../components/ui'
import { Logo } from '../components/Logo'
import CrystalizedBall from '../components/CrystalizedBall'
import { useTheme } from '../state/ThemeContext'

const FEATURES = [
  {
    title: 'Build your routine',
    body: 'Morning, gym, study or wind-down. Add tasks, mark the ones that need photo proof, and tick them off daily.',
  },
  {
    title: 'Get paid in coins',
    body: 'Every task pays coins. Finishing a whole routine perfectly pays 200 coins and +50 ELO, streaks pay bonuses.',
  },
  {
    title: 'Spend it on your profile',
    body: 'Colour themes from 10,000 coins, meme themes for 20,000, new profile pictures from 600. Look the part.',
  },
  {
    title: 'Photo verified',
    body: 'Snap the finished task and our verifier checks it really matches what you claimed. Cheating does not pay.',
  },
  {
    title: 'Race real people',
    body: 'Queue for a ranked race on the same checklist. First to get every item verified takes the ELO.',
  },
  {
    title: 'Climb the ladder',
    body: 'Every perfect routine and race win pushes you further up the global ladder. The ladder page holds your standing.',
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
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-muted">Routines, coins and a ranked ladder</p>

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
            Build a checklist you actually finish. Earn coins for every task, unlock themes and profile pictures, and
            race other players to the top of the ladder with photo proof for every claim.
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
            <span className="font-semibold">+50 ELO</span>
            <span aria-hidden>·</span>
            <span>Photo proof on every claim</span>
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
            <h2 className="text-3xl sm:text-4xl">How a ranked race works</h2>
            <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { step: '01', title: 'Queue up', body: 'Pick the routine you want to race with and enter ranked.' },
                { step: '02', title: 'Get matched', body: 'We pair you with an opponent close to your ELO.' },
                { step: '03', title: 'Prove every task', body: 'Photo each item. The verifier accepts or rejects it.' },
                { step: '04', title: 'Take the ELO', body: 'First to clear the list wins +50 ELO and 200 coins.' },
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
            Free to start, 100 welcome coins in your pocket, and a starter routine ready to go.
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
          Routinery · built with React, FastAPI and Supabase
        </footer>
      </div>
    </div>
  )
}
