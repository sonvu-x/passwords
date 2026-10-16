const ITERATIONS = 600000;
const IDLE_MS = 5 * 60 * 1000;
const VAULT_FILE = "vault.json";
const TOKEN_KEY = "vault.token";
const GIST_KEY = "vault.gistId";

let token = "";
let gistId = "";
let masterPassword = "";
let entries = [];
let savedCiphertext = "";
let vaultMode = "vault";
let editingId = "";
let session = 0;
let connection = 0;
let idleTimer = 0;
let statusTimer = 0;

function bytesToB64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function b64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVault(password, entryList) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify({ entries: entryList }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    v: 1,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS,
      salt: bytesToB64(salt),
    },
    cipher: {
      name: "AES-GCM",
      iv: bytesToB64(iv),
      data: bytesToB64(new Uint8Array(encrypted)),
    },
  };
}

async function decryptVault(password, payload) {
  if (!payload || payload.v !== 1 || !payload.kdf || !payload.cipher) {
    throw new Error("Unsupported vault.");
  }
  if (payload.kdf.name !== "PBKDF2" || payload.kdf.hash !== "SHA-256" || payload.cipher.name !== "AES-GCM") {
    throw new Error("Unsupported vault.");
  }
  const iterations = payload.kdf.iterations;
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
    throw new Error("Unsupported vault.");
  }
  const salt = b64ToBytes(payload.kdf.salt);
  const iv = b64ToBytes(payload.cipher.iv);
  const data = b64ToBytes(payload.cipher.data);
  if (salt.length < 16 || iv.length !== 12) {
    throw new Error("Unsupported vault.");
  }
  const key = await deriveKey(password, salt, iterations);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  } catch (error) {
    throw new Error("Wrong password.");
  }
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error("Damaged vault.");
  }
  return parsed.entries.map(normalizeEntry);
}

function normalizeEntry(entry) {
  return {
    id: String(entry.id || crypto.randomUUID()),
    title: String(entry.title || ""),
    username: String(entry.username || ""),
    password: String(entry.password || ""),
    url: String(entry.url || ""),
    notes: String(entry.notes || ""),
    updatedAt: String(entry.updatedAt || ""),
  };
}

function inspectCiphertext(content) {
  const trimmed = content.trim();
  if (!trimmed || trimmed === "{}" || trimmed === "null") return "empty";
  try {
    const payload = JSON.parse(trimmed);
    if (payload && payload.v === 1 && payload.kdf && payload.cipher) return "vault";
  } catch (error) {
    return "unrecognized";
  }
  return "unrecognized";
}

function parseGistId(value) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch (error) {
    return trimmed;
  }
}

function explainGitHubError(error) {
  const message = error && error.message ? error.message : "Request failed.";
  if (/bad credentials/i.test(message)) {
    return "GitHub rejected the token. Check that it has the gist scope.";
  }
  if (/not found/i.test(message)) {
    return "Gist not found. Check the id and that this token can read it.";
  }
  return message;
}

async function gistRequest(path, options, authToken) {
  const response = await fetch("https://api.github.com" + path, {
    method: options && options.method ? options.method : "GET",
    body: options && options.body ? options.body : undefined,
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + (authToken || token),
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options && options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = null;
    }
  }
  if (!response.ok) {
    const message = data && data.message ? data.message : response.statusText;
    throw new Error(message);
  }
  return data;
}

async function loadCiphertext() {
  const gist = await gistRequest("/gists/" + encodeURIComponent(gistId));
  const file = gist.files && gist.files[VAULT_FILE];
  if (!file || !file.size) return "";
  if (file.truncated) {
    const response = await fetch(file.raw_url, {
      cache: "no-store",
      credentials: "omit",
      headers: { Authorization: "Bearer " + token },
    });
    if (!response.ok) throw new Error("Could not read the full gist file.");
    return response.text();
  }
  return file.content || "";
}

