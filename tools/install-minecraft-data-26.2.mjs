import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageRoot = dirname(require.resolve('minecraft-data/package.json'))
const dataRoot = join(packageRoot, 'minecraft-data', 'data')
const source = join(projectRoot, 'vendor', 'minecraft-data', 'pc', '26.2')
const destination = join(dataRoot, 'pc', '26.2')

await mkdir(destination, { recursive: true })
await cp(source, destination, { recursive: true, force: true })

const dataPathsFile = join(dataRoot, 'dataPaths.json')
const dataPaths = JSON.parse(await readFile(dataPathsFile, 'utf8'))
const inherited = dataPaths.pc['26.1']

if (!inherited) throw new Error('minecraft-data 26.1 paths are unavailable')

// The 26.2 registry snapshot predates minecraft-data's metadata extraction
// pass. Preserve the native 26.2 entity IDs and add the metadata names from
// the matching 26.1 entities so Mineflayer can interpret shared flags, pose,
// sleeping position, dropped items, and fishing state.
const entitiesFile = join(destination, 'entities.json')
const inheritedEntitiesFile = join(dataRoot, inherited.entities, 'entities.json')
const entities = JSON.parse(await readFile(entitiesFile, 'utf8'))
const inheritedEntities = JSON.parse(await readFile(inheritedEntitiesFile, 'utf8'))
const inheritedMetadata = new Map(inheritedEntities
  .filter(entity => entity.metadataKeys)
  .map(entity => [entity.name, entity.metadataKeys]))
for (const entity of entities) {
  const metadataKeys = inheritedMetadata.get(entity.name)
  if (metadataKeys) entity.metadataKeys = metadataKeys
}
await writeFile(entitiesFile, `${JSON.stringify(entities, null, 2)}\n`)

dataPaths.pc['26.2'] = Object.fromEntries(
  Object.entries(inherited).map(([key, value]) => [
    key,
    typeof value === 'string' && value === 'pc/26.1' ? 'pc/26.2' : value
  ])
)
await writeFile(dataPathsFile, `${JSON.stringify(dataPaths, null, 2)}\n`)

const featuresFile = join(dataRoot, 'pc', 'common', 'features.json')
const features = JSON.parse(await readFile(featuresFile, 'utf8'))
const playerLoadedFeature = features.find(feature => feature.name === 'sendsPlayerLoadedPacket')
if (playerLoadedFeature) {
  playerLoadedFeature.versions = [...new Set([...(playerLoadedFeature.versions ?? []), '26.2'])]
} else {
  features.push({
    name: 'sendsPlayerLoadedPacket',
    description: 'client sends a player_loaded packet after loading terrain or respawning',
    versions: ['1.21.4', 'latest']
  })
}
if (!features.some(feature => feature.name === 'enchantmentsComponentIsFlat')) {
  features.push({
    name: 'enchantmentsComponentIsFlat',
    description: 'the minecraft:enchantments item component is a plain enchantment-to-level map instead of being wrapped in a levels key',
    versions: ['1.21.5', 'latest']
  })
}
if (!features.some(feature => feature.name === 'fishingBiteDelayMaxTicks')) {
  features.push({
    name: 'fishingBiteDelayMaxTicks',
    description: 'inclusive upper bound of the random tick wait rolled before a fishing hook bites (lower bound is 100); each Lure level subtracts 100 ticks and a non-positive roll is rerolled next tick',
    values: [
      { value: 900, versions: ['1.8_major', '1.8_major'] },
      { value: 600, versions: ['1.9', 'latest'] }
    ]
  })
}
await writeFile(featuresFile, `${JSON.stringify(features, null, 2)}\n`)

await import(pathToFileURL(join(packageRoot, 'bin', 'generate_data.js')).href)

const protocolPackageRoot = dirname(require.resolve('minecraft-protocol/package.json'))
const loginFile = join(protocolPackageRoot, 'src', 'server', 'login.js')
const loginSource = await readFile(loginFile, 'utf8')
const oldSuccessWriter = `    // TODO: find out what properties are on 'success' packet
    client.write('success', {
      uuid: client.uuid,
      username: client.username,
      properties: []
    })`
const newSuccessWriter = `    // TODO: find out what properties are on 'success' packet
    // Mineflayer's 26.2 protocol data adds a sessionId to login_success.
    const success = {
      uuid: client.uuid,
      username: client.username,
      properties: []
    }
    if (client.protocolVersion === 776) {
      success.sessionId = uuid.nameToMcOfflineUUID(client.username + ':session')
    }
    client.write('success', success)`
if (loginSource.includes(oldSuccessWriter)) {
  await writeFile(loginFile, loginSource.replace(oldSuccessWriter, newSuccessWriter))
} else if (!loginSource.includes("success.sessionId = uuid.nameToMcOfflineUUID(client.username + ':session')")) {
  throw new Error('minecraft-protocol 26.2 login_success patch target was not found')
}

const installed = require('minecraft-data')('26.2')
const required = [
  installed.blocksByName.sulfur,
  installed.itemsByName.sulfur,
  installed.entitiesByName.sulfur_cube,
  installed.biomesByName.sulfur_caves
]
if (installed.version.version !== 776 || required.some(value => !value)) {
  throw new Error('minecraft-data 26.2 installation verification failed')
}

console.log('Installed native minecraft-data 26.2 (protocol 776)')
