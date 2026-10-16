# Gist-backed password vault

A static page that stores passwords in one secret GitHub Gist. The master password encrypts the vault in the browser with PBKDF2-SHA-256 and AES-GCM. GitHub only receives ciphertext.

There is no server and no database. Losing the master password means the vault cannot be recovered.

## Create a token

1. Open GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).
2. Generate a token with only the `gist` scope.
3. Copy it. Paste it into the page when asked. The token is stored in this browser's `localStorage` and is not part of this repo.

## Create a secret gist

1. Open [gist.github.com](https://gist.github.com) and create a secret gist.
2. Name the file `vault.json`. The contents can be `{}`.
3. Copy the gist id from the URL. It is the long id at the end, not the GitHub username.

## Open the page

Encryption and the GitHub API need `localhost` or HTTPS. Opening the file directly will not work.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

To publish it, turn on GitHub Pages for this folder. The page itself contains no passwords, token, or gist id.

## Use it

1. Enter the token and gist id.
2. Choose a master password the first time (at least 8 characters).
3. Add, edit, search, reveal, or copy entries. Each save re-encrypts the vault and updates `vault.json`.
4. The vault locks after 5 minutes without a click or keypress.
5. Backup downloads the encrypted file that is already stored in the gist.

Anyone with the gist URL can download the file. They cannot read it without the master password. A stolen token can change or delete the gist, so keep a backup.
