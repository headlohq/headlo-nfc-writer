# headlo-nfc-writer

Local NFC tag writer for the Headlo Signer network. Runs as a small HTTP server on your machine, talks to a USB NFC reader via PC/SC, and writes verified object codes to NFC chips.

## Quickstart

**Pre-built binary (recommended)**

Download from the NFC Config page in your Headlo Signer Dashboard. Place a `.env` next to the binary:

```
HEADLO_SIGNER_KEY=hdl_sk_...
NFC_SERVER_NAME=My NFC Station
```

- **Windows:** run `headlo-nfc-writer.exe`
- **macOS:** `chmod +x headlo-nfc-writer-mac && ./headlo-nfc-writer-mac`

**From source**

```bash
npm install
node server.mjs
```

Requires Node 18+ and a PC/SC-compatible USB NFC reader (ACR122U, ACR1252U, etc.). On Windows you also need [VS Build Tools 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) for the native C++ addon.

## Configuration

Copy `.env.example` to `.env` and fill in your values:

| Variable | Required | Purpose |
|---|---|---|
| `HEADLO_SIGNER_KEY` | Yes | `hdl_sk_...` API key from Signer Dashboard |
| `NFC_SERVER_NAME` | No | Display name shown in the dashboard status badge |
| `VITE_HEADLO_API_URL` | No | Worker API base (default: `http://127.0.0.1:8787`) |
| `WEB_APP_URL` | No | Verify URL base; overrides API base when set and non-localhost |
| `TLS_CERT` / `TLS_KEY` | No | Paths to TLS cert/key for HTTPS (required for Tailscale) |
| `DEBUG_MODE` | No | Set `true` to skip already-written and chip-claimed checks |

## Hardware

Any USB NFC reader that supports PC/SC works. Tested with the ACR1252U. Install the ACS driver before first use.

## API

`GET /status` — health check, returns `{ ok, reader, name }`

`POST /write` — write a tag (blocks until card placed, written, removed)

```json
{
  "serial": "RLX-116610LN",
  "model": "Rolex Submariner 116610LN",
  "condition": "Excellent",
  "note": "",
  "api_key": "hdl_sk_..."
}
```

See `headlo-nfc-install.md` for detailed setup, build instructions, and troubleshooting.

## License

MIT — © Headlo Team
