import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { VaultContext, type VaultContextValue } from './context'
import {
  decryptVault,
  encryptVault,
  inspectCiphertext,
  type Entry,
  type TotpEntry,
  type VaultMode,
} from '../lib/crypto'
import { planImport, sortedTotp } from '../lib/otp'
import {
  explainGitHubError,
  GIST_KEY,
  loadCiphertext,
  saveCiphertext,
  TOKEN_KEY,
  parseGistId,
} from '../lib/gist'

const IDLE_MS = 5 * 60 * 1000

export type EntryDraft = {
  title: string
  username: string
  password: string
  url: string
  notes: string
}

type View = 'connect' | 'lock' | 'vault'
export type VaultTab = 'passwords' | 'totp'
export type EditorKind = 'password' | 'totp'

export type State = {
  view: View
  vaultMode: VaultMode
  entries: Entry[]
  totp: TotpEntry[]
  activeTab: VaultTab
  gistId: string
  tokenSaved: boolean
  savedGist: string
  query: string
  status: string
  connectError: string
  lockError: string
  vaultError: string
  importError: string
  busy: boolean
  editorOpen: boolean
  editorKind: EditorKind
  editingId: string
  importOpen: boolean
  passwordOpen: boolean
  connectKey: number
}

type Action =
  | { type: 'showConnect'; savedGist: string; tokenSaved: boolean; error: string }
  | { type: 'showLock'; mode: VaultMode; gistId: string }
  | { type: 'connectError'; error: string }
  | { type: 'lockError'; error: string }
  | { type: 'vaultError'; error: string }
  | { type: 'busy'; busy: boolean }
  | { type: 'unlocked'; entries: Entry[]; totp: TotpEntry[] }
  | { type: 'lock' }
  | { type: 'query'; query: string }
  | { type: 'tab'; tab: VaultTab }
  | { type: 'status'; text: string }
  | { type: 'saved'; entries: Entry[]; totp: TotpEntry[] }
  | { type: 'openEditor'; id: string; kind: EditorKind }
  | { type: 'closeEditor' }
  | { type: 'import'; open: boolean }
  | { type: 'importError'; error: string }
  | { type: 'password'; open: boolean }

const initialState: State = {
  view: 'connect',
  vaultMode: 'vault',
  entries: [],
  totp: [],
  activeTab: 'passwords',
  gistId: '',
  tokenSaved: false,
  savedGist: '',
  query: '',
  status: '',
  connectError: '',
  lockError: '',
  vaultError: '',
  importError: '',
  busy: false,
  editorOpen: false,
  editorKind: 'password',
  editingId: '',
  importOpen: false,
  passwordOpen: false,
  connectKey: 0,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'showConnect':
      return {
        ...initialState,
        connectKey: state.connectKey + 1,
        savedGist: action.savedGist,
        tokenSaved: action.tokenSaved,
        connectError: action.error,
      }
    case 'showLock':
      return {
        ...state,
        view: 'lock',
        vaultMode: action.mode,
        gistId: action.gistId,
        entries: [],
        totp: [],
        activeTab: 'passwords',
        query: '',
        status: '',
        lockError: '',
        vaultError: '',
        importError: '',
        editorOpen: false,
        editingId: '',
        importOpen: false,
        passwordOpen: false,
        busy: false,
      }
    case 'connectError':
      return { ...state, connectError: action.error }
    case 'lockError':
      return { ...state, lockError: action.error }
    case 'vaultError':
      return { ...state, vaultError: action.error }
    case 'busy':
      return { ...state, busy: action.busy }
    case 'unlocked':
      return {
        ...state,
        view: 'vault',
        entries: action.entries,
        totp: action.totp,
        activeTab: 'passwords',
        query: '',
        lockError: '',
        editorOpen: false,
        editingId: '',
        importOpen: false,
        passwordOpen: false,
        busy: false,
      }
    case 'lock':
      return {
        ...state,
        view: 'lock',
        vaultMode: 'vault',
        entries: [],
        totp: [],
        activeTab: 'passwords',
        query: '',
        status: '',
        vaultError: '',
        lockError: '',
        importError: '',
        editorOpen: false,
        editingId: '',
        importOpen: false,
        passwordOpen: false,
        busy: false,
      }
    case 'query':
      return { ...state, query: action.query }
    case 'tab':
      return { ...state, activeTab: action.tab, query: '' }
    case 'status':
      return { ...state, status: action.text }
    case 'saved':
      return { ...state, entries: action.entries, totp: action.totp, status: 'Saved.', vaultError: '' }
    case 'openEditor':
      return { ...state, editorOpen: true, editorKind: action.kind, editingId: action.id }
    case 'closeEditor':
      return { ...state, editorOpen: false, editingId: '' }
    case 'import':
      return { ...state, importOpen: action.open, importError: '' }
    case 'importError':
      return { ...state, importError: action.error }
    case 'password':
      return { ...state, passwordOpen: action.open }
    default:
      return state
  }
}


