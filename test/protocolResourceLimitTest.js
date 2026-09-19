/* eslint-env mocha */

const assert = require('assert')
const net = require('net')
const minecraftProtocol = require('minecraft-protocol')

describe('minecraft-protocol resource limits', function () {
  it('rejects an oversized frame from a peer before receiving its payload', async function () {
    const server = net.createServer(socket => {
      socket.once('data', () => socket.write(Buffer.from([65])))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

    let client
    try {
      client = minecraftProtocol.createClient({
        username: 'resource-limit-test',
        host: '127.0.0.1',
        port: server.address().port,
        version: '26.2',
        auth: 'offline',
        maxPacketSize: 64
      })

      const error = await Promise.race([
        new Promise(resolve => client.once('error', resolve)),
        new Promise(resolve => setTimeout(() => resolve(null), 500))
      ])

      assert.ok(error, 'the client should reject a 65-byte frame against a 64-byte limit')
      assert.match(error.message, /packet length 65 exceeds maximum 64/)
    } finally {
      client?.end('resource-limit-test-complete')
      await new Promise(resolve => server.close(resolve))
    }
  })
})
