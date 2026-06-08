import { NFC } from 'nfc-pcsc'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env then ../headlo-worker/.dev.vars (later lines don't overwrite earlier ones)
for (const p of ['.env', '../headlo-worker/.dev.vars']) {
  try {
    const raw = readFileSync(resolve(import.meta.dirname, p), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch { /* file absent, skip */ }
}

const API        = process.env.HEADLO_API ?? process.env.VITE_HEADLO_API_URL ?? 'http://127.0.0.1:8787'
const WEB_APP    = process.env.WEB_APP_URL ?? ''
const VERIFY_BASE = WEB_APP && !WEB_APP.includes('localhost') ? WEB_APP : API
const API_KEY    = process.env.HEADLO_SIGNER_KEY ?? ''

// Parse args: --serial 8A43XX21 --model "Rolex Sub" --condition Excellent --note "Box and papers"
const args      = process.argv.slice(2)

function argVal(arr, flag) {
  const i = arr.indexOf(flag)
  return i !== -1 ? arr[i + 1] : null
}

const rawSerial = argVal(args, '--serial')
const model     = argVal(args, '--model') ?? 'Watch'
const condition = argVal(args, '--condition') ?? 'Excellent'
const note      = argVal(args, '--note') ?? ''

if (!rawSerial) {
  console.error('Usage: node write.mjs --serial <serial> [--model "Rolex Submariner"] [--condition Excellent] [--note "Box and papers"]')
  console.error('Example: node write.mjs --serial 8A43XX21 --model "Rolex Submariner 116610LN"')
  process.exit(1)
}

// Build code + URL from serial
const serial = rawSerial.startsWith('SN-') ? rawSerial.slice(3) : rawSerial
const code   = `SN-${serial}`
const url    = `${VERIFY_BASE}/verify/${code}`

const nfc = new NFC()
console.log(`URL:    ${url}`)
console.log(`Code:   ${code}`)
console.log(`Model:  ${model}`)
console.log(`API:    ${API}`)
console.log()
console.log('Place the metal card on the reader...')

nfc.on('reader', reader => {
  console.log(`Reader: ${reader.name}`)

  reader.on('card', async card => {
    console.log(`Card detected`)

    // Read chip UID via GET DATA APDU (FF CA 00 00 00)
    let chipUid = null
    try {
      const res = await reader.transmit(Buffer.from([0xFF, 0xCA, 0x00, 0x00, 0x00]), 9)
      if (res.length >= 2 && res[res.length - 2] === 0x90 && res[res.length - 1] === 0x00) {
        chipUid = res.slice(0, -2).toString('hex').toUpperCase()
        console.log(`Chip UID: ${chipUid}`)
      }
    } catch (e) {
      console.warn(`Could not read chip UID: ${e.message}`)
    }

    try {
      await reader.write(4, buildNdefUrl(url), 4)
      console.log(`✓ NFC write OK`)
    } catch (e) {
      console.error('NFC write failed:', e.message)
      process.exit(1)
    }

    // POST to API
    if (!API_KEY) {
      console.log('\n⚠  No HEADLO_SIGNER_KEY in .env — skipping API save.')
      console.log('   Create nfc-writer/.env with HEADLO_SIGNER_KEY=your_key')
    } else {
      try {
        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        const body = {
          batch_label: 'Authentications',
          objects: [{
            code,
            name: model,
            physical_serial: serial,
            chip_uid: chipUid,
            creator_note: `${condition}${note ? ` — ${note}` : ''}. Authenticated ${today}.`,
          }],
        }
        const res = await fetch(`${API}/v1/signer/objects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) {
          console.error('✗ API error:', JSON.stringify(d))
        } else if (d.skipped?.includes(code)) {
          console.log(`⚠  API: serial ${serial} already exists — tag written but record not duplicated`)
        } else {
          console.log(`✓ API saved: ${d.provisioned ?? 1} record`)
        }
      } catch (e) {
        console.error('✗ API request failed:', e.message)
      }
    }

    console.log(`\nDone. Tap a phone to verify: ${url}`)
    process.exit(0)
  })

  reader.on('error', err => console.error('Reader error:', err.message))
})

nfc.on('error', err => { console.error('NFC error:', err.message); process.exit(1) })

// Build NDEF URI record wrapped in TLV for NTAG213/215/216
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
