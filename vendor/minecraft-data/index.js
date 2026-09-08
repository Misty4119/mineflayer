const fs = require('fs')
const path = require('path')

const overlayVersion = '26.2'
const overlayFiles = [
  'attributes',
  'biomes',
  'blockCollisionShapes',
  'blocks',
  'effects',
  'enchantments',
  'entities',
  'foods',
  'instruments',
  'items',
  'language',
  'loginPacket',
  'materials',
  'particles',
  'protocol',
  'recipes',
  'sounds',
  'tints',
  'version'
]

const basePackageRoot = path.dirname(require.resolve('minecraft-data-base/package.json'))
const baseData = require(path.join(basePackageRoot, 'data.js'))
const sourceRoot = path.join(__dirname, 'pc', overlayVersion)
const inherited = baseData.pc['26.1']

if (!inherited) throw new Error('minecraft-data 26.1 is required for the 26.2 package')

const data262 = { ...inherited }
for (const file of overlayFiles) {
  const source = path.join(sourceRoot, `${file}.json`)
  if (!fs.existsSync(source)) throw new Error(`Missing bundled Minecraft 26.2 data: ${source}`)
  data262[file] = require(source)
}
baseData.pc[overlayVersion] = data262

const version = require(path.join(sourceRoot, 'version.json'))
const protocolVersionsFile = path.join(basePackageRoot, 'minecraft-data', 'data', 'pc', 'common', 'protocolVersions.json')
const protocolVersions = require(protocolVersionsFile)
if (!protocolVersions.some(entry => entry.minecraftVersion === overlayVersion && entry.releaseType === 'release')) {
  protocolVersions.unshift({
    minecraftVersion: overlayVersion,
    version: version.version,
    dataVersion: 4903,
    usesNetty: true,
    majorVersion: overlayVersion,
    releaseType: 'release'
  })
}

const supportedVersionsFile = path.join(basePackageRoot, 'minecraft-data', 'data', 'pc', 'common', 'versions.json')
const supportedVersions = require(supportedVersionsFile)
if (!supportedVersions.includes(overlayVersion)) supportedVersions.push(overlayVersion)

const featuresFile = path.join(basePackageRoot, 'minecraft-data', 'data', 'pc', 'common', 'features.json')
const features = require(featuresFile)
const addVersionFeature = (name, description) => {
  const feature = features.find(entry => entry.name === name)
  if (feature) {
    if (feature.versions && !feature.versions.includes(overlayVersion)) feature.versions.push(overlayVersion)
    return
  }
  features.push({ name, description, versions: [overlayVersion, overlayVersion] })
}

addVersionFeature('sendsPlayerLoadedPacket', 'client sends a player_loaded packet after loading terrain or respawning')
addVersionFeature('enchantmentsComponentIsFlat', 'the enchantments item component is a plain enchantment-to-level map')
addVersionFeature('teamPacketUsesOptionalColor', 'the 26.2 teams packet uses display components, optional color, and a trailing flags byte')
addVersionFeature('useEntityUsesSecondaryAction', 'the 26.2 use_entity packet names its sneak interaction flag usingSecondaryAction')
addVersionFeature('setCursorItemPacket', 'server sends authoritative cursor contents in set_cursor_item')
addVersionFeature('customNameComponentIsPlainText', 'the custom_name item component is returned as a plain NBT string')
addVersionFeature('loginSuccessIncludesSessionId', 'login success includes the server session UUID')
addVersionFeature('hasDataCommand', '26.2 block entity NBT is edited with /data merge block')
addVersionFeature('furnaceNbtUsesSnakeCase', '26.2 furnace block entity NBT uses cooking_time_spent')
addVersionFeature('hasItemCommand', '26.2 uses /item replace instead of /replaceitem')
if (!features.some(feature => feature.name === 'fishingBiteDelayMaxTicks')) {
  features.push({
    name: 'fishingBiteDelayMaxTicks',
    description: 'inclusive upper bound of the random tick wait rolled before a fishing hook bites',
    values: [{ value: 600, versions: [overlayVersion, overlayVersion] }]
  })
}

module.exports = require('minecraft-data-base')
