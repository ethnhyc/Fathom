/* Fathom live rooms. Every player in a room holds a WebSocket to one Durable Object, which
   passes each player's presence to everyone else. No WebRTC, so any network that can load a
   web page can play. */
const MAX_PLAYERS = 16;
const MAX_MSG = 6000;

function allowed(origin) {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname;
    return h.endsWith(".github.io") || h === "localhost" || h === "127.0.0.1";
  } catch (e) { return false; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{3,64})$/);
    if (!m) return new Response("Fathom rooms", { status: 200 });
    if (!allowed(req.headers.get("Origin"))) return new Response("forbidden", { status: 403 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(req);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    this.pres = new Map(); // peer id -> presence JSON string
    // After waking from hibernation, recover what fits in the socket attachments.
    for (const ws of state.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.id && a.p) this.pres.set(a.id, a.p);
    }
  }

  async fetch(req) {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return new Response("bad id", { status: 400 });
    const socks = this.state.getWebSockets();
    for (const ws of socks) {
      const a = ws.deserializeAttachment();
      if (a && a.id === id) { a.replaced = true; ws.serializeAttachment(a); try { ws.close(4000, "replaced"); } catch (e) {} }
    }
    if (this.state.getWebSockets().filter((w) => !(w.deserializeAttachment() || {}).replaced).length >= MAX_PLAYERS) {
      return new Response("room full", { status: 429 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id });
    const peers = {};
    this.pres.forEach((p, pid) => { if (pid !== id && this.isLive(pid)) peers[pid] = p; });
    server.send(JSON.stringify({ t: "all", me: id, peers }));
    return new Response(null, { status: 101, webSocket: client });
  }

  isLive(id, except) {
    return this.state.getWebSockets().some((w) => {
      if (w === except) return false;
      const a = w.deserializeAttachment();
      return a && a.id === id && !a.replaced;
    });
  }

  webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > MAX_MSG) return;
    let d; try { d = JSON.parse(msg); } catch (e) { return; }
    const a = ws.deserializeAttachment() || {};
    if (!a.id || a.replaced) return;
    if (d.t === "pres" && typeof d.p === "string") {
      if (this.pres.get(a.id) === d.p) return;
      this.pres.set(a.id, d.p);
      if (d.p.length < 1800) { a.p = d.p; ws.serializeAttachment(a); }
      this.send(ws, { t: "pres", id: a.id, p: d.p });
    } else if (d.t === "ping") {
      try { ws.send('{"t":"pong"}'); } catch (e) {}
    }
  }

  gone(ws) {
    const a = ws.deserializeAttachment();
    if (!a || !a.id || a.replaced || this.isLive(a.id, ws)) return;
    this.pres.delete(a.id);
    this.send(ws, { t: "leave", id: a.id });
  }
  webSocketClose(ws) { this.gone(ws); try { ws.close(1000, "bye"); } catch (e) {} }
  webSocketError(ws) { this.gone(ws); }

  send(from, obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      if (ws === from) continue;
      const a = ws.deserializeAttachment();
      if (a && a.replaced) continue;
      try { ws.send(s); } catch (e) {}
    }
  }
}
