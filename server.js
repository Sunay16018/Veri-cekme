const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const vec3 = require('vec3');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let bot = null;
let automationActive = false;
let isWorking = false;

const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>SkyBot v28 - Realtime Interface</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #1a1a1a; color: #e1e1e1; font-family: 'Courier New', Courier, monospace; margin: 0; display: flex; height: 100vh; }
        .side { width: 350px; background: #252526; padding: 20px; border-right: 2px solid #333; overflow-y: auto; }
        .main { flex: 1; display: flex; flex-direction: column; background: #000; padding: 10px; }
        #log { flex: 1; overflow-y: auto; padding: 15px; background: rgba(0,0,0,0.9); border: 1px solid #444; margin-bottom: 10px; font-size: 15px; }
        .stat-box { background: #333; padding: 10px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #1f6feb; }
        input { background: #000; border: 1px solid #555; color: #fff; padding: 12px; border-radius: 4px; width: 100%; box-sizing: border-box; margin-bottom: 10px; }
        button { padding: 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 5px; color: white; transition: 0.3s; }
        button:hover { filter: brightness(1.2); }
        .mc-text { white-space: pre-wrap; word-wrap: break-word; text-shadow: 1px 1px #000; }
        /* Minecraft HTML Renkleri */
        .mcf_0 { color: #000000; } .mcf_1 { color: #0000AA; } .mcf_2 { color: #00AA00; } .mcf_3 { color: #00AAAA; }
        .mcf_4 { color: #AA0000; } .mcf_5 { color: #AA00AA; } .mcf_6 { color: #FFAA00; } .mcf_7 { color: #AAAAAA; }
        .mcf_8 { color: #555555; } .mcf_9 { color: #5555FF; } .mcf_a { color: #55FF55; } .mcf_b { color: #55FFFF; }
        .mcf_c { color: #FF5555; } .mcf_d { color: #FF55FF; } .mcf_e { color: #FFFF55; } .mcf_f { color: #FFFFFF; }
    </style>
</head>
<body>
    <div class="side">
        <h2 style="color:#1f6feb">SKY-BOT v28</h2>
        <div class="stat-box">
            <div>📍 Konum: <span id="pos">0, 0, 0</span></div>
            <div>❤️ Can: <span id="hp">20</span></div>
            <div>🍖 Açlık: <span id="food">20</span></div>
        </div>
        <input id="h" placeholder="IP:Port">
        <input id="u" placeholder="Bot İsmi">
        <button style="background:#1f6feb" onclick="connect()">SİSTEME BAĞLAN</button>
        <hr style="border:1px solid #444; margin:15px 0;">
        <button style="background:#d4a017; color:#000" onclick="socket.emit('drop-all')">ENVANTERİ BOŞALT</button>
        <hr style="border:1px solid #444; margin:15px 0;">
        <label>Sandık (X,Y,Z)</label><input id="c" placeholder="7779, 101, 7822">
        <label>Hedef (X,Y,Z)</label><input id="b" placeholder="7785, 101, 7825">
        <button style="background:#238636" onclick="start()">OTOMASYONU BAŞLAT</button>
        <button style="background:#da3633" onclick="stop()">DURDUR</button>
    </div>
    <div class="main">
        <div id="log"></div>
        <div style="display:flex; gap:10px;">
            <input id="msg" placeholder="Mesaj yaz ve Enter'a bas..." style="margin:0; flex:1;">
            <button style="background:#1f6feb; width:100px;" onclick="send()">GÖNDER</button>
        </div>
    </div>
    <script>
        const socket = io();
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        function stop() { socket.emit('stop'); }
        function send() { const i=document.getElementById('msg'); if(i.value){ socket.emit('chat', i.value); i.value=''; } }
        document.getElementById('msg').addEventListener('keypress', (e) => { if(e.key==='Enter') send(); });

        socket.on('log', m => { 
            const l = document.getElementById('log'); 
            const d = document.createElement('div');
            d.className = 'mc-text';
            d.innerHTML = m;
            l.appendChild(d);
            l.scrollTop = l.scrollHeight;
        });

        socket.on('stats', s => {
            document.getElementById('pos').innerText = s.pos;
            document.getElementById('hp').innerText = s.hp;
            document.getElementById('food').innerText = s.food;
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

io.on('connection', (socket) => {
    socket.on('conn', (data) => {
        if(bot) bot.quit();
        let [host, port] = data.h.includes(':') ? data.h.split(':') : [data.h, 25565];
        bot = mineflayer.createBot({ host, port: parseInt(port), username: data.u, version: "1.16.5", auth: 'offline' });
        bot.loadPlugin(pathfinder);

        bot.on('message', (jsonMsg) => {
            socket.emit('log', jsonMsg.toHTML());
        });

        // DURUM GÜNCELLEME (5 saniyede bir)
        setInterval(() => {
            if(bot && bot.entity) {
                socket.emit('stats', {
                    pos: `${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.y)}, ${Math.round(bot.entity.position.z)}`,
                    hp: Math.round(bot.health),
                    food: Math.round(bot.food)
                });
            }
        }, 5000);

        bot.on('login', () => socket.emit('log', '<span style="color:#55ff55"><b>[SİSTEM]</b> Sunucuya giriş yapıldı!</span>'));
        bot.on('kicked', (r) => socket.emit('log', `<span style="color:#ff5555"><b>[ATILDI]</b> ${r}</span>`));
        bot.on('error', (e) => socket.emit('log', `<span style="color:#ff5555"><b>[HATA]</b> ${e.message}</span>`));
    });

    // Otomasyon ve Drop işleri (Stabil v27 mantığı)
    socket.on('start', async (data) => {
        if(!bot) return; automationActive = true;
        const chest = new vec3(...data.c.split(',').map(n => Math.floor(Number(n.trim()))));
        const target = new vec3(...data.b.split(',').map(n => Math.floor(Number(n.trim()))));
        
        const loop = async () => {
            if(!automationActive || !bot || isWorking) return;
            isWorking = true;
            try {
                bot.pathfinder.setMovements(new Movements(bot, require('minecraft-data')(bot.version)));
                const items = bot.inventory.items().filter(i => i.name.includes('block'));
                if(items.length === 0) {
                    await bot.pathfinder.goto(new goals.GoalNear(chest.x, chest.y, chest.z, 1.5));
                    const b = bot.blockAt(chest);
                    if(b) {
                        const c = await bot.openChest(b);
                        for(const i of c.containerItems()) { await c.withdraw(i.type, null, i.count); await new Promise(r=>setTimeout(r,400)); }
                        await c.close();
                    }
                } else {
                    await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 1.5));
                    const win = await bot.activateBlock(bot.blockAt(target));
                    for(const i of bot.inventory.items()) { await bot.clickWindow(i.slot, 0, 1); await new Promise(r=>setTimeout(r,400)); }
                    await bot.closeWindow(win);
                }
            } catch(e){}
            isWorking = false; if(automationActive) setTimeout(loop, 2000);
        };
        loop();
    });

    socket.on('drop-all', async () => {
        if(!bot) return;
        for(const i of bot.inventory.items()){ await bot.tossStack(i); await new Promise(r=>setTimeout(r,500)); }
        socket.emit('log', '<span style="color:#ffff55">>> Envanter yere boşaltıldı.</span>');
    });

    socket.on('chat', (m) => bot.chat(m));
    socket.on('stop', () => automationActive = false);
});

process.on('uncaughtException', (e) => console.log('Hata Engellendi:', e));
server.listen(process.env.PORT || 10000, '0.0.0.0');
      