async function persist(nextEntries) {
  const connectionAtStart = connection;
  const sessionAtStart = session;
  const password = masterPassword;
  const gistAtStart = gistId;
  const tokenAtStart = token;
  if (!password) throw new Error("The vault is locked.");
  setStatus("Saving…");
  const content = JSON.stringify(await encryptVault(password, nextEntries), null, 2);
  if (connectionAtStart !== connection) return;
  await gistRequest("/gists/" + encodeURIComponent(gistAtStart), {
    method: "PATCH",
    body: JSON.stringify({
      files: {
        [VAULT_FILE]: { content },
      },
    }),
  }, tokenAtStart);
  if (connectionAtStart !== connection) return;
  savedCiphertext = content;
  if (sessionAtStart !== session) return;
  entries = nextEntries;
  setStatus("Saved.");
  renderEntries();
}

function showView(name) {
  for (const id of ["connect-view", "lock-view", "vault-view"]) {
    document.getElementById(id).hidden = id !== name;
  }
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function setStatus(text) {
  setText("vault-status", text);
  clearTimeout(statusTimer);
  if (text === "Saved.") {
    statusTimer = setTimeout(() => {
      if (document.getElementById("vault-status").textContent === "Saved.") {
        setText("vault-status", "");
      }
    }, 2500);
  }
}

function clearSecrets() {
  session += 1;
  clearTimeout(idleTimer);
  masterPassword = "";
  entries = [];
  editingId = "";
  const editor = document.getElementById("editor");
  if (editor.open) editor.close();
  clearEditor();
  document.getElementById("entry-list").replaceChildren();
  document.getElementById("search-input").value = "";
  setStatus("");
  setText("vault-error", "");
  setText("vault-meta", "");
}

function lock() {
  clearSecrets();
  configureLock("vault");
}

function bumpIdle() {
  if (document.getElementById("vault-view").hidden) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lock, IDLE_MS);
}

function showConnect() {
  connection += 1;
  clearSecrets();
  savedCiphertext = "";
  const savedToken = localStorage.getItem(TOKEN_KEY) || "";
  const savedGist = localStorage.getItem(GIST_KEY) || "";
  document.getElementById("token-input").value = "";
  document.getElementById("gist-input").value = savedGist;
  document.getElementById("token-note").hidden = !savedToken;
  document.getElementById("forget-button").hidden = !savedToken;
  setText("connect-error", "");
  showView("connect-view");
}

function configureLock(mode, content) {
  vaultMode = mode;
  if (typeof content === "string") savedCiphertext = content;
  const creating = mode !== "vault";
  document.getElementById("confirm-label").hidden = !creating;
  document.getElementById("replace-label").hidden = mode !== "unrecognized";
  document.getElementById("replace-confirm").checked = false;
  document.getElementById("confirm-password").required = creating;
  document.getElementById("master-password").value = "";
  document.getElementById("confirm-password").value = "";
  document.getElementById("master-password").autocomplete = creating ? "new-password" : "current-password";
  setText("lock-error", "");
  if (mode === "empty") {
    setText("lock-title", "Create vault");
    setText("lock-help", "Choose a master password. It cannot be recovered if you forget it.");
    setText("unlock-button", "Create vault");
  } else if (mode === "unrecognized") {
    setText("lock-title", "Replace file");
    setText("lock-help", "vault.json is not an encrypted vault. Creating one replaces that file.");
    setText("unlock-button", "Create vault");
  } else {
    setText("lock-title", "Unlock");
    setText("lock-help", "The master password decrypts this gist in your browser. It is never sent to GitHub.");
    setText("unlock-button", "Unlock");
  }
  showView("lock-view");
  document.getElementById("master-password").focus();
}

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function renderEntries() {
  const list = document.getElementById("entry-list");
  const query = document.getElementById("search-input").value.trim().toLowerCase();
  const visible = entries
    .filter((entry) => {
      const haystack = [entry.title, entry.username, entry.url, entry.notes].join("\n").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  list.replaceChildren();
  setText("vault-meta", gistId + " · " + entries.length + (entries.length === 1 ? " entry" : " entries"));

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = entries.length ? "No matching entries." : "No passwords yet.";
    list.append(empty);
    return;
  }

  for (const entry of visible) {
    const row = document.createElement("div");
    row.className = "entry-row";

    const open = document.createElement("button");
    open.type = "button";
    open.className = "entry";
    const title = document.createElement("strong");
    title.textContent = entry.title || "Untitled";
    const meta = document.createElement("span");
    const details = [entry.username, entry.url, formatWhen(entry.updatedAt)].filter(Boolean);
    meta.textContent = details.join(" · ");
    open.append(title, meta);
    open.addEventListener("click", () => openEditor(entry));

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(entry.password);
        copy.textContent = "Copied";
        setTimeout(() => {
          copy.textContent = "Copy";
        }, 1500);
      } catch (error) {
        setText("vault-error", "Could not copy the password.");
      }
    });

    row.append(open, copy);
    list.append(row);
  }
}

