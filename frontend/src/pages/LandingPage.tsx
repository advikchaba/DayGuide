import { Link } from 'react-router-dom'
import { Badge, Button, CoinPill } from '../components/ui'
import { Logo } from '../components/Logo'
import { RANK_TIERS } from '../lib/types'

const FEATURES = [
  {
    icon: '✅',
    title: 'Build your routine',
    body: 'Morning, gym, study or wind-down. Add tasks, mark the ones that need photo proof, and tick them off daily.',
  },
  {
    icon: '🪙',
    title: 'Get paid in coins',
    body: 'Every task pays coins. Finishing a whole routine perfectly pays 200 coins and +50 ELO, streaks pay bonuses.',
  },
  {
    icon: '🛍️',
    title: 'Spend it on your profile',
    body: 'Colour themes from 10,000 coins, meme themes for 20,000, new profile pictures from 600. Look the part.',
  },
  {
    icon: '📸',
    title: 'Photo verified',
    body: 'Snap the finished task and our verifier checks it really matches what you claimed. Cheating does not pay.',
  },
  {
    icon: '⚔️',
    title: 'Race real people',
    body: 'Queue for a ranked race on the same checklist. First to get every item verified takes the ELO.',
  },
  {
    icon: '🏆',
    title: 'Climb six tiers',
    body: 'Copper to Ruby. Every perfect routine and race win pushes you further up the global ladder.',
  },
]

export function LandingPage() {
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
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-6 text-center md:pt-14">
          <Badge tone="accent" className="mb-5">
            🔥 Routines, coins and a ranked ladder
          </Badge>

          <h1 className="mx-auto max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Turn your daily routine into <span className="gradient-text">competitiveness</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
            Build a checklist you actually finish. Earn coins for every task, unlock themes and profile pictures, and
            race other players to the top of the ladder — with photo proof for every claim.
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
            <span>Copper → Ruby</span>
          </div>

          {/* Rank ladder */}
          <div className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {RANK_TIERS.map((tier) => (
              <div
                key={tier.name}
                className="glass-solid animate-fade-up px-3 py-4 text-center"
                style={{ borderColor: `${tier.color}44` }}
              >
                <span
                  className="mx-auto mb-2 block h-8 w-8 rounded-full"
                  style={{ background: `radial-gradient(circle at 30% 30%, ${tier.color}, transparent 70%)`, border: `2px solid ${tier.color}` }}
                  aria-hidden
                />
                <p className="text-sm font-bold" style={{ color: tier.color }}>
                  {tier.name}
                </p>
                <p className="text-[11px] text-muted">
                  {tier.min_elo}–{tier.max_elo} ELO
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="mb-6 text-center text-2xl font-bold sm:text-3xl">Everything you get on day one</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="glass-solid animate-fade-up p-5">
                <span className="text-2xl" aria-hidden>
                  {feature.icon}
                </span>
                <h3 className="mt-3 text-base font-bold">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="glass overflow-hidden p-6 sm:p-9">
            <h2 className="text-2xl font-bold sm:text-3xl">How a ranked race works</h2>
            <ol className="mt-6 grid gap-5 sm:grid-cols-4">
              {[
                { step: '01', title: 'Queue up', body: 'Pick the routine you want to race with and enter ranked.' },
                { step: '02', title: 'Get matched', body: 'We pair you with an opponent close to your ELO.' },
                { step: '03', title: 'Prove every task', body: 'Photo each item. The verifier accepts or rejects it.' },
                { step: '04', title: 'Take the ELO', body: 'First to clear the list wins +50 ELO and 200 coins.' },
              ].map((item) => (
                <li key={item.step} className="glass-2 p-4">
                  <span className="text-xs font-black tracking-widest text-accent">{item.step}</span>
                  <h3 className="mt-1.5 text-sm font-bold">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-3xl px-4 pb-16 pt-6 text-center">
          <h2 className="text-3xl font-black tracking-tight">Your routine is already happening. Get paid for it.</h2>
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

        <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
          Routinery · built with React, FastAPI and Supabase
        </footer>
      </div>
    </div>
  )
}
