import { useState, type FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useVault } from '../vault/context'

const copy = {
  empty: {
    title: 'Create vault',
    help: 'Choose a master password. It cannot be recovered if you forget it.',
    button: 'Create vault',
  },
  unrecognized: {
    title: 'Replace file',
    help: 'vault.json is not an encrypted vault. Creating one replaces that file.',
    button: 'Create vault',
  },
  vault: {
    title: 'Unlock',
    help: 'The master password decrypts this gist in your browser. It is never sent to GitHub.',
    button: 'Unlock',
  },
} as const

export function LockScreen() {
  const { state, unlock, showConnect } = useVault()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [replace, setReplace] = useState(false)
  const creating = state.vaultMode !== 'vault'
  const text = copy[state.vaultMode]

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void unlock(password, confirm, replace)
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="h2">{text.title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>{text.help}</Typography>
      <Box component="form" onSubmit={onSubmit}>
        <TextField
          label="Master password"
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          autoFocus
          required
          fullWidth
          margin="dense"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {creating && (
          <TextField
            label="Confirm master password"
            type="password"
            autoComplete="new-password"
            required
            fullWidth
            margin="dense"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        )}
        {state.vaultMode === 'unrecognized' && (
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox checked={replace} onChange={(event) => setReplace(event.target.checked)} />}
            label="Replace the current vault.json"
          />
        )}
        {state.lockError && <Alert severity="error" sx={{ mt: 1 }}>{state.lockError}</Alert>}
        <Button type="submit" variant="contained" fullWidth disabled={state.busy} sx={{ mt: 1.5 }}>
          {state.busy ? (creating ? 'Creating…' : 'Unlocking…') : text.button}
        </Button>
      </Box>
      <Button onClick={showConnect} sx={{ mt: 1.5, px: 0 }}>
        Use a different gist
      </Button>
    </Paper>
  )
}