function readStoredConnection() {
  return {
    token: localStorage.getItem(TOKEN_KEY) || '',
    gistId: localStorage.getItem(GIST_KEY) || '',
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const tokenRef = useRef('')
  const gistRef = useRef('')
  const passwordRef = useRef('')
  const ciphertextRef = useRef('')
  const entriesRef = useRef<Entry[]>([])
  const totpRef = useRef<TotpEntry[]>([])
  const sessionRef = useRef(0)
  const connectionRef = useRef(0)
  const vaultModeRef = useRef<VaultMode>('vault')
  const editingIdRef = useRef('')
  const statusTimerRef = useRef(0)

  const setStatus = useCallback((text: string) => {
    window.clearTimeout(statusTimerRef.current)
    dispatch({ type: 'status', text })
    if (text && text !== 'Saving…') {
      statusTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'status', text: '' })
      }, 4000)
    }
  }, [])

  const showConnect = useCallback(() => {
    connectionRef.current += 1
    sessionRef.current += 1
    passwordRef.current = ''
    ciphertextRef.current = ''
    entriesRef.current = []
    totpRef.current = []
    editingIdRef.current = ''
    window.clearTimeout(statusTimerRef.current)
    const stored = readStoredConnection()
    dispatch({
      type: 'showConnect',
      savedGist: stored.gistId,
      tokenSaved: Boolean(stored.token),
      error: '',
    })
  }, [])

  const lock = useCallback(() => {
    sessionRef.current += 1
    passwordRef.current = ''
    entriesRef.current = []
    totpRef.current = []
    editingIdRef.current = ''
    vaultModeRef.current = 'vault'
    window.clearTimeout(statusTimerRef.current)
    dispatch({ type: 'lock' })
  }, [])

  const persist = useCallback(async (next: { entries?: Entry[]; totp?: TotpEntry[] }) => {
    const connectionAtStart = connectionRef.current
    const sessionAtStart = sessionRef.current
    const password = passwordRef.current
    const gistAtStart = gistRef.current
    const tokenAtStart = tokenRef.current
    const nextEntries = next.entries ?? entriesRef.current
    const nextTotp = next.totp ?? totpRef.current
    if (!password) throw new Error('The vault is locked.')
    setStatus('Saving…')
    const content = JSON.stringify(await encryptVault(password, nextEntries, nextTotp), null, 2)
    if (connectionAtStart !== connectionRef.current) return false
    await saveCiphertext(gistAtStart, tokenAtStart, content)
    if (connectionAtStart !== connectionRef.current) return false
    ciphertextRef.current = content
    if (sessionAtStart !== sessionRef.current) return false
    entriesRef.current = nextEntries
    totpRef.current = nextTotp
    dispatch({ type: 'saved', entries: nextEntries, totp: nextTotp })
    setStatus('Saved.')
    return true
  }, [setStatus])

  const connect = useCallback(async (tokenInput: string, gistInput: string) => {
    dispatch({ type: 'connectError', error: '' })
    if (!crypto.subtle) {
      dispatch({
        type: 'connectError',
        error: 'Open this page from localhost or HTTPS. This address cannot encrypt.',
      })
      return false
    }
    const nextToken = tokenInput.trim() || localStorage.getItem(TOKEN_KEY) || ''
    const nextGist = parseGistId(gistInput)
    if (!nextToken || !nextGist) {
      dispatch({ type: 'connectError', error: 'A token and a gist id are both required.' })
      return false
    }
    tokenRef.current = nextToken
    gistRef.current = nextGist
    dispatch({ type: 'busy', busy: true })
    try {
      const content = await loadCiphertext(nextGist, nextToken)
      localStorage.setItem(TOKEN_KEY, nextToken)
      localStorage.setItem(GIST_KEY, nextGist)
      ciphertextRef.current = content
      vaultModeRef.current = inspectCiphertext(content)
      dispatch({ type: 'showLock', mode: vaultModeRef.current, gistId: nextGist })
      return true
    } catch (error) {
      tokenRef.current = ''
      dispatch({ type: 'connectError', error: explainGitHubError(error) })
      return false
    } finally {
      dispatch({ type: 'busy', busy: false })
    }
  }, [])

  const forget = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(GIST_KEY)
    tokenRef.current = ''
    gistRef.current = ''
    showConnect()
  }, [showConnect])

  const unlock = useCallback(async (password: string, confirm: string, replace: boolean) => {
    dispatch({ type: 'lockError', error: '' })
    dispatch({ type: 'busy', busy: true })
    const mode = vaultModeRef.current
    try {
      if (mode === 'vault') {
        const vault = await decryptVault(password, JSON.parse(ciphertextRef.current) as unknown)
        passwordRef.current = password
        entriesRef.current = vault.entries
        totpRef.current = vault.totp
        dispatch({ type: 'unlocked', entries: vault.entries, totp: vault.totp })
      } else {
        if (password.length < 8) throw new Error('Use at least 8 characters.')
        if (password !== confirm) throw new Error('Passwords do not match.')
        if (mode === 'unrecognized' && !replace) {
          throw new Error('Confirm that the current file should be replaced.')
        }
        passwordRef.current = password
        try {
          const saved = await persist({ entries: [], totp: [] })
          if (!saved) return
        } catch (error) {
          passwordRef.current = ''
          throw error
        }
        entriesRef.current = []
        totpRef.current = []
        dispatch({ type: 'unlocked', entries: [], totp: [] })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not unlock the vault.'
      const text = message === 'Wrong password.' || message === 'Damaged vault.'
        ? 'Wrong password, or the gist file is damaged.'
        : explainGitHubError(error)
      dispatch({ type: 'lockError', error: text })
    } finally {
      dispatch({ type: 'busy', busy: false })
    }
  }, [persist])

  const setQuery = useCallback((query: string) => {
    dispatch({ type: 'query', query })
  }, [])

  const setTab = useCallback((tab: VaultTab) => {
    dispatch({ type: 'tab', tab })
  }, [])

  const openEditor = useCallback((id: string | null) => {
    editingIdRef.current = id || ''
    dispatch({ type: 'openEditor', id: id || '', kind: 'password' })
  }, [])

  const openTotpEditor = useCallback((id: string | null) => {
    editingIdRef.current = id || ''
    dispatch({ type: 'openEditor', id: id || '', kind: 'totp' })
  }, [])

  const closeEditor = useCallback(() => {
    editingIdRef.current = ''
    dispatch({ type: 'closeEditor' })
  }, [])

  const saveEntry = useCallback(async (draft: EntryDraft) => {
    dispatch({ type: 'vaultError', error: '' })
    const editingId = editingIdRef.current
    const nextEntry: Entry = {
      id: editingId || crypto.randomUUID(),
      ...draft,
      updatedAt: new Date().toISOString(),
    }
    const next = editingId
      ? entriesRef.current.map((entry) => (entry.id === editingId ? nextEntry : entry))
      : entriesRef.current.concat([nextEntry])
    dispatch({ type: 'busy', busy: true })
    try {
      const saved = await persist({ entries: next })
      if (saved) {
        editingIdRef.current = ''
        dispatch({ type: 'closeEditor' })
      }
    } catch (error) {
      dispatch({ type: 'vaultError', error: explainGitHubError(error) })
    } finally {
      dispatch({ type: 'busy', busy: false })
    }
  }, [persist])

  const deleteEntry = useCallback(async () => {
    const editingId = editingIdRef.current
    if (!editingId) return
    if (!confirm('Delete this entry?')) return
    dispatch({ type: 'vaultError', error: '' })
    const next = entriesRef.current.filter((entry) => entry.id !== editingId)
    dispatch({ type: 'busy', busy: true })
    try {
      const saved = await persist({ entries: next })
      if (saved) {
        editingIdRef.current = ''
        dispatch({ type: 'closeEditor' })
      }
    } catch (error) {
      dispatch({ type: 'vaultError', error: explainGitHubError(error) })
    } finally {
      dispatch({ type: 'busy', busy: false })
    }
  }, [persist])

  const saveTotpList = useCallback(async (next: TotpEntry[], notice?: string) => {
    dispatch({ type: 'vaultError', error: '' })
    dispatch({ type: 'busy', busy: true })
    try {
      const saved = await persist({ totp: next })
      if (saved && notice) setStatus(notice)
      return saved
    } catch (error) {
      dispatch({ type: 'vaultError', error: explainGitHubError(error) })
      return false
    } finally {
      dispatch({ type: 'busy', busy: false })
    }
  }, [persist, setStatus])

  const saveTotp = useCallback(async (entry: TotpEntry) => {
    const editingId = editingIdRef.current
    const next = editingId
      ? totpRef.current.map((item) => (item.id === editingId ? entry : item))
      : totpRef.current.concat([entry])
    const saved = await saveTotpList(next)
    if (saved) {
      editingIdRef.current = ''
      dispatch({ type: 'closeEditor' })
    }
  }, [saveTotpList])

  const deleteTotp = useCallback(async () => {
    const editingId = editingIdRef.current
    if (!editingId) return
    if (!confirm('Delete this account?')) return
    const next = totpRef.current.filter((entry) => entry.id !== editingId)
    const saved = await saveTotpList(next)
    if (saved) {
      editingIdRef.current = ''
      dispatch({ type: 'closeEditor' })
    }
  }, [saveTotpList])

  const togglePin = useCallback(async (id: string) => {
    const next = totpRef.current.map((entry) => (
      entry.id === id ? { ...entry, pinned: !entry.pinned } : entry
    ))
    await saveTotpList(next)
  }, [saveTotpList])

  const advanceHotp = useCallback(async (id: string) => {
    const next = totpRef.current.map((entry) => (
      entry.id === id && entry.type === 'hotp' ? { ...entry, counter: entry.counter + 1 } : entry
    ))
    await saveTotpList(next)
  }, [saveTotpList])

  const reorderTotp = useCallback(async (fromId: string, toId: string) => {
    if (!fromId || fromId === toId) return
    const order = sortedTotp(totpRef.current)
    const from = order.findIndex((entry) => entry.id === fromId)
    const to = order.findIndex((entry) => entry.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = order.splice(from, 1)
    if (!moved) return
    order.splice(to, 0, moved)
    await saveTotpList(order.map((entry, index) => ({ ...entry, index })))
  }, [saveTotpList])

  const openImport = useCallback(() => {
    dispatch({ type: 'import', open: true })
  }, [])

  const closeImport = useCallback(() => {
    dispatch({ type: 'import', open: false })
  }, [])

  const importTotp = useCallback(async (text: string) => {
    const result = planImport(text, totpRef.current)
    if ('error' in result) {
      dispatch({ type: 'importError', error: result.error })
      return false
    }
    const saved = await saveTotpList(result.entries, result.summary)
    if (saved) dispatch({ type: 'import', open: false })
    return saved
  }, [saveTotpList])

  const openPassword = useCallback(() => {
    dispatch({ type: 'password', open: true })
  }, [])

  const closePassword = useCallback(() => {
    dispatch({ type: 'password', open: false })
  }, [])

  const changePassword = useCallback(async (current: string, next: string, confirm: string) => {
    if (next.length < 8) return 'Use at least 8 characters.'
    if (next !== confirm) return 'Passwords do not match.'
    if (next === current) return 'Choose a different master password.'
    if (!ciphertextRef.current) return 'Nothing has been saved to the gist yet.'
    dispatch({ type: 'busy', busy: true })
    const previous = passwordRef.current
    try {
      await decryptVault(current, JSON.parse(ciphertextRef.current) as unknown)
      passwordRef.current = next
      const saved = await persist({})
      if (!saved) {
        passwordRef.current = previous
        return 'The vault locked before the new password was saved.'
      }
      dispatch({ type: 'password', open: false })
      setStatus('Master password changed.')
      return null
    } catch (error) {
      passwordRef.current = previous
      const message = error instanceof Error ? error.message : 'Could not change the master password.'
      if (message === 'Wrong password.' || message === 'Damaged vault.') return 'Current password is wrong.'
      return explainGitHubError(error)
    } finally {
      dispatch({ type: 'busy', busy: false })
    }
  }, [persist, setStatus])

  const downloadBackup = useCallback(() => {
    if (!ciphertextRef.current) {
      dispatch({ type: 'vaultError', error: 'Nothing has been saved to the gist yet.' })
      return
    }
    const blob = new Blob([ciphertextRef.current], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'vault.json'
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const reportVaultError = useCallback((message: string) => {
    dispatch({ type: 'vaultError', error: message })
  }, [])

  useEffect(() => {
    if (!crypto.subtle) {
      const stored = readStoredConnection()
      dispatch({
        type: 'showConnect',
        savedGist: stored.gistId,
        tokenSaved: Boolean(stored.token),
        error: 'Open this page from localhost or HTTPS. This address cannot encrypt.',
      })
      return
    }
    const stored = readStoredConnection()
    if (!stored.token || !stored.gistId) {
      dispatch({
        type: 'showConnect',
        savedGist: stored.gistId,
        tokenSaved: Boolean(stored.token),
        error: '',
      })
      return
    }
    tokenRef.current = stored.token
    gistRef.current = stored.gistId
    let cancelled = false
    loadCiphertext(stored.gistId, stored.token)
      .then((content) => {
        if (cancelled) return
        ciphertextRef.current = content
        vaultModeRef.current = inspectCiphertext(content)
        dispatch({ type: 'showLock', mode: vaultModeRef.current, gistId: stored.gistId })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        tokenRef.current = ''
        dispatch({
          type: 'showConnect',
          savedGist: stored.gistId,
          tokenSaved: true,
          error: explainGitHubError(error),
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state.view !== 'vault') return
    let timer = window.setTimeout(lock, IDLE_MS)
    const bump = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(lock, IDLE_MS)
    }
    window.addEventListener('pointerdown', bump, true)
    window.addEventListener('keydown', bump, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', bump, true)
      window.removeEventListener('keydown', bump, true)
    }
  }, [state.view, lock])

  const value = useMemo<VaultContextValue>(() => ({
    state,
    connect,
    forget,
    unlock,
    showConnect,
    lock,
    setQuery,
    setTab,
    openEditor,
    openTotpEditor,
    closeEditor,
    saveEntry,
    deleteEntry,
    saveTotp,
    deleteTotp,
    togglePin,
    advanceHotp,
    reorderTotp,
    openImport,
    closeImport,
    importTotp,
    openPassword,
    closePassword,
    changePassword,
    notify: setStatus,
    downloadBackup,
    reportVaultError,
  }), [
    state,
    connect,
    forget,
    unlock,
    showConnect,
    lock,
    setQuery,
    setTab,
    openEditor,
    openTotpEditor,
    closeEditor,
    saveEntry,
    deleteEntry,
    saveTotp,
    deleteTotp,
    togglePin,
    advanceHotp,
    reorderTotp,
    openImport,
    closeImport,
    importTotp,
    openPassword,
    closePassword,
    changePassword,
    setStatus,
    downloadBackup,
    reportVaultError,
  ])

  return <VaultContext value={value}>{children}</VaultContext>
}
