import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { Entry } from '../lib/crypto'
import type { VaultTab } from '../vault/store'
import { useVault } from '../vault/context'
import { TotpList } from './TotpList'

function formatWhen(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function CopyButton({ value }: { value: string }) {
  const { reportVaultError } = useVault()
  const [label, setLabel] = useState('Copy')

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setLabel('Copied')
      window.setTimeout(() => setLabel('Copy'), 1500)
    } catch {
      reportVaultError('Could not copy the password.')
    }
  }

  return (
    <Button variant="outlined" onClick={() => void onCopy()}>
      {label}
    </Button>
  )
}

function matches(entry: Entry, query: string) {
  const haystack = [entry.title, entry.username, entry.url, entry.notes].join('\n').toLowerCase()
  return haystack.includes(query)
}

export function VaultScreen() {
  const { state, setQuery, setTab, openEditor, openTotpEditor, openImport, downloadBackup } = useVault()
  const searchRef = useRef<HTMLInputElement>(null)
  const query = state.query.trim().toLowerCase()
  const passwords = state.activeTab === 'passwords'
  const visible = state.entries
    .filter((entry) => matches(entry, query))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  const count = passwords ? state.entries.length : state.totp.length

  useEffect(() => {
    searchRef.current?.focus()
  }, [state.activeTab])

  return (
    <section>
      <Tabs
        value={state.activeTab}
        onChange={(_, value: VaultTab) => setTab(value)}
        aria-label="Vault"
        sx={{ mb: 1.5 }}
      >
        <Tab value="passwords" label="Passwords" />
        <Tab value="totp" label="2FA" />
      </Tabs>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          inputRef={searchRef}
          type="search"
          size="small"
          placeholder={passwords ? 'Search titles, usernames, notes' : 'Search issuers and accounts'}
          aria-label="Search entries"
          value={state.query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ flex: '1 1 12rem' }}
        />
        <Button variant="contained" onClick={() => passwords ? openEditor(null) : openTotpEditor(null)}>New</Button>
        {!passwords && <Button variant="outlined" onClick={openImport}>Import</Button>}
        <Button variant="outlined" onClick={downloadBackup}>Backup</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {state.gistId} · {count} {passwords ? (count === 1 ? 'entry' : 'entries') : (count === 1 ? 'account' : 'accounts')}
      </Typography>
      {state.status && (
        <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 0.5 }}>{state.status}</Typography>
      )}
      {state.vaultError && <Alert severity="error" sx={{ mt: 1 }}>{state.vaultError}</Alert>}
      {passwords ? (
        <Stack spacing={1} sx={{ mt: 1, maxWidth: '40rem' }}>
          {visible.length === 0 ? (
            <Typography color="text.secondary" sx={{ my: 2 }}>
              {count ? 'No matching entries.' : 'No passwords yet.'}
            </Typography>
          ) : (
            visible.map((entry) => {
              const details = [entry.username, entry.url, formatWhen(entry.updatedAt)].filter(Boolean)
              return (
                <Stack key={entry.id} direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={() => openEditor(entry.id)}
                    sx={{
                      flex: 1,
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      py: 0.6,
                      px: 1.5,
                    }}
                  >
                    <Typography component="span" sx={{ fontWeight: 650 }}>{entry.title || 'Untitled'}</Typography>
                    <Typography component="span" variant="body2" color="text.secondary">{details.join(' · ')}</Typography>
                  </Button>
                  <CopyButton value={entry.password} />
                </Stack>
              )
            })
          )}
        </Stack>
      ) : (
        <TotpList />
      )}
    </section>
  )
}
