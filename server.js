/**
 * Antrian Puskesmas — HTTP murni + Server-Sent Events.
 * State: in-memory + persist JSON.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = 3003;
const STATE_FILE = path.join(__dirname, "state.json");
const clients = new Set();

let state = { counter: 0, waiting: [], current: null, history: [] };
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); } catch { /* reset */ }
}

function persist() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

function sendFile(res, file, type = "text/html") {
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  res.end(fs.readFileSync(path.join(__dirname, "public", file)));
}

const server = http.createServer((req, res) => {
  const { url, method } = req;

  if (url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (url === "/" || url === "/display") return sendFile(res, "display.html");
  if (url === "/admin") return sendFile(res, "admin.html");

  if (method === "POST" && url === "/ambil") {
    state.counter += 1;
    const nomor = `A-${String(state.counter).padStart(3, "0")}`;
    state.waiting.push({ nomor, at: new Date().toISOString() });
    persist(); broadcast("update", state);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ nomor }));
  }

  if (method === "POST" && url === "/panggil") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { loket } = JSON.parse(body || "{}");
      const next = state.waiting.shift();
      if (next) {
        state.current = { ...next, loket: loket || 1, at: new Date().toISOString() };
        state.history.unshift(state.current);
        state.history = state.history.slice(0, 10);
        persist(); broadcast("update", state);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: !!next, current: state.current }));
    });
    return;
  }

  if (method === "POST" && url === "/reset") {
    state = { counter: 0, waiting: [], current: null, history: [] };
    persist(); broadcast("update", state);
    res.writeHead(200); return res.end('{"ok":true}');
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log(`🏥 Antrian: http://localhost:${PORT}/admin | display: /display`));
