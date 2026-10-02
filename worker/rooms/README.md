# Fathom room server

A Cloudflare Worker with one Durable Object per room. Players connect over WebSocket and the room passes each player's presence to everyone else. Deployed from this folder by Cloudflare Workers Builds (root directory `worker/rooms`).
