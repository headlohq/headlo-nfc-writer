# Contributing to Headlo NFC Writer

Two ways to contribute. Hardware support and protocol changes are the most impactful.

---

## Path 1 — Add Hardware Support

The most common contribution. Test with a new NFC reader or chip type and document whether it works.

**Tested readers:**
- ACR1252U — confirmed working on Windows and macOS
- ACR122U — confirmed working on Windows

If you have a different PC/SC-compatible reader, test it and open a PR adding it to this list with:
- Reader model and chipset
- OS tested on
- Any driver or configuration required
- Whether `detect.mjs` correctly identifies the chip UID

**NFC chip types:**

| Chip | Write tested | Notes |
|---|---|---|
| NTAG213 | Yes | 144 bytes, most common |
| NTAG215 | Yes | 504 bytes |
| NTAG216 | Yes | 888 bytes |
| MIFARE Classic 1K | Partial | Read works; write requires key auth |

If you test a chip type not listed, open a PR updating this table.

---

## Path 2 — Bug Reports and Fixes

**Before opening an issue:**

1. Run `node detect.mjs` — this lists all readers PC/SC can see. If your reader isn't listed, the problem is a driver issue, not this software.
2. Set `DEBUG_MODE=true` in `.env` — this skips the already-written and chip-claimed checks, which catches most write failures in dev.
3. Check that your `HEADLO_SIGNER_KEY` starts with `hdl_sk_` — the write endpoint will reject any other format.

**Good bug report includes:**
- OS and Node version (`node --version`)
- Reader model
- Output of `node detect.mjs`
- Full error from `server.mjs` stdout (not just the browser error)

---

## Local Development

```bash
git clone https://github.com/headlohq/headlo-nfc-writer
cd headlo-nfc-writer
npm install
cp .env.example .env
# Set HEADLO_SIGNER_KEY in .env
node server.mjs
```

Test the write endpoint directly:

```bash
curl -X POST http://localhost:3000/write \
  -H "Content-Type: application/json" \
  -d '{"serial":"TEST-001","model":"Test Item","condition":"New","note":"","api_key":"hdl_sk_..."}'
```

Set `DEBUG_MODE=true` to skip chip-claimed checks during local testing.

**Building the binary:**

```bash
npm run build:win    # Windows .exe
npm run build:mac    # macOS binary
```

Requires `@yao-pkg/pkg` (already in devDependencies) and the native `@pokusew/pcsclite` addon built for your platform.

---

## What Not to Submit

- Changes that add a dependency on Headlo's cloud API beyond the existing `/v1/nfc/write` call — the writer is intentionally a thin local process
- Reader-specific workarounds baked into the main write path — use the `DEBUG_MODE` flag instead
- Windows-only or macOS-only code without a clear note that the other platform is untested

---

## License

By contributing you agree that your changes are licensed under the same [Elastic License 2.0](../LICENSE) as the rest of the project.
