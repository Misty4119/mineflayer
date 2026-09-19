const os = require('os')
const { performance } = require('perf_hooks')
const { execFileSync } = require('child_process')
const minecraftData = require('minecraft-data')
const minecraftProtocol = require('minecraft-protocol')
const Chunk = require('prismarine-chunk')

const version = process.argv[2] ?? '26.2'
const warmupBatches = 16
const measuredBatches = 100
const operationsPerBatch = 256
const data = minecraftData(version)

if (!data) throw new Error(`No minecraft-data for ${version}`)

const protocolSerializer = minecraftProtocol.createSerializer({
  state: minecraftProtocol.states.PLAY,
  version,
  isServer: false
})
const protocolDeserializer = minecraftProtocol.createDeserializer({
  state: minecraftProtocol.states.PLAY,
  version,
  isServer: true
})
const chunk = new (Chunk(version))()
const stoneId = data.blocksByName.stone.id
let peakRss = process.memoryUsage.rss()

function percentile (values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

function measure (name, operation) {
  const perOperationMs = []
  let sample = 0

  for (let batch = 0; batch < warmupBatches + measuredBatches; batch++) {
    const start = performance.now()
    for (let index = 0; index < operationsPerBatch; index++) operation(sample++)
    const elapsed = performance.now() - start
    peakRss = Math.max(peakRss, process.memoryUsage.rss())
    if (batch >= warmupBatches) perOperationMs.push(elapsed / operationsPerBatch)
  }

  return {
    name,
    operations: measuredBatches * operationsPerBatch,
    p50Microseconds: percentile(perOperationMs, 0.5) * 1000,
    p95Microseconds: percentile(perOperationMs, 0.95) * 1000
  }
}

const packetResults = measure('position encode/decode', index => {
  const buffer = protocolSerializer.createPacketBuffer({
    name: 'position',
    params: {
      x: index / 10,
      y: 64,
      z: -index / 10,
      flags: { onGround: true, hasHorizontalCollision: false }
    }
  })
  const packet = protocolDeserializer.parsePacketBuffer(buffer)
  if (packet.data.params.y !== 64) throw new Error('position packet round-trip failed')
})

const chunkResults = measure('chunk block-state set/get', index => {
  const position = { x: index & 15, y: (index >>> 8) & 15, z: (index >>> 4) & 15 }
  chunk.setBlockType(position, stoneId)
  if (chunk.getBlockType(position) !== stoneId) throw new Error('chunk block-state round-trip failed')
})

const report = {
  timestamp: new Date().toISOString(),
  version,
  node: process.version,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  warmupBatches,
  measuredBatches,
  operationsPerBatch,
  peakRssBytes: peakRss,
  workloads: [packetResults, chunkResults]
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
