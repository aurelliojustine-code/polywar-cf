// Server multiplayer PolyWar untuk Cloudflare Workers + Durable Objects.
// Tiap "room" = satu Durable Object. Worker memilih room yang masih ada tempat (matchmaking otomatis).
// Protokol sama dengan server Node: klien kirim {t:'join'} -> dapat {type:'welcome'}; pesan lain di-relay ke pemain lain.

const ROOM_MAX = 5;       // pemain per room
const ROOM_SHARDS = 12;   // jumlah room yang tersedia (total kapasitas = 12 x 5 = 60 pemain)
const MAX_MSG = 2048;     // ukuran pesan maksimal
const RATE_PER_SEC = 90;  // batas pesan per detik per pemain

const CORS = { 'Access-Control-Allow-Origin': '*' };

function roomStub(env, i) { return env.ROOM.get(env.ROOM.idFromName('room-' + i)); }

async function roomCounts(env) {
  return Promise.all(Array.from({ length: ROOM_SHARDS }, async (_, k) => {
    try { const r = await roomStub(env, k + 1).fetch('https://room/count'); return parseInt(await r.text(), 10) || 0; }
    catch (e) { return ROOM_MAX; }
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      if (url.pathname === '/status') {
        const counts = await roomCounts(env);
        return new Response(JSON.stringify({ ok: true, players: counts.reduce((a, b) => a + b, 0), rooms: counts.map((c, i) => ({ room: i + 1, players: c })).filter(r => r.players > 0) }), { headers: { 'Content-Type': 'application/json', ...CORS } });
      }
      return new Response('PolyWar server OK', { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } });
    }
    // matchmaking: isi room yang sudah ada orangnya (paling ramai tapi belum penuh), kalau tidak ada pakai room kosong pertama
    const counts = await roomCounts(env);
    let best = 0, bestCount = 0, firstEmpty = 0;
    counts.forEach((c, k) => {
      if (c > 0 && c < ROOM_MAX && c > bestCount) { best = k + 1; bestCount = c; }
      if (c === 0 && !firstEmpty) firstEmpty = k + 1;
    });
    const pick = best || firstEmpty;
    if (!pick) return new Response('Server penuh', { status: 503, headers: CORS });
    return roomStub(env, pick).fetch(new Request('https://room/ws?r=' + pick, request));
  }
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.rate = new WeakMap();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/count') return new Response(String(this.ctx.getWebSockets().length));
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    if (this.ctx.getWebSockets().length >= ROOM_MAX) return new Response('Room penuh', { status: 503 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: null, room: url.searchParams.get('r') || '1' });
    return new Response(null, { status: 101, webSocket: client });
  }

  _others(ws) { return this.ctx.getWebSockets().filter(s => s !== ws); }
  _relay(ws, str) { for (const s of this._others(ws)) { try { s.send(str); } catch (e) {} } }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MSG) return;
    // pembatas kecepatan pesan
    const now = Date.now(); let b = this.rate.get(ws);
    if (!b) { b = { tokens: RATE_PER_SEC, last: now }; this.rate.set(ws, b); }
    b.tokens = Math.min(RATE_PER_SEC, b.tokens + (now - b.last) / 1000 * RATE_PER_SEC); b.last = now;
    if (b.tokens < 1) return; b.tokens--;

    let msg; try { msg = JSON.parse(message); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    const att = ws.deserializeAttachment() || {};

    if (msg.t === 'join') {
      if (att.pid) return;
      att.pid = 'p' + Math.random().toString(36).slice(2, 8);
      ws.serializeAttachment(att);
      const joined = this.ctx.getWebSockets().filter(s => (s.deserializeAttachment() || {}).pid).length;
      ws.send(JSON.stringify({ type: 'welcome', id: att.pid, room: 'R' + att.room, count: joined, max: ROOM_MAX }));
      this._relay(ws, JSON.stringify({ type: 'joined', id: att.pid }));
      return;
    }
    if (!att.pid) return;                       // belum join
    if (msg.t === 'leave') { try { ws.close(1000, 'bye'); } catch (e) {} this._left(ws, att); return; }
    msg.id = att.pid;                           // cegah pemalsuan id
    this._relay(ws, JSON.stringify(msg));
  }

  _left(ws, att) {
    if (!att || !att.pid || att.gone) return;
    att.gone = true; try { ws.serializeAttachment(att); } catch (e) {}
    this._relay(ws, JSON.stringify({ type: 'leave', id: att.pid }));
  }

  async webSocketClose(ws, code, reason, wasClean) {
    this._left(ws, ws.deserializeAttachment());
    try { ws.close(code && code !== 1005 && code !== 1006 ? code : 1000, 'bye'); } catch (e) {}
  }

  async webSocketError(ws) { this._left(ws, ws.deserializeAttachment()); }
          }
