import { useEffect, useRef, useState, type DragEvent } from 'react'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { styled } from '@mui/material/styles'
import type { TotpEntry } from '../lib/crypto'
import { formatCode, otpCode, sortedTotp } from '../lib/otp'
import { useVault } from '../vault/context'

const CodeText = styled('span', {
  shouldForwardProp: (prop) => prop !== 'copied',
})<{ copied?: boolean }>(({ copied, theme }) => ({
  display: 'inline-block',
  minWidth: copied ? 0 : '5.5rem',
  color: theme.palette.text.primary,
  fontSize: copied ? '0.8rem' : '1rem',
  lineHeight: 1.2,
  letterSpacing: copied ? 0 : '0.08em',
  filter: copied ? 'none' : 'blur(7px)',
  transition: 'filter 140ms ease',
  userSelect: copied ? 'text' : 'none',
  '.MuiCard-root:hover &, .MuiButton-root:focus-visible &': {
    filter: 'none',
    userSelect: 'text',
  },
}))

function sharedPeriod(entries: TotpEntry[]) {
  const counts = new Map<number, number>()
  for (const entry of entries) {
    if (entry.type === 'hotp') continue
    const period = entry.period || 30
    counts.set(period, (counts.get(period) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [period, count] of counts) {
    if (count > bestCount) {
      best = period
      bestCount = count
    }
  }
  return best
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function useOtp(entry: TotpEntry, now: number) {
  const [code, setCode] = useState('')
  const step = entry.type === 'hotp'
    ? entry.counter
    : Math.floor(now / 1000 / (entry.period || 30))

  useEffect(() => {
    let cancelled = false
    void otpCode(entry).then((result) => {
      if (!cancelled && result) setCode(result.code)
    })
    return () => {
      cancelled = true
    }
  }, [entry, step])

  return code
}

function CountdownBar({ period, now }: { period: number; now: number }) {
  const elapsed = now % (period * 1000)
  const remaining = (period * 1000 - elapsed) / 1000
  const progress = Math.min(1, Math.max(0, remaining / period))
  const warning = remaining <= 5
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mt: 1 }}>
      <LinearProgress
        variant="determinate"
        color={warning ? 'error' : 'primary'}
        value={progress * 100}
        aria-label="Code refresh countdown"
        sx={{
          flex: 1,
          height: 4,
          borderRadius: 999,
          backgroundColor: '#e7e0d4',
          '& .MuiLinearProgress-bar': {
            borderRadius: 999,
            transition: 'transform 100ms linear',
          },
        }}
      />
      <Typography
        variant="body2"
        sx={{
          minWidth: '2.4rem',
          color: warning ? 'error.main' : 'text.secondary',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
        {Math.ceil(remaining)}s
      </Typography>
    </Stack>
  )
}

function TotpCard({
  entry,
  now,
  dragging,
  onDragging,
}: {
  entry: TotpEntry
  now: number
  dragging: boolean
  onDragging: (id: string) => void
}) {
  const { state, notify, openTotpEditor, advanceHotp, reorderTotp } = useVault()
  const code = useOtp(entry, now)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])
  const title = entry.issuer || entry.account || 'Account'
  const subtitle = entry.issuer ? entry.account : ''

  function onDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData('text/plain', entry.id)
    event.dataTransfer.effectAllowed = 'move'
    onDragging(entry.id)
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const fromId = event.dataTransfer.getData('text/plain')
    void reorderTotp(fromId, entry.id)
  }

  async function onCopy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1200)
    } catch {
      notify('Could not copy the code.')
    }
  }

  return (
    <Card
      variant="outlined"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      sx={{ height: '100%', textAlign: 'center', opacity: dragging ? 0.45 : 1 }}
    >
      <CardContent>
        <Stack
          draggable
          onDragStart={onDragStart}
          onDragEnd={() => onDragging('')}
          sx={{ cursor: 'grab', minWidth: 0 }}
        >
          <Typography noWrap sx={{ fontWeight: 650 }}>{title}</Typography>
          {subtitle && <Typography noWrap variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Stack>
        <Button onClick={() => void onCopy()} sx={{ mt: 0.5 }}>
          <CodeText copied={copied}>{copied ? 'Copied' : (code ? formatCode(code) : '······')}</CodeText>
        </Button>
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
          <Button size="small" onClick={() => openTotpEditor(entry.id)}>Edit</Button>
          {entry.type === 'hotp' && (
            <Button size="small" onClick={() => void advanceHotp(entry.id)} disabled={state.busy}>Next</Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

export function TotpList() {
  const { state } = useVault()
  const [draggingId, setDraggingId] = useState('')
  const query = state.query.trim().toLowerCase()
  const visible = sortedTotp(state.totp).filter((entry) => {
    const haystack = [entry.issuer, entry.account].join('\n').toLowerCase()
    return haystack.includes(query)
  })
  const period = sharedPeriod(visible)
  const now = useNow(period != null)

  return (
    <>
      {period != null && <CountdownBar period={period} now={now} />}
      <Grid container spacing={1} sx={{ mt: 0.5 }}>
        {visible.length === 0 ? (
          <Grid size={12}>
            <Typography color="text.secondary" sx={{ my: 2 }}>
              {state.totp.length ? 'No matching accounts.' : 'No 2FA accounts yet.'}
            </Typography>
          </Grid>
        ) : (
          visible.map((entry) => (
            <Grid key={entry.id} size={{ xs: 12, sm: 4, md: 3, xl: 2 }}>
              <TotpCard
                entry={entry}
                now={now}
                dragging={draggingId === entry.id}
                onDragging={setDraggingId}
              />
            </Grid>
          ))
        )}
      </Grid>
    </>
  )
}
