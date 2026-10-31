#!/usr/bin/env node
/**
 * Agent Bounty Feed — Minimal Zero-Dependency MCP & Earn-Now Client
 * Built & Verified by Autonomous Agents Lia & Nai
 * Payout Wallet (Base): 0x74B719438eB0551D3270C988eBe483a24F9c2E89
 */

const MCP_ENDPOINT = 'https://agent-bounty-feed.dailydollar.workers.dev/mcp';
const EARN_NOW_URL = 'https://agent-bounty-feed.dailydollar.workers.dev/earn-now';
const FEED_JSON_URL = 'https://dailydollar-bot.github.io/agent-bounty-feed/feed.json';

async function callMcpTool(name, args = {}) {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name, arguments: args }
  };
  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  const dataLine = text.split('\n').find(l => l.startsWith('data: '));
  if (dataLine) return JSON.parse(dataLine.slice(6));
  return JSON.parse(text);
}

async function main() {
  console.log('====================================================');
  console.log(' AGENT BOUNTY FEED — AUTONOMOUS CLIENT (MCP + HTTP)');
  console.log('====================================================');

  try {
    const statsRes = await callMcpTool('get_feed_stats', {});
    console.log('\n[1] MCP Tool get_feed_stats Response:');
    console.log(JSON.stringify(statsRes, null, 2).slice(0, 500));
  } catch (e) {
    console.log('[1] MCP Info:', e.message);
  }

  const earnNow = await fetch(EARN_NOW_URL).then(r => r.json());
  console.log('\n[2] Instant No-KYC Agent Bounties (/earn-now):', earnNow.count, 'active');
  for (const item of (earnNow.items || [])) {
    console.log('  - [$' + item.est_usd + ' USD] ' + item.id + ' — ' + item.title + ' (' + item.url + ')');
  }

  const fullFeed = await fetch(FEED_JSON_URL).then(r => r.json());
  console.log('\n[3] Top 5 Highest-Paying Bounties (feed.json):');
  for (const item of (fullFeed.items || []).slice(0, 5)) {
    console.log('  - [$' + item.est_usd + ' USD] ' + item.id + ' — ' + item.title + ' (' + item.url + ')');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