function clearEditor() {
  document.getElementById("editor-form").reset();
  document.getElementById("entry-password").type = "password";
  document.getElementById("reveal-button").textContent = "Show";
  document.getElementById("copy-button").textContent = "Copy";
}

function openEditor(entry) {
  clearEditor();
  editingId = entry ? entry.id : "";
  setText("editor-title", entry ? "Edit entry" : "New entry");
  document.getElementById("delete-button").hidden = !entry;
  if (entry) {
    document.getElementById("entry-title").value = entry.title;
    document.getElementById("entry-username").value = entry.username;
    document.getElementById("entry-password").value = entry.password;
    document.getElementById("entry-url").value = entry.url;
    document.getElementById("entry-notes").value = entry.notes;
  }
  document.getElementById("editor").showModal();
  document.getElementById("entry-title").focus();
}

function readEditor() {
  return {
    id: editingId || crypto.randomUUID(),
    title: document.getElementById("entry-title").value.trim(),
    username: document.getElementById("entry-username").value.trim(),
    password: document.getElementById("entry-password").value,
    url: document.getElementById("entry-url").value.trim(),
    notes: document.getElementById("entry-notes").value,
    updatedAt: new Date().toISOString(),
  };
}

function showVault() {
  setText("vault-error", "");
  showView("vault-view");
  renderEntries();
  bumpIdle();
  document.getElementById("search-input").focus();
}

async function onConnect(event) {
  event.preventDefault();
  setText("connect-error", "");
  if (!crypto.subtle) {
    setText("connect-error", "Open this page from localhost or HTTPS. This address cannot encrypt.");
    return;
  }
  const typedToken = document.getElementById("token-input").value.trim();
  const nextToken = typedToken || localStorage.getItem(TOKEN_KEY) || "";
  const nextGist = parseGistId(document.getElementById("gist-input").value);
  if (!nextToken || !nextGist) {
    setText("connect-error", "A token and a gist id are both required.");
    return;
  }
  token = nextToken;
  gistId = nextGist;
  const button = event.submitter || event.target.querySelector("button");
  button.disabled = true;
  try {
    const content = await loadCiphertext();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(GIST_KEY, gistId);
    document.getElementById("token-input").value = "";
    configureLock(inspectCiphertext(content), content);
  } catch (error) {
    token = "";
    setText("connect-error", explainGitHubError(error));
  } finally {
    button.disabled = false;
  }
}

async function onUnlock(event) {
  event.preventDefault();
  setText("lock-error", "");
  const password = document.getElementById("master-password").value;
  const button = document.getElementById("unlock-button");
  button.disabled = true;
  button.textContent = vaultMode === "vault" ? "Unlocking…" : "Creating…";
  try {
    if (vaultMode === "vault") {
      const payload = JSON.parse(savedCiphertext);
      entries = await decryptVault(password, payload);
      masterPassword = password;
    } else {
      if (password.length < 8) throw new Error("Use at least 8 characters.");
      if (password !== document.getElementById("confirm-password").value) {
        throw new Error("Passwords do not match.");
      }
      if (vaultMode === "unrecognized" && !document.getElementById("replace-confirm").checked) {
        throw new Error("Confirm that the current file should be replaced.");
      }
      masterPassword = password;
      try {
        await persist([]);
      } catch (error) {
        masterPassword = "";
        throw error;
      }
      entries = [];
    }
    document.getElementById("master-password").value = "";
    document.getElementById("confirm-password").value = "";
    showVault();
  } catch (error) {
    const message = error && error.message ? error.message : "Could not unlock the vault.";
    if (message === "Wrong password." || message === "Damaged vault.") {
      setText("lock-error", "Wrong password, or the gist file is damaged.");
    } else {
      setText("lock-error", explainGitHubError(error));
    }
  } finally {
    button.disabled = false;
    setText("unlock-button", vaultMode === "vault" ? "Unlock" : "Create vault");
  }
}

