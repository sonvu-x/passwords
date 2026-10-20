import { normalizeAlgorithm, normalizeTotp, type TotpEntry, type TotpType } from './crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY'
export const RING_LENGTH = 2 * Math.PI * 15.5

export type OtpCode = {
  code: string
  remaining: number | null
  period: number
}

export type TotpInput = {
  secretRaw: string
  account: string
  issuer: string
  type?: TotpType
  period?: number
  digits?: number
  algorithm?: string
  counter?: number
  existing?: TotpEntry
  index?: number
}

export function decodeBase32(input: string): Uint8Array | null {
  const cleaned = String(input || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/g, '')
  if (!cleaned || /[^A-Z2-7]/.test(cleaned)) return null
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index < 0) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >>> bits) & 0xff)
    }
  }
  return bytes.length ? new Uint8Array(bytes) : null
}

function hexToBytes(secret: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(secret) || secret.length % 2 !== 0) return null
  const bytes = new Uint8Array(secret.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(secret.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

function keyBytesFor(entry: Pick<TotpEntry, 'secret' | 'encoding'>): Uint8Array | null {
  const secret = String(entry.secret || '').replace(/\s+/g, '')
  if (entry.encoding === 'hex') return hexToBytes(secret)
  return decodeBase32(secret)
}

function steamCode(value: number): string {
  let output = ''
  let number = value
  for (let index = 0; index < 5; index += 1) {
    output += STEAM_ALPHABET[number % STEAM_ALPHABET.length]
    number = Math.floor(number / STEAM_ALPHABET.length)
  }
  return output
}

export async function otpCode(entry: TotpEntry, now?: number): Promise<OtpCode | null> {
  const keyBytes = keyBytesFor(entry)
  if (!keyBytes?.length) return null
  const type: TotpType = entry.type === 'hotp' || entry.type === 'steam' ? entry.type : 'totp'
  const period = Number.isInteger(entry.period) && entry.period > 0 ? entry.period : 30
  const digits = entry.digits === 8 ? 8 : 6
  const timestamp = typeof now === 'number' ? now : Date.now()
  let counter = Math.max(0, Number(entry.counter) || 0)
  let remaining: number | null = null
  if (type !== 'hotp') {
    counter = Math.floor(timestamp / 1000 / period)
    const elapsedMs = timestamp % (period * 1000)
    remaining = (period * 1000 - elapsedMs) / 1000
  }
  const hashName = type === 'steam' ? 'SHA-1' : normalizeAlgorithm(entry.algorithm)
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  view.setUint32(0, Math.floor(counter / 0x100000000), false)
  view.setUint32(4, counter >>> 0, false)
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: hashName }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer))
  const offset = signature[signature.length - 1] & 0x0f
  const binary = ((signature[offset] & 0x7f) << 24)
    | ((signature[offset + 1] & 0xff) << 16)
    | ((signature[offset + 2] & 0xff) << 8)
    | (signature[offset + 3] & 0xff)
  if (type === 'steam') return { code: steamCode(binary), remaining, period }
  return {
    code: String(binary % (10 ** digits)).padStart(digits, '0'),
    remaining,
    period,
  }
}

export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`
  return code
}

export function parseOtpauth(raw: string): {
  secret: string
  account: string
  issuer: string
  type?: TotpType
  period?: number
  digits?: 6 | 8
  algorithm?: ReturnType<typeof normalizeAlgorithm>
  counter?: number
} {
  const trimmed = String(raw || '').trim()
  if (!/^otpauth:\/\//i.test(trimmed)) {
    return { secret: trimmed, account: '', issuer: '' }
  }
  try {
    const url = new URL(trimmed)
    const typeName = url.hostname.toLowerCase()
    let account = decodeURIComponent(url.pathname.replace(/^\//, ''))
    let issuer = (url.searchParams.get('issuer') || '').replace(/\+/g, ' ')
    const splitAt = account.indexOf(':')
    if (splitAt !== -1) {
      if (!issuer) issuer = account.slice(0, splitAt)
      account = account.slice(splitAt + 1)
    }
    const period = Number(url.searchParams.get('period'))
    const digits = Number(url.searchParams.get('digits'))
    const counter = Number(url.searchParams.get('counter'))
    const type: TotpType = typeName === 'hotp' || typeName === 'steam' ? typeName : 'totp'
    return {
      secret: url.searchParams.get('secret') || '',
      account: account.trim(),
      issuer: issuer.trim(),
      type,
      period: Number.isInteger(period) && period > 0 ? period : undefined,
      digits: digits === 8 ? 8 : (digits === 6 ? 6 : undefined),
      algorithm: url.searchParams.get('algorithm') ? normalizeAlgorithm(url.searchParams.get('algorithm')) : undefined,
      counter: Number.isInteger(counter) && counter >= 0 ? counter : undefined,
    }
  } catch {
    return { secret: trimmed, account: '', issuer: '' }
  }
}

export function setupLink(entry: TotpEntry): string {
  const label = entry.issuer ? `${entry.issuer}:${entry.account}` : entry.account
  const type = entry.type === 'hotp' ? 'hotp' : 'totp'
  const params = new URLSearchParams()
  params.set('secret', entry.secret)
  if (entry.issuer) params.set('issuer', entry.issuer.split('::')[0])
  if (type === 'hotp') params.set('counter', String(entry.counter || 0))
  if (type === 'totp' && entry.period && entry.period !== 30) params.set('period', String(entry.period))
  if (entry.digits === 8) params.set('digits', '8')
  if (entry.algorithm && entry.algorithm !== 'SHA-1') params.set('algorithm', entry.algorithm)
  return `otpauth://${type}/${encodeURIComponent(label)}?${params.toString()}`
}

