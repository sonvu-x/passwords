import { useState, type FormEvent } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { buildTotpEntry, nextTotpIndex, readQrImage, setupLink } from '../lib/otp'
import { useVault } from '../vault/context'

export function TotpDialog() {
  const { state, closeEditor, saveTotp, deleteTotp, notify } = useVault()
  const entry = state.totp.find((item) => item.id === state.editingId)
  const [issuer, setIssuer] = useState(entry?.issuer ?? '')
  const [account, setAccount] = useState(entry?.account ?? '')
  const [secret, setSecret] = useState(entry?.secret ?? '')
  const [visible, setVisible] = useState(false)
  const [type, setType] = useState(entry?.type ?? 'totp')
  const [period, setPeriod] = useState(String(entry?.period ?? 30))
  const [digits, setDigits] = useState(String(entry?.digits ?? 6))
  const [algorithm, setAlgorithm] = useState(entry?.algorithm ?? 'SHA-1')
  const [counter, setCounter] = useState(String(entry?.counter ?? 0))
  const [error, setError] = useState('')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      const next = buildTotpEntry({
        secretRaw: secret,
        account,
        issuer,
        type,
        period: Number(period),
        digits: Number(digits),
        algorithm,
        counter: Number(counter),
        existing: entry,
        index: entry ? entry.index : nextTotpIndex(state.totp),
      })
      setError('')
      void saveTotp(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this account.')
    }
  }

  async function onCopyLink() {
    if (!entry) return
    try {
      await navigator.clipboard.writeText(setupLink(entry))
      notify('Copied.')
    } catch {
      setError('Could not copy the setup link.')
    }
  }

  async function onQr(file: File) {
    try {
      setSecret(await readQrImage(file))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that image.')
    }
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
        <DialogTitle>{entry ? 'Edit account' : 'New account'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Issuer"
            autoFocus
            autoComplete="off"
            placeholder="GitHub, Google, bank"
            fullWidth
            margin="dense"
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
          />
          <TextField
            label="Account"
            autoComplete="off"
            placeholder="name@email.com"
            fullWidth
            margin="dense"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
            <TextField
              label="Secret"
              type={visible ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="Base32 secret or otpauth:// link"
              fullWidth
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
            <Button onClick={() => setVisible((showing) => !showing)}>
              {visible ? 'Hide' : 'Show'}
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button component="label">
              Read QR image
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void onQr(file)
                  event.target.value = ''
                }}
              />
            </Button>
            <Button onClick={() => void onCopyLink()} disabled={!entry}>Copy setup link</Button>
          </Stack>
          <Accordion
            disableGutters
            elevation={0}
            sx={{ mt: 2, border: 1, borderColor: 'divider', '&:before': { display: 'none' } }}
          >
            <AccordionSummary>Advanced</AccordionSummary>
            <AccordionDetails>
              <TextField
                select
                label="Type"
                fullWidth
                margin="dense"
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
              >
                <MenuItem value="totp">Time-based</MenuItem>
                <MenuItem value="hotp">Counter-based</MenuItem>
                <MenuItem value="steam">Steam</MenuItem>
              </TextField>
              {type !== 'hotp' && (
                <TextField
                  label="Period in seconds"
                  type="number"
                  fullWidth
                  margin="dense"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  slotProps={{ htmlInput: { min: 1, max: 120 } }}
                />
              )}
              {type !== 'steam' && (
                <>
                  <TextField
                    select
                    label="Digits"
                    fullWidth
                    margin="dense"
                    value={digits}
                    onChange={(event) => setDigits(event.target.value)}
                  >
                    <MenuItem value="6">6</MenuItem>
                    <MenuItem value="8">8</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label="Algorithm"
                    fullWidth
                    margin="dense"
                    value={algorithm}
                    onChange={(event) => setAlgorithm(event.target.value as typeof algorithm)}
                  >
                    <MenuItem value="SHA-1">SHA-1</MenuItem>
                    <MenuItem value="SHA-256">SHA-256</MenuItem>
                    <MenuItem value="SHA-512">SHA-512</MenuItem>
                  </TextField>
                </>
              )}
              {type === 'hotp' && (
                <TextField
                  label="Counter"
                  type="number"
                  fullWidth
                  margin="dense"
                  value={counter}
                  onChange={(event) => setCounter(event.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 1 } }}
                />
              )}
            </AccordionDetails>
          </Accordion>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" disabled={state.busy}>Save</Button>
          <Button onClick={closeEditor}>Cancel</Button>
          {entry && <Button color="error" onClick={() => void deleteTotp()}>Delete</Button>}
        </DialogActions>
      </Box>
    </Dialog>
  )
}