async function onEditorSubmit(event) {
  event.preventDefault();
  setText("vault-error", "");
  const draft = readEditor();
  const next = editingId
    ? entries.map((entry) => (entry.id === editingId ? draft : entry))
    : entries.concat([draft]);
  const button = event.submitter || event.target.querySelector("button.primary");
  button.disabled = true;
  try {
    await persist(next);
    document.getElementById("editor").close();
    clearEditor();
    editingId = "";
  } catch (error) {
    setText("vault-error", explainGitHubError(error));
  } finally {
    button.disabled = false;
  }
}

async function onDelete() {
  if (!editingId) return;
  if (!confirm("Delete this entry?")) return;
  setText("vault-error", "");
  const next = entries.filter((entry) => entry.id !== editingId);
  try {
    await persist(next);
    document.getElementById("editor").close();
    clearEditor();
    editingId = "";
  } catch (error) {
    setText("vault-error", explainGitHubError(error));
  }
}

function downloadBackup() {
  if (!savedCiphertext) {
    setText("vault-error", "Nothing has been saved to the gist yet.");
    return;
  }
  const blob = new Blob([savedCiphertext], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = VAULT_FILE;
  link.click();
  URL.revokeObjectURL(url);
}

function boot() {
  document.getElementById("connect-form").addEventListener("submit", onConnect);
  document.getElementById("lock-form").addEventListener("submit", onUnlock);
  document.getElementById("editor-form").addEventListener("submit", onEditorSubmit);
  document.getElementById("forget-button").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GIST_KEY);
    token = "";
    gistId = "";
    showConnect();
  });
  document.getElementById("change-connection").addEventListener("click", showConnect);
  document.getElementById("lock-button").addEventListener("click", lock);
  document.getElementById("new-button").addEventListener("click", () => openEditor(null));
  document.getElementById("backup-button").addEventListener("click", downloadBackup);
  document.getElementById("search-input").addEventListener("input", renderEntries);
  document.getElementById("cancel-button").addEventListener("click", () => {
    document.getElementById("editor").close();
    clearEditor();
  });
  document.getElementById("delete-button").addEventListener("click", onDelete);
  document.getElementById("reveal-button").addEventListener("click", () => {
    const input = document.getElementById("entry-password");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    document.getElementById("reveal-button").textContent = showing ? "Show" : "Hide";
  });
  document.getElementById("copy-button").addEventListener("click", async () => {
    const button = document.getElementById("copy-button");
    try {
      await navigator.clipboard.writeText(document.getElementById("entry-password").value);
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = "Copy";
      }, 1500);
    } catch (error) {
      setText("vault-error", "Could not copy the password.");
    }
  });

  for (const eventName of ["pointerdown", "keydown"]) {
    window.addEventListener(eventName, bumpIdle, true);
  }

  if (!crypto.subtle) {
    setText("connect-error", "Open this page from localhost or HTTPS. This address cannot encrypt.");
  }

  const savedToken = localStorage.getItem(TOKEN_KEY) || "";
  const savedGist = localStorage.getItem(GIST_KEY) || "";
  if (savedToken && savedGist) {
    token = savedToken;
    gistId = savedGist;
    loadCiphertext()
      .then((content) => configureLock(inspectCiphertext(content), content))
      .catch((error) => {
        token = "";
        showConnect();
        setText("connect-error", explainGitHubError(error));
      });
    return;
  }
  showConnect();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", boot);
}
