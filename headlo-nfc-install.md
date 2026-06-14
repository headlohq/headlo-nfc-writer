# Headlo NFC Writer — Setup

## Hardware

**ACR1252U USB NFC Reader III** (NFC Forum–Certified)
- Install driver from ACS website before proceeding
- Any USB NFC reader that supports PC/SC (the OS-level smart card standard) works — ACR122U, ACR1252U, etc.

---

## Option A — Pre-built binary (recommended for production)

Download the pre-built binary from the NFC Config page in the Headlo Signer Dashboard (Windows `.exe` or macOS binary). No Node.js or build tools required.

Place a `.env` file in the same folder as the binary:

```
HEADLO_SIGNER_KEY=hdl_sk_...
NFC_SERVER_NAME=My NFC Station
```

Run it:
- **Windows:** double-click `headlo-nfc-writer.exe` or run from terminal
- **macOS:** `chmod +x headlo-nfc-writer-mac && ./headlo-nfc-writer-mac`

See `BINARY-RELEASE.md` for how to build and publish new releases from source.

---

## Option B — Run from source (development)

### Why native build tools are needed

`nfc-pcsc` (the Node.js PC/SC library) compiles a native C++ addon to talk to the Windows Smart Card API. No pre-built binary exists — it must compile on your machine.

### Problem: VS Insiders not recognized

If you have **Visual Studio 18 Insiders** (Preview), node-gyp will fail with:

```
unknown version "undefined" found at "C:\Program Files\Microsoft Visual Studio\18\Insiders"
could not find a version of Visual Studio 2017 or newer to use
```

node-gyp only recognizes VS versions 15–17 (VS 2017–2022 stable). Version 18 is the Insiders/Preview track and is not detected.

### Fix: install VS Build Tools 2022 (stable)

Run in **admin PowerShell**:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --quiet --wait"
```

- Downloads and installs only the C++ compiler workload (~3GB)
- No full IDE — just the compiler node-gyp needs
- Takes 5–10 minutes

### Install and run

```powershell
cd d:\headlo\headlo-repo\nfc-writer
npm install
node server.mjs
```

`npm install` compiles the native `.node` file for your platform. Should succeed once VS Build Tools 2022 is installed.

Configure via `.env` in the `nfc-writer/` directory or via `../headlo-worker/.dev.vars` (loaded automatically in dev).

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `HEADLO_SIGNER_KEY` | — | `hdl_sk_...` API key; required for chip registration |
| `VITE_HEADLO_API_URL` | `http://127.0.0.1:8787` | Worker API base URL |
| `WEB_APP_URL` | — | Verify URL base; if set and not localhost, used instead of API base |
| `NFC_SERVER_NAME` | `NFC Server` | Display name shown in dashboard NFC status badge |
| `TLS_CERT` / `TLS_KEY` | — | Paths to TLS cert/key for HTTPS (required for Tailscale) |
| `DEBUG_MODE` | `false` | If `true`, skips already-written + chip-claimed checks |

---

## Server endpoints

### `GET /status`
Health check. Returns `{ ok, reader, name }`. Dashboard polls this to show the NFC server status badge.

### `POST /write`
Write an NFC tag. Blocks until card placed, written, and removed.

Request body:
```json
{
  "serial": "RLX-116610LN",
  "model": "Rolex Submariner 116610LN",
  "condition": "Excellent",
  "note": "",
  "api_key": "hdl_sk_..."
}
```

Response:
```json
{ "ok": true, "code": "RLX-116610LN", "url": "https://headlo.com/verify/RLX-116610LN", "chip_uid": "04A3F21B", "skipped": false }
```

The tag URL is written as `{verify_base}/verify/{code}?uid={chip_uid}`. The `?uid` param is required for genesis validation — taps without a matching uid are silently dropped by the server.

After writing, the server calls `POST /v1/signer/objects` to register the chip UID against the object code in the DB.
