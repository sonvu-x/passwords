export const VAULT_FILE = 'vault.json'
export const TOKEN_KEY = 'vault.token'
export const GIST_KEY = 'vault.gistId'

type GistFile = {
  size?: number
  truncated?: boolean
  raw_url?: string
  content?: string | null
}

type GistResponse = {
  message?: string
  files?: Record<string, GistFile | null>
}

export function parseGistId(value: string): string {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] || ''
  } catch {
    return trimmed
  }
}

export function explainGitHubError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Request failed.'
  if (/bad credentials/i.test(message)) {
    return 'GitHub rejected the token. Check that it has the gist scope.'
  }
  if (/not found/i.test(message)) {
    return 'Gist not found. Check the id and that this token can read it.'
  }
  return message
}

async function gistRequest(path: string, token: string, options?: { method?: string; body?: string }) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options?.method ?? 'GET',
    body: options?.body,
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const text = await response.text()
  let data: GistResponse | null = null
  if (text) {
    try {
      data = JSON.parse(text) as GistResponse
    } catch {
      data = null
    }
  }
  if (!response.ok) {
    throw new Error(data?.message || response.statusText)
  }
  return data
}

export async function loadCiphertext(gistId: string, token: string): Promise<string> {
  const gist = await gistRequest(`/gists/${encodeURIComponent(gistId)}`, token)
  const file = gist?.files?.[VAULT_FILE]
  if (!file?.size) return ''
  if (file.truncated) {
    const response = await fetch(file.raw_url || '', {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error('Could not read the full gist file.')
    return response.text()
  }
  return file.content || ''
}

export async function saveCiphertext(gistId: string, token: string, content: string) {
  await gistRequest(`/gists/${encodeURIComponent(gistId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      files: {
        [VAULT_FILE]: { content },
      },
    }),
  })
}
