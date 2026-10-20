import { useState, type FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useVault } from '../vault/context'

export function PasswordDialog() {
  const { state, closeEditor, saveEntry, deleteEntry, reportVaultError } = useVault()
  const entry = state.entries.find((item) => item.id === state.editingId)
  const [title, setTitle] = useState(entry?.title ?? '')
  const [username, setUsername] = useState(entry?.username ?? '')
  const [password, setPassword] = useState(entry?.password ?? '')
  const [url, setUrl] = useState(entry?.url ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      reportVaultError('Could not copy the password.')
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void saveEntry({ title: title.trim(), username: username.trim(), password, url: url.trim(), notes })
  }

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={(_, reason) => {
        if (reason !== 'backdropClick') closeEditor()
      }}
    >
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle>{entry ? 'Edit entry' : 'New entry'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Title"
            name="title"
            autoFocus
            required
            autoComplete="off"
            fullWidth
            margin="dense"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <TextField
            label="Username"
            name="username"
            autoComplete="off"
            fullWidth
            margin="dense"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
            <TextField
              label="Password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              fullWidth
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button onClick={() => setVisible((showing) => !showing)}>
              {visible ? 'Hide' : 'Show'}
            </Button>
            <Button onClick={() => void onCopy()}>{copied ? 'Copied' : 'Copy'}</Button>
          </Stack>
          <TextField
            label="URL"
            name="url"
            type="text"
            autoComplete="off"
            spellCheck={false}
            fullWidth
            margin="dense"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <TextField
            label="Notes"
            name="notes"
            multiline
            rows={4}
            fullWidth
            margin="dense"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          {state.vaultError && <Alert severity="error" sx={{ mt: 1 }}>{state.vaultError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" disabled={state.busy}>Save</Button>
          <Button onClick={closeEditor}>Cancel</Button>
          {entry && <Button color="error" onClick={() => void deleteEntry()}>Delete</Button>}
        </DialogActions>
      </Box>
    </Dialog>
  )
}
