import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ConnectScreen } from './components/ConnectScreen'
import { ImportDialog } from './components/ImportDialog'
import { LockScreen } from './components/LockScreen'
import { PasswordChangeDialog } from './components/PasswordChangeDialog'
import { PasswordDialog } from './components/PasswordDialog'
import { TotpDialog } from './components/TotpDialog'
import { VaultScreen } from './components/VaultScreen'
import { useVault } from './vault/context'
import { VaultProvider } from './vault/store'

function VaultApp() {
  const { state, openPassword, lock } = useVault()
  const wide = state.view === 'vault'
  return (
    <Box
      component="main"
      sx={{
        width: wide ? 'min(96rem, calc(100% - 2rem))' : 'min(40rem, calc(100% - 2rem))',
        mx: 'auto',
        pt: 3,
        pb: 5,
      }}
    >
      <Box component="header" sx={{ mb: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box>
            <Typography
              variant="overline"
              color="primary"
              sx={{ display: 'block', letterSpacing: '0.08em', lineHeight: 1.4 }}
            >
              Secret gist
            </Typography>
            <Typography variant="h1">Vault</Typography>
          </Box>
          {state.view === 'vault' && (
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 }}>
              <Button variant="outlined" onClick={openPassword}>Change password</Button>
              <Button variant="outlined" onClick={lock}>Lock</Button>
            </Stack>
          )}
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: '36rem' }}>
          Passwords and 2FA codes are encrypted in this browser. GitHub only stores the ciphertext.
        </Typography>
      </Box>
      {state.view === 'connect' && <ConnectScreen key={state.connectKey} />}
      {state.view === 'lock' && <LockScreen />}
      {state.view === 'vault' && <VaultScreen />}
      {state.editorOpen && state.editorKind === 'password' && <PasswordDialog />}
      {state.editorOpen && state.editorKind === 'totp' && <TotpDialog />}
      {state.importOpen && <ImportDialog />}
      {state.passwordOpen && <PasswordChangeDialog />}
    </Box>
  )
}

export default function App() {
  return (
    <VaultProvider>
      <VaultApp />
    </VaultProvider>
  )
}
