/* eslint-env mocha */

const assert = require('assert')
const minecraftData = require('minecraft-data')

describe('minecraft-data compatibility features', function () {
  it('preserves version-specific command feature flags through the vendor wrapper', function () {
    assert.strictEqual(minecraftData('1.8.8').supportFeature('replaceItemSlotIsPrefixed'), true)
    assert.strictEqual(minecraftData('1.12.2').supportFeature('replaceItemSlotIsPrefixed'), true)
    assert.strictEqual(minecraftData('1.21.8').supportFeature('hasItemCommand'), true)
    assert.strictEqual(minecraftData('26.2').supportFeature('hasItemCommand'), true)
  })
})
