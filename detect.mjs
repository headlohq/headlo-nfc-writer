import { NFC } from 'nfc-pcsc'

const nfc = new NFC()

nfc.on('reader', reader => {
  console.log('Reader found:', reader.name)
  reader.on('card', card => console.log('Card:', card))
  reader.on('card.off', card => console.log('Card removed'))
})

nfc.on('error', err => console.error('Error:', err.message))

setTimeout(() => {
  console.log('No reader detected after 5s — check USB connection')
  process.exit(1)
}, 5000)
