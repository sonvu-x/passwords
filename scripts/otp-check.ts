import { normalizeTotp, type TotpEntry } from '../src/lib/crypto'
import { otpCode, planImport } from '../src/lib/otp'

const sha1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

function account(partial: Partial<TotpEntry>): TotpEntry {
  return normalizeTotp({
    secret: sha1,
    account: 'ada',
    issuer: 'Test',
    type: 'totp',
    encoding: 'base32',
    period: 30,
    digits: 6,
    algorithm: 'SHA-1',
    counter: 0,
    ...partial,
  })
}

const cases: Array<[number, string, Partial<TotpEntry>]> = [
  [59, '287082', { digits: 6 }],
  [1111111109, '081804', { digits: 6 }],
  [1111111111, '050471', { digits: 6 }],
  [1234567890, '005924', { digits: 6 }],
  [2000000000, '279037', { digits: 6 }],
  [20000000000, '353130', { digits: 6 }],
  [59, '94287082', { digits: 8 }],
]

for (const [seconds, expected, extra] of cases) {
  const result = await otpCode(account(extra), seconds * 1000)
  if (result?.code !== expected) throw new Error(`t=${seconds} expected ${expected} got ${result?.code}`)
}

function asciiHex(value: string) {
  return [...new TextEncoder().encode(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const sha256Secret = asciiHex('12345678901234567890123456789012')
const sha256 = await otpCode(account({
  secret: sha256Secret,
  encoding: 'hex',
  algorithm: 'SHA-256',
  digits: 8,
}), 59 * 1000)
if (sha256?.code !== '46119246') throw new Error(`sha256 got ${sha256?.code}`)

const sha512Secret = asciiHex('1234567890123456789012345678901234567890123456789012345678901234')
const sha512 = await otpCode(account({
  secret: sha512Secret,
  encoding: 'hex',
  algorithm: 'SHA-512',
  digits: 8,
}), 59 * 1000)
if (sha512?.code !== '90693936') throw new Error(`sha512 got ${sha512?.code}`)

const hotp0 = await otpCode(account({ type: 'hotp', counter: 0 }), 0)
const hotp1 = await otpCode(account({ type: 'hotp', counter: 1 }), 0)
if (hotp0?.code !== '755224' || hotp1?.code !== '287082') {
  throw new Error(`hotp got ${hotp0?.code} ${hotp1?.code}`)
}

const existing = [account({ issuer: 'Apple', account: 'me', pinned: true, index: 0, secret: 'JBSWY3DPEHPK3PXP' })]
const pasted = [
  'otpauth://totp/Zoom:ada?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Zoom',
  'otpauth://totp/GitHub:ada?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  'otpauth://hotp/Bank:ada?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=3',
  'otpauth://totp/Broken:ada',
  'otpauth://totp/GitHub:ada?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
].join('\n')
const plan = planImport(pasted, existing)
if ('error' in plan) throw new Error(plan.error)
const names = plan.entries.map((entry) => `${entry.issuer}:${entry.account}${entry.pinned ? '*' : ''}`).join(',')
if (names !== 'Apple:me*,Bank:ada,GitHub:ada,Zoom:ada') throw new Error(names)
if (plan.summary !== 'Imported 3 accounts. Skipped 1 duplicate. Skipped 1 invalid link.') {
  throw new Error(plan.summary)
}

console.log('ok')
