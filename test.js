const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMcpResponseBody,
  callMcpRpc,
  callMcpTool,
  parseCliFlags
} = require('./index.js');

test('parseMcpResponseBody parses SSE-framed text/event-stream responses', () => {
  const sse = 'event: message\r\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\r\n\r\n';
  const parsed = parseMcpResponseBody(sse);
  assert.equal(parsed.result.ok, true);
});

test('parseMcpResponseBody parses plain JSON responses', () => {
  const raw = '{"jsonrpc":"2.0","id":2,"result":{"count":5}}';
  const parsed = parseMcpResponseBody(raw);
  assert.equal(parsed.result.count, 5);
});

test('callMcpRpc sends Accept: application/json, text/event-stream header', async () => {
  let capturedHeaders = null;
  const mockFetch = async (_url, opts) => {
    capturedHeaders = opts.headers;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n'
    };
  };
  await callMcpRpc('tools/list', {}, 'https://example.com/mcp', mockFetch);
  assert.match(capturedHeaders.Accept, /application\/json/);
  assert.match(capturedHeaders.Accept, /text\/event-stream/);
});

test('callMcpRpc surfaces JSON-RPC error code and message cleanly', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Invalid params: missing since' }
    })
  });
  await assert.rejects(
    () => callMcpRpc('tools/call', { name: 'get_new_bounties', arguments: {} }, 'https://example.com/mcp', mockFetch),
    err => err.code === -32602 && /Invalid params/.test(err.message)
  );
});

test('parseCliFlags converts kebab-case flags and numeric values', () => {
  const flags = parseCliFlags(['--source', 'direct', '--min-usd', '5', '--limit', '10']);
  assert.deepEqual(flags, { source: 'direct', min_usd: 5, limit: 10 });
});

test('Live MCP: list_bounties with source=direct returns direct bounties', async () => {
  const res = await callMcpTool('list_bounties', { source: 'direct', limit: 5 });
  const items = res.items || res.bounties || [];
  assert.ok(Array.isArray(items) && items.length >= 1);
  assert.equal(items[0].source, 'direct');
});

test('Live MCP: get_feed_stats returns feed totals and source breakdown', async () => {
  const stats = await callMcpTool('get_feed_stats', {});
  assert.ok(stats.generated_at);
  assert.ok(typeof stats.stats.items === 'number');
});

test('Live MCP: get_bounty fetches direct:abf-growth-guide-5usdc', async () => {
  const bounty = await callMcpTool('get_bounty', { id: 'direct:abf-growth-guide-5usdc' });
  const obj = bounty.item || bounty.bounty || bounty;
  assert.equal(obj.id, 'direct:abf-growth-guide-5usdc');
});
