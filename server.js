// server.js — Render-ready (Express + WS on same HTTP server)
const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files (including HTML) from current directory
app.use(express.static(__dirname));

// Default route serves the full game UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'weird_chess_online.html'));
});

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Room management (2 players + spectators) — stateless relay
const rooms = Object.create(null);

function send(ws, obj){ try{ ws.send(JSON.stringify(obj)); } catch(e){} }
function broadcast(roomId, obj, except=null){
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.roomId === roomId && client !== except) send(client, obj);
  }
}
function chooseColor(room, want){
  if(want==='white' && !room.white) return 'white';
  if(want==='black' && !room.black) return 'black';
  if(!room.white) return 'white';
  if(!room.black) return 'black';
  return 'spectator';
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'join') {
      const roomId = String(msg.room || '').slice(0, 40);
      if (!roomId) return send(ws, { type: 'error', message: 'room required' });

      let room = rooms[roomId];
      if (!room) room = rooms[roomId] = { createdAt: Date.now(), white: null, black: null, snapshot: null };

      const color = chooseColor(room, msg.want || 'any');
      if (color === 'white') room.white = ws;
      else if (color === 'black') room.black = ws;

      ws.roomId = roomId;
      ws.color = color;

      send(ws, { type: 'joined', room: roomId, color, created: !room.snapshot, snapshot: room.snapshot });
      broadcast(roomId, { type: 'info', text: `שחקן חדש הצטרף (${color==='spectator'?'צופה':color})` }, ws);

    } else if (msg.type === 'move') {
      const roomId = ws.roomId; if (!roomId) return;
      const room = rooms[roomId]; if (!room) return;
      if (msg.snapshot) room.snapshot = msg.snapshot;
      broadcast(roomId, { type: 'move', move: msg.move }, ws);

    } else if (msg.type === 'newgame') {
      const roomId = ws.roomId; if (!roomId) return;
      const room = rooms[roomId]; if (!room) return;
      if (msg.snapshot) room.snapshot = msg.snapshot;
      broadcast(roomId, { type: 'newgame', snapshot: room.snapshot }, null);

    } else if (msg.type === 'snapshot-please') {
      const roomId = ws.roomId; if (!roomId) return;
      const room = rooms[roomId]; if (!room) return;
      send(ws, { type: 'snapshot', snapshot: room.snapshot });
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId; if (!roomId) return;
    const room = rooms[roomId]; if (!room) return;
    if (room.white === ws) room.white = null;
    if (room.black === ws) room.black = null;
    broadcast(roomId, { type: 'info', text: 'שחקן התנתק' }, null);
  });
});

server.listen(PORT, () => {
  console.log(`HTTP+WS server listening on http://localhost:${PORT}`);
});
