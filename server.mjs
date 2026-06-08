import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { NFC } from 'nfc-pcsc'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'

// Load .env then ../headlo-worker/.dev.vars
// When running as a pkg binary, __dirname points into the snapshot; use exe dir instead
const _baseDir = process.pkg ? dirname(process.execPath) : import.meta.dirname
for (const p of ['.env', '../headlo-worker/.dev.vars']) {
  try {
    const raw = readFileSync(resolve(_baseDir, p), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch { /* skip */ }
}

const PORT       = 27153
const API        = process.env.HEADLO_API ?? process.env.VITE_HEADLO_API_URL ?? 'http://127.0.0.1:8787'
const WEB_APP    = process.env.WEB_APP_URL ?? ''
const VERIFY_BASE = WEB_APP && !WEB_APP.includes('localhost') ? WEB_APP : API
const API_KEY    = process.env.HEADLO_SIGNER_KEY ?? ''
const DEBUG_MODE  = process.env.DEBUG_MODE === 'true'
const SERVER_NAME = process.env.NFC_SERVER_NAME ?? 'NFC Server'
const TLS_CERT    = process.env.TLS_CERT ?? ''
const TLS_KEY     = process.env.TLS_KEY  ?? ''

let nfcReader = null
let cardPresent = false
let cardOffResolvers = []

const nfc = new NFC()
nfc.on('reader', reader => {
  nfcReader = reader
  console.log(`[nfc] Reader connected: ${reader.name}`)
  reader.on('card', () => { cardPresent = true })
  reader.on('card.off', () => {
    cardPresent = false
    console.log('[nfc] Card removed')
    const cbs = cardOffResolvers.splice(0)
    cbs.forEach(fn => fn())
  })
  reader.on('end', () => { nfcReader = null; cardPresent = false; console.log('[nfc] Reader disconnected') })
  reader.on('error', () => { nfcReader = null; cardPresent = false })
})
nfc.on('error', err => console.error('[nfc] Error:', err.message))

function waitForCardOff(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!cardPresent) return resolve()
    const timer = setTimeout(() => reject(new Error('Timeout waiting for card removal')), timeoutMs)
    cardOffResolvers.push(() => { clearTimeout(timer); resolve() })
  })
}

function waitForCard(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!nfcReader) return reject(new Error('No reader connected'))
    const timer = setTimeout(() => reject(new Error('Timeout — no card placed within 20s')), timeoutMs)
    nfcReader.once('card', card => { clearTimeout(timer); resolve(card) })
  })
}

async function readUid() {
  try {
    const res = await nfcReader.transmit(Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]), 9)
    if (res.length >= 2 && res[res.length - 2] === 0x90 && res[res.length - 1] === 0x00)
      return res.slice(0, -2).toString('hex').toUpperCase()
  } catch { /* ignore */ }
  return null
}

function buildNdefUrl(url) {
  let prefix = 0x00, rest = url
  const prefixes = [
    [0x01, 'http://www.'], [0x02, 'https://www.'],
    [0x03, 'http://'],     [0x04, 'https://'],
  ]
  for (const [code, p] of prefixes) {
    if (url.startsWith(p)) { prefix = code; rest = url.slice(p.length); break }
  }
  const uriPayload = Buffer.concat([Buffer.from([prefix]), Buffer.from(rest, 'utf8')])
  const record = Buffer.concat([Buffer.from([0xD1, 0x01, uriPayload.length, 0x55]), uriPayload])
  const tlv    = Buffer.concat([Buffer.from([0x03, record.length]), record, Buffer.from([0xFE])])
  const padded = Buffer.alloc(Math.ceil(tlv.length / 4) * 4)
  tlv.copy(padded)
  return padded
}

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

async function handler(req, res) {
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Health check
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, reader: nfcReader?.name ?? null, name: SERVER_NAME }))
    return
  }

  if (req.method !== 'POST' || req.url !== '/write') {
    res.writeHead(404); res.end('Not found'); return
  }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    let serial, model, condition = 'Excellent', note = '', api_key = ''
    try { ({ serial, model, condition = 'Excellent', note = '', api_key = '' } = JSON.parse(body)) } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' })); return
    }

    if (!serial) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'serial required' })); return
    }

    const code = /^[A-Z0-9]{2,5}-/.test(serial) ? serial : `SN-${serial}`
    const url  = `${VERIFY_BASE}/verify/${code}`
    const effectiveKey = api_key || API_KEY

    if (effectiveKey && !DEBUG_MODE) {
      const statusRes = await fetch(`${API}/v1/signer/objects/${code}/status`, {
        headers: { Authorization: `Bearer ${effectiveKey}` },
      })
      const status = await statusRes.json()
      if (status.written) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: `${code} already written (chip: ${status.chip_uid}). Enable DEBUG_MODE to overwrite.` }))
        return
      }
    }

    console.log(`[write] Waiting for card — code=${code}`)

    try {
      await waitForCard()
      const chipUid = await readUid()
      if (chipUid) console.log(`[write] Chip UID: ${chipUid}`)

      if (chipUid && effectiveKey && !DEBUG_MODE) {
        const checkRes = await fetch(`${API}/v1/signer/chip-check?uid=${chipUid}`, {
          headers: { Authorization: `Bearer ${effectiveKey}` },
        })
        const check = await checkRes.json()
        console.log(`[write] Chip check — uid=${chipUid} claimed=${check.claimed} claimedBy=${check.code ?? 'none'} thisCode=${code}`)
        if (check.claimed && check.code !== code) {
          console.warn(`[write] Blocked — chip ${chipUid} already claimed by ${check.code}`)
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: `Card already claimed by ${check.code}` }))
          return
        }
      }

      const tagUrl = chipUid ? `${url}?uid=${chipUid}` : url
      await nfcReader.write(4, buildNdefUrl(tagUrl), 4)
      console.log(`[write] NFC write OK — remove card`)
      await waitForCardOff()
      console.log(`[write] Card removed — ready for next`)

      let apiResult = null
      if (effectiveKey) {
        const today = new Date().toISOString().slice(0, 10)
        console.log(`[write] Registering — code=${code} chip_uid=${chipUid ?? 'null'}`)
        const apiRes = await fetch(`${API}/v1/signer/objects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${effectiveKey}` },
          body: JSON.stringify({
            object_type: 'watch',
            objects: [{ code, name: model, physical_serial: serial.replace('SN-', ''), chip_uid: chipUid, chip_url: tagUrl, creator_note: { condition, note: note || null, authenticated_at: today } }],
          }),
        })
        apiResult = await apiRes.json()
        const skipped = apiResult?.skipped?.includes(code) ?? false
        console.log(`[write] API result — skipped=${skipped} provisioned=${apiResult?.provisioned ?? 0} chip_uid=${chipUid ?? 'null'}`)
        if (!skipped) console.log(`[write] ★ First write complete — ${code} · chip: ${chipUid}`)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, code, url, chip_uid: chipUid, skipped: apiResult?.skipped?.includes(code) ?? false }))
    } catch (e) {
      console.error('[write] Error:', e.message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: e.message }))
    }
  })
}

const useTls = TLS_CERT && TLS_KEY
const server = useTls
  ? createHttpsServer({ cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) }, handler)
  : createHttpServer(handler)

server.listen(PORT, '0.0.0.0', () => {
  const proto = useTls ? 'https' : 'http'
  console.log(`Headlo NFC Writer listening on ${proto}://0.0.0.0:${PORT}`)
  console.log(`API: ${API}`)
  console.log(`Verify base: ${VERIFY_BASE}`)
  console.log('Waiting for reader...')
})
