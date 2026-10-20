import { useState, type FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useVault } from '../vault/context'

export function PasswordChangeDialog() {
  const { state, closePassword, changePassword } = useVault()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const message = await changePassword(current, next, confirm)
    setError(message ?? '')
    if (!message) {
      setCurrent('')
      setNext('')
      setConfirm('')
    }
  }

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={(_, reason) => {
        if (reason !== 'backdropClick') closePassword()
      }}
    >
      <Box component="form" onSubmit={(event) => void onSubmit(event)}>
        <DialogTitle>Change master password</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            The vault is re-encrypted and saved to the gist. The old password will no longer open it.
          </Typography>
          <TextField
            label="Current master password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            fullWidth
            margin="dense"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
          <TextField
            label="New master password"
            type="password"
            autoComplete="new-password"
            required
            fullWidth
            margin="dense"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
          <TextField
            label="Confirm new master password"
            type="password"
            autoComplete="new-password"
            required
            fullWidth
            margin="dense"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" disabled={state.busy}>Change password</Button>
          <Button onClick={closePassword}>Cancel</Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
