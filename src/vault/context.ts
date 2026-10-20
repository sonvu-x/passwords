import { createContext, useContext } from 'react'
import type { TotpEntry } from '../lib/crypto'
import type { EntryDraft, State, VaultTab } from './store'

export type VaultContextValue = {
  state: State
  connect: (tokenInput: string, gistInput: string) => Promise<boolean>
  forget: () => void
  unlock: (password: string, confirm: string, replace: boolean) => Promise<void>
  showConnect: () => void
  lock: () => void
  setQuery: (query: string) => void
  setTab: (tab: VaultTab) => void
  openEditor: (id: string | null) => void
  openTotpEditor: (id: string | null) => void
  closeEditor: () => void
  saveEntry: (draft: EntryDraft) => Promise<void>
  deleteEntry: () => Promise<void>
  saveTotp: (entry: TotpEntry) => Promise<void>
  deleteTotp: () => Promise<void>
  togglePin: (id: string) => Promise<void>
  advanceHotp: (id: string) => Promise<void>
  reorderTotp: (fromId: string, toId: string) => Promise<void>
  openImport: () => void
  closeImport: () => void
  importTotp: (text: string) => Promise<boolean>
  openPassword: () => void
  closePassword: () => void
  changePassword: (current: string, next: string, confirm: string) => Promise<string | null>
  notify: (text: string) => void
  downloadBackup: () => void
  reportVaultError: (message: string) => void
}

export const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault() {
  const value = useContext(VaultContext)
  if (!value) throw new Error('useVault must be used inside VaultProvider')
  return value
}
