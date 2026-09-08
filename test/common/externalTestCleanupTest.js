/* eslint-env mocha */

const assert = require('assert')
const { stopExternalServer } = require('./externalTestCleanup')

describe('external test cleanup', function () {
  it('force stops a server when the wrapper never reports close', async function () {
    let killed = 0
    const wrap = {
      mcServer: { pid: 1234 },
      stopServer: () => {}
    }

    await assert.rejects(
      stopExternalServer(wrap, {
        timeout: 10,
        kill: () => { killed++ }
      }),
      /timed out/
    )
    assert.strictEqual(killed, 1)
  })
})
