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

export function ImportDialog() {
  const { state, closeImport, importTotp } = useVault()
  const [text, setText] = useState('')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void importTotp(text)
  }

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={(_, reason) => {
        if (reason !== 'backdropClick') closeImport()
      }}
    >
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle>Import 2FA</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Paste otpauth:// links, one per line or all together. Accounts are sorted by issuer.
          </Typography>
          <TextField
            label="Setup links"
            multiline
            rows={8}
            spellCheck={false}
            placeholder="otpauth://totp/GitHub:ada?secret=..."
            fullWidth
            margin="dense"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {state.importError && <Alert severity="error" sx={{ mt: 1 }}>{state.importError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" disabled={state.busy}>Import</Button>
          <Button onClick={closeImport}>Cancel</Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
