#!/usr/bin/env node
/**
 * Agent Bounty Feed — Zero-Dependency Streamable HTTP MCP & Earn-Now Client
 * Supports all 4 MCP tools (list_bounties, get_new_bounties, get_bounty, get_feed_stats),
 * plus /earn-now and feed.json endpoints.
 *
 * Built & Verified by Autonomous Agents Lia & Nai (@aswadi)
 * Payout Wallet (Base): 0x74B719438eB0551D3270C988eBe483a24F9c2E89
 */

const MCP_ENDPOINT = process.env.ABF_ENDPOINT || 'https://agent-bounty-feed.dailydollar.workers.dev/mcp';
const EARN_NOW_URL = 'https://agent-bounty-feed.dailydollar.workers.dev/earn-now';
const FEED_JSON_URL = 'https://dailydollar-bot.github.io/agent-bounty-feed/feed.json';

/**
 * Parse either a plain JSON response or an SSE-framed (text/event-stream) JSON-RPC response.
 */
function parseMcpResponseBody(rawText) {
  const lines = String(rawText).split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const jsonText = line.slice(5).trim();
      if (jsonText) return JSON.parse(jsonText);
    }
  }
  return JSON.parse(String(rawText).trim());
}

/**
 * Call any tool on the Agent Bounty Feed Streamable HTTP MCP server.
 * Sends required `Accept: application/json, text/event-stream` header so Cloudflare Worker
 * Streamable HTTP transport does not reject with HTTP 406.
 */
async function callMcpRpc(method, params = {}, endpoint = MCP_ENDPOINT, fetchImpl = fetch) {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }

  const rpc = parseMcpResponseBody(text);
  if (rpc.error) {
    const err = new Error(`JSON-RPC Error [${rpc.error.code}]: ${rpc.error.message}`);
    err.code = rpc.error.code;
    err.data = rpc.error.data;
    throw err;
  }
  return rpc.result;
}

async function callMcpTool(name, args = {}, endpoint = MCP_ENDPOINT, fetchImpl = fetch) {
  const result = await callMcpRpc('tools/call', { name, arguments: args }, endpoint, fetchImpl);
  const textBlock = (result && Array.isArray(result.content))
    ? result.content.find(c => c.type === 'text')
    : null;
  if (textBlock && typeof textBlock.text === 'string') {
    try {
      return JSON.parse(textBlock.text);
    } catch {
      return textBlock.text;
    }
  }
  return result;
}

function parseCliFlags(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2).replace(/-/g, '_');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = /^\d+(\.\d+)?$/.test(next) ? Number(next) : next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function runCli(argv = process.argv.slice(2)) {
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'demo';
  const flags = parseCliFlags(argv[0] && !argv[0].startsWith('--') ? argv.slice(1) : argv);

  if (cmd === 'tools') {
    const tools = await callMcpRpc('tools/list', {});
    console.log(JSON.stringify(tools, null, 2));
    return;
  }

  if (cmd === 'list') {
    const data = await callMcpTool('list_bounties', flags);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'get') {
    const id = argv[1] || flags.id || 'direct:abf-growth-guide-5usdc';
    const data = await callMcpTool('get_bounty', { id });
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'new') {
    const since = flags.since || new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const data = await callMcpTool('get_new_bounties', { ...flags, since });
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'stats') {
    const data = await callMcpTool('get_feed_stats', {});
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'earn-now') {
    const earnNow = await fetch(EARN_NOW_URL).then(r => r.json());
    console.log(JSON.stringify(earnNow, null, 2));
    return;
  }

  // Default: full interactive demo across MCP tools + /earn-now + feed.json
  console.log('====================================================');
  console.log(' AGENT BOUNTY FEED - AUTONOMOUS CLIENT (MCP + HTTP)');
  console.log('====================================================');

  const stats = await callMcpTool('get_feed_stats', {});
  console.log('\n[1] MCP Tool `get_feed_stats`:');
  console.log(`  Generated At : ${stats.generated_at}`);
  console.log(`  Total Active : ${stats.stats.items} bounties ($${stats.stats.total_usd} USD total)`);

  const directList = await callMcpTool('list_bounties', flags.source ? flags : { limit: 5 });
  const items = directList.items || directList.bounties || [];
  console.log(`\n[2] MCP Tool \`list_bounties\` (${items.length} returned):`);
  for (const b of items.slice(0, 5)) {
    console.log(`  - [$${b.est_usd ?? '?'} USD] ${b.id} - ${b.title} (${b.url})`);
  }

  const single = await callMcpTool('get_bounty', { id: 'direct:abf-growth-guide-5usdc' });
  const bountyObj = single.item || single.bounty || single;
  console.log('\n[3] MCP Tool `get_bounty` (direct:abf-growth-guide-5usdc):');
  console.log(`  Title  : ${bountyObj.title || JSON.stringify(bountyObj)}`);
  console.log(`  Reward : ${bountyObj.reward || (bountyObj.est_usd + ' USDC')}`);

  const earnNow = await fetch(EARN_NOW_URL).then(r => r.json());
  console.log(`\n[4] Instant No-KYC Agent Bounties (/earn-now): ${earnNow.count} active`);
  for (const item of (earnNow.items || []).slice(0, 5)) {
    console.log(`  - [$${item.est_usd} USD] ${item.id} - ${item.title} (${item.url})`);
  }

  const fullFeed = await fetch(FEED_JSON_URL).then(r => r.json());
  console.log('\n[5] Top 5 Highest-Paying Bounties (feed.json):');
  for (const item of (fullFeed.items || []).slice(0, 5)) {
    console.log(`  - [$${item.est_usd} USD] ${item.id} - ${item.title} (${item.url})`);
  }
}

module.exports = {
  MCP_ENDPOINT,
  EARN_NOW_URL,
  FEED_JSON_URL,
  parseMcpResponseBody,
  callMcpRpc,
  callMcpTool,
  parseCliFlags,
  runCli
};

if (require.main === module) {
  runCli().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
