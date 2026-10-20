/** Shared API types — mirrors the FastAPI response models. */

export interface RankInfo {
  name: string
  min_elo: number
  max_elo: number
  color: string
  progress: number
  elo_to_next: number
}

export interface Profile {
  id: string
  email: string
  username: string | null
  username_changes: number
  username_change_cost: number
  coins: number
  elo: number
  rank: RankInfo
  avatar_slug: string
  theme_slug: string
  streak: number
  best_streak: number
  routines_completed: number
  tasks_completed: number
  matches_won: number
  matches_played: number
  last_perfect_on: string | null
  created_at: string
}

export interface Task {
  id: number
  title: string
  note: string | null
  requires_proof: boolean
  coin_value: number
  position: number
  completed_today: boolean
  proof_status: string | null
}

export interface Routine {
  id: number
  name: string
  emoji: string
  created_at: string
  tasks: Task[]
  total: number
  done: number
  percent: number
  perfect_today: boolean
}

export interface Reward {
  coins: number
  elo: number
  base_coins: number
  perfect_coins: number
  perfect_elo: number
  perfect: boolean
  streak: number
  rank_name: string
  rank_progress: number
  messages: string[]
  new_balance: number
  new_elo: number
}

export interface TaskCompleteResponse {
  task_id: number
  completed: boolean
  routine: Routine
  reward: Reward
}

export interface ShopItem {
  slug: string
  name: string
  kind: 'theme' | 'avatar'
  description: string
  price: number
  rarity: 'common' | 'rare' | 'epic'
  is_free: boolean
  meta: {
    kind?: 'solid' | 'image'
    accent?: string
    accent2?: string
    emoji?: string
    image?: string
    mode?: 'dark' | 'light'
  }
  owned: boolean
  equipped: boolean
}

export interface ShopPayload {
  items: ShopItem[]
  coins: number
}

export interface MatchPlayer {
  user_id: string
  username: string | null
  avatar_slug: string
  rank_name: string
  elo: number
  progress: number
  total: number
  finished: boolean
  is_you: boolean
  elo_delta: number
  coins_won: number
}

export interface MatchTask {
  id: number
  title: string
  position: number
  approved: boolean
  proof_status: string | null
}

export interface Match {
  id: number
  code: string
  status: 'waiting' | 'active' | 'finished' | 'cancelled'
  routine_name: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  winner_id: string | null
  tasks: MatchTask[]
  players: MatchPlayer[]
  you_finished: boolean
  you_won: boolean
}

export interface Proof {
  id: number
  status: 'pending' | 'approved' | 'rejected'
  confidence: number
  reason: string
  reviewer: string
  claimed: string
  image_url: string
  coins_awarded: number
  created_at: string
  user_id?: string
  username?: string
}

export interface ProofVerification {
  proof: Proof
  approved: boolean
  coins_awarded: number
  elo_awarded: number
  task_id?: number
  match_id?: number
  reward: Reward | null
  routine: Routine | null
  match: Match | null
}

export interface LeaderboardEntry {
  position: number
  user_id: string
  username: string | null
  avatar_slug: string
  elo: number
  rank_name: string
  rank_color: string
  coins: number
  matches_won: number
  streak: number
  is_you: boolean
}

export interface Leaderboard {
  entries: LeaderboardEntry[]
  you: LeaderboardEntry | null
  total_players: number
}

export interface LedgerEntry {
  id: number
  delta: number
  elo_delta: number
  reason: string
  created_at: string
}

export const RANK_TIERS: RankInfo[] = [
  { name: 'Copper', min_elo: 100, max_elo: 500, color: '#B87333', progress: 0, elo_to_next: 0 },
  { name: 'Bronze', min_elo: 500, max_elo: 800, color: '#8C5A2B', progress: 0, elo_to_next: 0 },
  { name: 'Silver', min_elo: 800, max_elo: 1200, color: '#BFC5CC', progress: 0, elo_to_next: 0 },
  { name: 'Gold', min_elo: 1200, max_elo: 1600, color: '#E0B020', progress: 0, elo_to_next: 0 },
  { name: 'Platinum', min_elo: 1600, max_elo: 2000, color: '#2C7A7B', progress: 0, elo_to_next: 0 },
  { name: 'Ruby', min_elo: 2000, max_elo: 2400, color: '#C41E3A', progress: 0, elo_to_next: 0 },
]
