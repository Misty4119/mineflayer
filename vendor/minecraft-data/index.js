const fs = require('fs')
const path = require('path')

const overlayVersions = ['26.2', '26.3']
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
for (const overlayVersion of overlayVersions) {
  const sourceRoot = path.join(__dirname, 'pc', overlayVersion)
  const inherited = baseData.pc[overlayVersion === '26.2' ? '26.1' : '26.2']
  if (!inherited) throw new Error(`minecraft-data ${overlayVersion === '26.2' ? '26.1' : '26.2'} is required for the ${overlayVersion} package`)

  const data = { ...inherited }
  for (const file of overlayFiles) {
    const source = path.join(sourceRoot, `${file}.json`)
    if (!fs.existsSync(source)) throw new Error(`Missing bundled Minecraft ${overlayVersion} data: ${source}`)
    data[file] = require(source)
  }
  baseData.pc[overlayVersion] = data
}

const latestOverlayVersion = overlayVersions.at(-1)
const sourceRoot = path.join(__dirname, 'pc', latestOverlayVersion)
const version = require(path.join(sourceRoot, 'version.json'))
const protocolVersionsFile = path.join(basePackageRoot, 'minecraft-data', 'data', 'pc', 'common', 'protocolVersions.json')
const protocolVersions = require(protocolVersionsFile)
for (const overlayVersion of overlayVersions) {
  const overlaySourceRoot = path.join(__dirname, 'pc', overlayVersion)
  const overlayVersionData = require(path.join(overlaySourceRoot, 'version.json'))
  if (!protocolVersions.some(entry => entry.minecraftVersion === overlayVersion && entry.releaseType === 'release')) {
    protocolVersions.unshift({
      minecraftVersion: overlayVersion,
      version: overlayVersionData.version,
      dataVersion: overlayVersion === '26.2' ? 4903 : 5023,
      usesNetty: true,
      majorVersion: overlayVersion,
      releaseType: 'release'
    })
  }
}

const supportedVersionsFile = path.join(basePackageRoot, 'minecraft-data', 'data', 'pc', 'common', 'versions.json')
const supportedVersions = require(supportedVersionsFile)
for (const overlayVersion of overlayVersions) {
  if (!supportedVersions.includes(overlayVersion)) supportedVersions.push(overlayVersion)
}

const featuresFile = path.join(basePackageRoot, 'minecraft-data', 'data', 'pc', 'common', 'features.json')
const features = require(featuresFile)
const addVersionFeature = (name, description, versions = overlayVersions) => {
  const feature = features.find(entry => entry.name === name)
  if (feature) {
    for (const overlayVersion of versions) {
      if (feature.versions && !feature.versions.includes(overlayVersion)) feature.versions.push(overlayVersion)
    }
    return
  }
  features.push({ name, description, versions: [...versions] })
}

addVersionFeature('sendsPlayerLoadedPacket', 'client sends a player_loaded packet after loading terrain or respawning')
addVersionFeature('enchantmentsComponentIsFlat', 'the enchantments item component is a plain enchantment-to-level map')
addVersionFeature('teamPacketUsesOptionalColor', 'the 26.2 and 26.3 teams packet uses display components, optional color, and a trailing flags byte', ['26.2', '26.3'])
addVersionFeature('useEntityUsesSecondaryAction', 'the 26.2 and 26.3 use_entity packet names its sneak interaction flag usingSecondaryAction', ['26.2', '26.3'])
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
    values: [{ value: 600, versions: [...overlayVersions] }]
  })
}

module.exports = require('minecraft-data-base')
