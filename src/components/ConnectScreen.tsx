import { useState, type FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useVault } from '../vault/context'

export function ConnectScreen() {
  const { state, connect, forget } = useVault()
  const [token, setToken] = useState('')
  const [gist, setGist] = useState(state.savedGist)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void connect(token, gist).then((saved) => {
      if (saved) setToken('')
    })
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="h2">Connect a gist</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
        Paste a GitHub token with only the <code>gist</code> scope, and the id of a secret gist. Both stay in this browser.
      </Typography>
      <Box component="form" onSubmit={onSubmit}>
        <TextField
          label="GitHub token"
          type="password"
          name="token"
          autoComplete="off"
          spellCheck={false}
          placeholder="ghp_…"
          fullWidth
          margin="dense"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        {state.tokenSaved && (
          <Typography variant="body2" color="text.secondary">
            A token is already saved. Leave this blank to keep it.
          </Typography>
        )}
        <TextField
          label="Gist id or URL"
          name="gist"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="https://gist.github.com/…"
          fullWidth
          margin="dense"
          value={gist}
          onChange={(event) => setGist(event.target.value)}
        />
        {state.connectError && <Alert severity="error" sx={{ mt: 1 }}>{state.connectError}</Alert>}
        <Button type="submit" variant="contained" fullWidth disabled={state.busy} sx={{ mt: 1.5 }}>
          Continue
        </Button>
      </Box>
      {state.tokenSaved && (
        <Button onClick={forget} sx={{ mt: 1.5, px: 0 }}>
          Remove token from this browser
        </Button>
      )}
    </Paper>
  )
}