export function nextTotpIndex(list: TotpEntry[]): number {
  return list.reduce((max, entry) => Math.max(max, entry.index || 0), 0) + 1
}

export function sortedTotp(list: TotpEntry[]): TotpEntry[] {
  return list.slice().sort((a, b) => (
    (a.index || 0) - (b.index || 0) || (a.issuer || a.account).localeCompare(b.issuer || b.account)
  ))
}

function secretEncoding(secret: string) {
  const base32 = /^[A-Z2-7]+=*$/i.test(secret)
  const hex = /^[0-9a-f]+$/i.test(secret)
  if (!base32 && hex) return 'hex' as const
  if (!decodeBase32(secret)) return null
  return 'base32' as const
}

export function buildTotpEntry(input: TotpInput): TotpEntry {
  const parsed = parseOtpauth(input.secretRaw)
  const account = String(input.account || '').trim() || parsed.account || ''
  const issuer = String(input.issuer || '').trim() || parsed.issuer || ''
  const secret = String(parsed.secret || '').replace(/\s+/g, '')
  const encoding = secretEncoding(secret)
  if (!encoding) throw new Error('Enter a valid 2FA secret.')
  if (!account && !issuer) throw new Error('An account name or issuer is required.')
  const type = parsed.type || input.type || 'totp'
  const period = parsed.period || Number(input.period)
  const digits = parsed.digits || Number(input.digits)
  const counter = parsed.counter !== undefined ? parsed.counter : Number(input.counter)
  return normalizeTotp({
    id: input.existing?.id,
    account,
    issuer,
    secret: encoding === 'hex' ? secret.toLowerCase() : secret.toUpperCase(),
    type: type === 'hotp' || type === 'steam' ? type : 'totp',
    encoding,
    period: Number.isInteger(period) && period > 0 ? period : 30,
    digits: digits === 8 ? 8 : 6,
    algorithm: normalizeAlgorithm(parsed.algorithm || input.algorithm),
    counter: Number.isInteger(counter) && counter >= 0 ? counter : 0,
    pinned: input.existing?.pinned || false,
    index: input.existing ? input.existing.index : input.index,
    updatedAt: new Date().toISOString(),
  }, input.index || 0)
}

function totpKey(entry: Pick<TotpEntry, 'secret' | 'issuer' | 'account'>): string {
  return [entry.secret, entry.issuer, entry.account].join('\n').toLowerCase()
}

export function extractOtpauthUrls(text: string): string[] {
  const matches = String(text || '').match(/otpauth:\/\/\S+/gi) || []
  return matches.map((url) => url.replace(/[),.;]+$/g, ''))
}

function organizeTotp(list: TotpEntry[]): TotpEntry[] {
  const pinned = list.filter((entry) => entry.pinned).sort((a, b) => (a.index || 0) - (b.index || 0))
  const rest = list.filter((entry) => !entry.pinned).sort((a, b) => {
    const byIssuer = (a.issuer || '').localeCompare(b.issuer || '', undefined, { sensitivity: 'base' })
    if (byIssuer) return byIssuer
    return (a.account || '').localeCompare(b.account || '', undefined, { sensitivity: 'base' })
  })
  return pinned.concat(rest).map((entry, index) => ({ ...entry, index }))
}

export function planImport(text: string, existing: TotpEntry[]): { error: string } | { entries: TotpEntry[]; summary: string } {
  const urls = extractOtpauthUrls(text)
  if (!urls.length) return { error: 'Paste at least one otpauth:// link.' }
  const seen = new Set(existing.map(totpKey))
  const added: TotpEntry[] = []
  let duplicates = 0
  let invalid = 0
  for (const url of urls) {
    try {
      const entry = buildTotpEntry({ secretRaw: url, account: '', issuer: '', index: 0 })
      const key = totpKey(entry)
      if (seen.has(key)) {
        duplicates += 1
        continue
      }
      seen.add(key)
      added.push(entry)
    } catch {
      invalid += 1
    }
  }
  if (!added.length) {
    return { error: invalid ? 'None of those links could be imported.' : 'Those accounts are already in the vault.' }
  }
  const notes = [`Imported ${added.length} ${added.length === 1 ? 'account.' : 'accounts.'}`]
  if (duplicates) notes.push(`Skipped ${duplicates} ${duplicates === 1 ? 'duplicate.' : 'duplicates.'}`)
  if (invalid) notes.push(`Skipped ${invalid} ${invalid === 1 ? 'invalid link.' : 'invalid links.'}`)
  return {
    entries: organizeTotp(existing.concat(added)),
    summary: notes.join(' '),
  }
}

export async function readQrImage(file: File): Promise<string> {
  const detectorCtor = (window as unknown as {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>>
    }
  }).BarcodeDetector
  if (!detectorCtor) {
    throw new Error('This browser cannot read QR images. Paste the otpauth link instead.')
  }
  const detector = new detectorCtor({ formats: ['qr_code'] })
  const bitmap = await createImageBitmap(file)
  try {
    const codes = await detector.detect(bitmap)
    const value = codes.find((code) => code.rawValue?.startsWith('otpauth://'))?.rawValue
    if (!value) throw new Error('No otpauth QR code was found in that image.')
    return value
  } finally {
    bitmap.close()
  }
}
