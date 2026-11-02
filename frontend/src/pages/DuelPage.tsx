import { useCallback, useEffect, useState } from 'react'
import { Avatar, Button, Card, EmptyState, Field, Modal, SectionTitle, Spinner } from '../components/ui'
import { api, ApiError } from '../lib/api'
import type { Friend, FriendRequest, FriendSearchResult, CommonRoutine, Duel } from '../lib/types'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'

export function DuelPage() {
  const { profile } = useAuth()
  const { push } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [commonRoutines, setCommonRoutines] = useState<CommonRoutine[]>([])
  const [duels, setDuels] = useState<Duel[]>([])

  const [loading, setLoading] = useState(true)
  const [showCreateRoutine, setShowCreateRoutine] = useState(false)
  const [routineName, setRoutineName] = useState('')
  const [routineFriend, setRoutineFriend] = useState('')
  const [routineTasks, setRoutineTasks] = useState<string[]>([''])
  const [routineTaskTimes, setRoutineTaskTimes] = useState<string[]>(['09:00'])
  const [creatingRoutine, setCreatingRoutine] = useState(false)


  const load = useCallback(async () => {
    try {
      const [reqs, fr, cr, du] = await Promise.all([
        api.get<FriendRequest[]>('/friends/requests/pending'),
        api.get<Friend[]>('/friends'),
        api.get<CommonRoutine[]>('/friends/common-routines'),
        api.get<Duel[]>('/friends/duels'),
      ])
      setPendingRequests(reqs)
      setFriends(fr)
      setCommonRoutines(cr)
      setDuels(du)
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not load friends.', 'error')
    } finally {
      setLoading(false)
    }
  }, [push])

  useEffect(() => {
    void load()
  }, [load])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await api.get<FriendSearchResult[]>(`/friends/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchResults(results)
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Search failed.', 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleSendRequest = async (username: string) => {
    try {
      await api.post('/friends/request', { username })
      push(`Friend request sent to @${username}.`, 'success')
      setSearchResults((prev) => prev.filter((r) => r.username !== username))
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not send request.', 'error')
    }
  }

  const handleAccept = async (requestId: number) => {
    try {
      await api.post(`/friends/requests/${requestId}/accept`)
      push('Friend request accepted.', 'success')
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not accept request.', 'error')
    }
  }

  const handleDecline = async (requestId: number) => {
    try {
      await api.post(`/friends/requests/${requestId}/decline`)
      push('Friend request declined.', 'info')
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not decline request.', 'error')
    }
  }

  const handleRequestDeleteRoutine = async (routineId: number) => {
    try {
      const result = await api.post<{ detail: string }>(`/friends/common-routines/${routineId}/request-delete`)
      push(result.detail, 'info')
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not request deletion.', 'error')
    }
  }

  const handleCancelDeleteRoutine = async (routineId: number) => {
    try {
      const result = await api.post<{ detail: string }>(`/friends/common-routines/${routineId}/cancel-delete`)
      push(result.detail, 'info')
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not cancel deletion.', 'error')
    }
  }
  const handleCreateRoutine = async () => {
    if (!routineName.trim() || !routineFriend.trim()) return
    setCreatingRoutine(true)
    try {
      const tasks = routineTasks.filter((t) => t.trim()).map((title, i) => ({
        title: title.trim(),
        scheduled_time: routineTaskTimes[i] || '09:00',
      }))
      await api.post('/friends/common-routines', {
        friend_username: routineFriend.trim(),
        name: routineName.trim(),
        emoji: '',
        tasks,
      })
      push('Common routine created.', 'success')
      setShowCreateRoutine(false)
      setRoutineName('')
      setRoutineFriend('')
      setRoutineTasks([''])
      setRoutineTaskTimes(['09:00'])
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not create routine.', 'error')
    } finally {
      setCreatingRoutine(false)
    }
  }

  const handleStartDuel = async (routineId: number, opponentId: string) => {
    try {
      const duel = await api.post<Duel>('/friends/duels', {
        common_routine_id: routineId,
        opponent_id: opponentId,
      })
      await api.post(`/friends/duels/${duel.id}/start`)
      push('Duel started!', 'success')
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not start duel.', 'error')
    }
  }

  const handleCompleteDuelTask = async (duelId: number, taskId: number) => {
    try {
      await api.post(`/friends/duels/${duelId}/complete`, {
        duel_task_id: taskId,
        local_time: new Date().toTimeString().slice(0, 5),
      })
      push('Task completed in duel.', 'success')
      await load()
    } catch (error) {
      push(error instanceof ApiError ? error.detail : 'Could not complete task.', 'error')
    }
  }



  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner /> Loading friends…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Duel"
        subtitle="Search users, send friend requests, create common routines, and duel with friends."
      />

      {/* Search */}
      <Card className="space-y-3">
        <h3 className="font-bold">Search users</h3>
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username…"
            className="focus-ring flex-1 rounded-lg bg-surface-2 px-4 py-2.5 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          />
          <Button size="sm" onClick={() => void handleSearch()} loading={searching}>
            Search
          </Button>
        </div>
        {searchResults.length > 0 ? (
          <ul className="space-y-2">
            {searchResults.map((user) => (
              <li key={user.id} className="glass-2 flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar slug={user.avatar_slug} size={32} src={user.avatar_url} />
                  <div>
                    <p className="text-sm font-bold">@{user.username}</p>
                    <p className="text-xs text-muted">{user.elo} ELO</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => handleSendRequest(user.username!)}>
                  Add friend
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* Pending requests */}
      {pendingRequests.length > 0 ? (
        <Card className="space-y-3">
          <h3 className="font-bold">Pending friend requests</h3>
          <ul className="space-y-2">
            {pendingRequests.map((req) => (
              <li key={req.id} className="glass-2 flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar slug={null} size={32} />
                  <div>
                    <p className="text-sm font-bold">User {req.user_id.slice(0, 8)}</p>
                    <p className="text-xs text-muted">wants to be your friend</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleAccept(req.id)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDecline(req.id)}>
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Friends list */}
      <Card className="space-y-3">
        <h3 className="font-bold">Your friends</h3>
        {friends.length === 0 ? (
          <EmptyState
            title="No friends yet"
            body="Search for users above and send them a friend request."
          />
        ) : (
          <ul className="space-y-2">
            {friends.map((friend) => (
              <li key={friend.id} className="glass-2 flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar slug={friend.avatar_slug} size={32} src={friend.avatar_url} />
                  <div>
                    <p className="text-sm font-bold">@{friend.username}</p>
                    <p className="text-xs text-muted">{friend.elo} ELO</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Common routines */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Common routines</h3>
          <Button size="sm" onClick={() => setShowCreateRoutine(true)}>
            Create common routine
          </Button>
        </div>
        {commonRoutines.length === 0 ? (
          <EmptyState
            title="No common routines"
            body="Create a shared routine with a friend to duel together."
          />
        ) : (
          <ul className="space-y-3">
            {commonRoutines.map((routine) => (
              <li key={routine.id} className="glass-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{routine.name}</p>
                    <p className="text-xs text-muted">
                      with @{routine.creator_username === profile?.username ? routine.friend_username : routine.creator_username}
                    </p>
                    {routine.pending_delete ? (
                      <p className="text-xs text-amber-300 mt-1">
                        Deletion requested by {routine.delete_requested_by === profile?.id ? 'you' : 'the other user'}. {routine.delete_requested_by !== profile?.id ? 'Accept to delete.' : 'Waiting for acceptance.'}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {routine.pending_delete && routine.delete_requested_by !== profile?.id ? (
                      <Button size="sm" variant="danger" onClick={() => handleRequestDeleteRoutine(routine.id)}>
                        Accept delete
                      </Button>
                    ) : routine.pending_delete && routine.delete_requested_by === profile?.id ? (
                      <Button size="sm" variant="ghost" onClick={() => handleCancelDeleteRoutine(routine.id)}>
                        Cancel delete
                      </Button>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => handleRequestDeleteRoutine(routine.id)}>
                        Delete
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        const opponentId = routine.creator_id === profile?.id ? routine.friend_id : routine.creator_id
                        void handleStartDuel(routine.id, opponentId)
                      }}
                    >
                      Duel
                    </Button>
                  </div>
                </div>
                <ul className="text-xs text-muted space-y-1">
                  {routine.tasks.map((task) => (
                    <li key={task.id}>
                      {task.title} — {task.scheduled_time}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Duels */}
      {duels.length > 0 ? (
        <Card className="space-y-3">
          <h3 className="font-bold">Duels</h3>
          <ul className="space-y-3">
            {duels.map((duel) => (
              <li key={duel.id} className="glass-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{duel.common_routine_name}</p>
                    <p className="text-xs text-muted">
                      Status: {duel.status}
                      {duel.you_won ? ' · You won!' : ''}
                    </p>
                  </div>
                  {duel.status === 'waiting' ? (
                    <Button size="sm" onClick={() => void api.post(`/friends/duels/${duel.id}/start`)}>
                      Start
                    </Button>
                  ) : null}
                </div>
                {duel.status === 'active' ? (
                  <ul className="space-y-1">
                    {duel.tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between text-sm">
                        <span>
                          {task.title} — {task.scheduled_time}
                          {task.completed_by_me ? ' ✓' : ''}
                        </span>
                        {!task.completed_by_me ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCompleteDuelTask(duel.id, task.id)}
                          >
                            Complete
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {duel.status === 'finished' ? (
                  <div className="text-sm">
                    <p className="font-bold">
                      Winner: {duel.winner_id === profile?.id ? 'You!' : 'Opponent'}
                    </p>
                    {duel.players.map((p) => (
                      <p key={p.user_id} className="text-xs text-muted">
                        {p.is_you ? 'You' : p.username}: {p.elo_delta > 0 ? '+' : ''}{p.elo_delta} ELO, {p.coins_won} coins
                      </p>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Create common routine modal */}
      <Modal
        open={showCreateRoutine}
        onClose={() => setShowCreateRoutine(false)}
        title="Create common routine"
      >
        <div className="space-y-4">
          <Field
            label="Friend's username"
            value={routineFriend}
            onChange={(e) => setRoutineFriend(e.target.value)}
            placeholder="username"
          />
          <Field
            label="Routine name"
            value={routineName}
            onChange={(e) => setRoutineName(e.target.value)}
            placeholder="Morning duel routine"
          />
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Tasks</p>
            {routineTasks.map((task, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={task}
                  onChange={(e) => {
                    const next = [...routineTasks]
                    next[index] = e.target.value
                    setRoutineTasks(next)
                  }}
                  placeholder={`Task ${index + 1}`}
                  className="focus-ring flex-1 rounded-lg bg-surface-2 px-4 py-2.5 text-sm"
                />
                <input
                  type="time"
                  value={routineTaskTimes[index] || '09:00'}
                  onChange={(e) => {
                    const next = [...routineTaskTimes]
                    next[index] = e.target.value
                    setRoutineTaskTimes(next)
                  }}
                  className="focus-ring rounded-lg bg-surface-2 px-3 py-2.5 text-sm"
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRoutineTasks([...routineTasks, ''])
                setRoutineTaskTimes([...routineTaskTimes, '09:00'])
              }}
            >
              + Add task
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreateRoutine(false)}>
              Cancel
            </Button>
            <Button loading={creatingRoutine} onClick={() => void handleCreateRoutine()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
