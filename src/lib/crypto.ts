export const ITERATIONS = 600_000

export type Entry = {
  id: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  updatedAt: string
}

export type TotpType = 'totp' | 'hotp' | 'steam'
export type OtpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'
export type SecretEncoding = 'base32' | 'hex'

export type TotpEntry = {
  id: string
  account: string
  issuer: string
  secret: string
  type: TotpType
  encoding: SecretEncoding
  period: number
  digits: 6 | 8
  algorithm: OtpAlgorithm
  counter: number
  pinned: boolean
  index: number
  updatedAt: string
}

export type VaultMode = 'empty' | 'unrecognized' | 'vault'

type VaultFile = {
  v: number
  kdf: {
    name: string
    hash: string
    iterations: number
    salt: string
  }
  cipher: {
    name: string
    iv: string
    data: string
  }
}

export function bytesToB64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptVault(password: string, entries: Entry[], totp: TotpEntry[] = []): Promise<VaultFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, ITERATIONS)
  const plaintext = new TextEncoder().encode(JSON.stringify({ entries, totp }))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext,
  )
  return {
    v: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: ITERATIONS,
      salt: bytesToB64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: bytesToB64(iv),
      data: bytesToB64(new Uint8Array(encrypted)),
    },
  }
}

function isVaultFile(value: unknown): value is VaultFile {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<VaultFile>
  return payload.v === 1 && !!payload.kdf && !!payload.cipher
}

export function normalizeEntry(entry: Partial<Entry>): Entry {
  return {
    id: String(entry.id || crypto.randomUUID()),
    title: String(entry.title || ''),
    username: String(entry.username || ''),
    password: String(entry.password || ''),
    url: String(entry.url || ''),
    notes: String(entry.notes || ''),
    updatedAt: String(entry.updatedAt || ''),
  }
}

export function normalizeAlgorithm(value: unknown): OtpAlgorithm {
  const text = String(value || '').toUpperCase().replace(/-/g, '')
  if (text === 'SHA256') return 'SHA-256'
  if (text === 'SHA512') return 'SHA-512'
  return 'SHA-1'
}

export function normalizeTotp(entry: Partial<TotpEntry>, index = 0): TotpEntry {
  const type: TotpType = entry.type === 'hotp' || entry.type === 'steam' ? entry.type : 'totp'
  const secret = String(entry.secret || '').replace(/\s+/g, '')
  const period = Number(entry.period)
  const counter = Number(entry.counter)
  const storedIndex = Number(entry.index)
  return {
    id: String(entry.id || crypto.randomUUID()),
    account: String(entry.account || ''),
    issuer: String(entry.issuer || ''),
    secret: entry.encoding === 'hex' ? secret.toLowerCase() : secret.toUpperCase(),
    type,
    encoding: entry.encoding === 'hex' ? 'hex' : 'base32',
    period: Number.isInteger(period) && period > 0 ? period : 30,
    digits: Number(entry.digits) === 8 ? 8 : 6,
    algorithm: normalizeAlgorithm(entry.algorithm),
    counter: Number.isInteger(counter) && counter >= 0 ? counter : 0,
    pinned: Boolean(entry.pinned),
    index: Number.isInteger(storedIndex) ? storedIndex : index,
    updatedAt: String(entry.updatedAt || ''),
  }
}

export async function decryptVault(password: string, payload: unknown): Promise<{ entries: Entry[]; totp: TotpEntry[] }> {
  if (!isVaultFile(payload)) throw new Error('Unsupported vault.')
  if (payload.kdf.name !== 'PBKDF2' || payload.kdf.hash !== 'SHA-256' || payload.cipher.name !== 'AES-GCM') {
    throw new Error('Unsupported vault.')
  }
  const iterations = payload.kdf.iterations
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
    throw new Error('Unsupported vault.')
  }
  const salt = b64ToBytes(payload.kdf.salt)
  const iv = b64ToBytes(payload.cipher.iv)
  const data = b64ToBytes(payload.cipher.data)
  if (salt.length < 16 || iv.length !== 12) throw new Error('Unsupported vault.')
  const key = await deriveKey(password, salt, iterations)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      data as BufferSource,
    )
  } catch {
    throw new Error('Wrong password.')
  }
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as { entries?: unknown; totp?: unknown }
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error('Damaged vault.')
  return {
    entries: parsed.entries.map((entry) => normalizeEntry(entry as Partial<Entry>)),
    totp: Array.isArray(parsed.totp)
      ? parsed.totp.map((entry, index) => normalizeTotp(entry as Partial<TotpEntry>, index))
      : [],
  }
}

export function inspectCiphertext(content: string): VaultMode {
  const trimmed = content.trim()
  if (!trimmed || trimmed === '{}' || trimmed === 'null') return 'empty'
  try {
    const payload = JSON.parse(trimmed) as unknown
    if (isVaultFile(payload)) return 'vault'
  } catch {
    return 'unrecognized'
  }
  return 'unrecognized'
}
