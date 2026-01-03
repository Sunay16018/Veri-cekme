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
    <meta charset="UTF-8"><title>SkyBot v29 - Mesaj Tamir</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #1a1a1a; color: #e1e1e1; font-family: 'Segoe UI', Tahoma, sans-serif; margin: 0; display: flex; height: 100vh; }
        .side { width: 320px; background: #252526; padding: 20px; border-right: 2px solid #333; display:flex; flex-direction:column; }
        .main { flex: 1; display: flex; flex-direction: column; background: #000; padding: 10px; }
        #log { flex: 1; overflow-y: auto; padding: 15px; background: #050505; border: 1px solid #444; font-size: 14px; line-height: 1.5; }
        .stat-box { background: #333; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 13px; }
        input { background: #000; border: 1px solid #555; color: #fff; padding: 10px; border-radius: 4px; width: 100%; box-sizing: border-box; margin-bottom: 8px; }
        button { padding: 10px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 5px; color: white; }
        .mc-text { white-space: pre-wrap; word-wrap: break-word; }
    </style>
</head>
<body>
    <div class="side">
        <h3 style="color:#1f6feb; margin-top:0;">SKY-BOT v29</h3>
        <div class="stat-box">
            <div>📍 XYZ: <span id="pos">-</span></div>
            <div>❤️ Can: <span id="hp">-</span></div>
        </div>
        <input id="h" placeholder="IP:Port">
        <input id="u" placeholder="Bot İsmi">
        <button style="background:#1f6feb" onclick="connect()">BAĞLAN</button>
        <hr style="border:0.5px solid #444; margin:10px 0;">
        <button style="background:#d4a017; color:#000" onclick="socket.emit('drop-all')">BOŞALT</button>
        <input id="c" placeholder="Sandık (X,Y,Z)">
        <input id="b" placeholder="Hedef (X,Y,Z)">
        <button style="background:#238636" onclick="start()">BAŞLAT</button>
        <button style="background:#da3633" onclick="stop()">DURDUR</button>
    </div>
    <div class="main">
        <div id="log"></div>
        <div style="display:flex; gap:5px; margin-top:10px;">
            <input id="msg" placeholder="Komut veya mesaj yaz..." style="margin:0; flex:1;">
            <button style="background:#1f6feb; width:80px; margin:0;" onclick="send()">YAZ</button>
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
        
        bot = mineflayer.createBot({
            host: host,
            port: parseInt(port),
            username: data.u,
            version: "1.16.5",
            auth: 'offline'
        });

        bot.loadPlugin(pathfinder);

        // --- GELİŞMİŞ MESAJ YAKALAMA ---
        bot.on('message', (jsonMsg) => {
            let messageHTML = jsonMsg.toHTML();
            
            // Eğer toHTML boş veya hatalı dönerse düz metne geç
            if (!messageHTML || messageHTML === "<span></span>" || messageHTML.length < 5) {
                messageHTML = `<span>${jsonMsg.toString()}</span>`;
            }
            
            socket.emit('log', messageHTML);
        });

        // Alternatif yakalayıcı (Hiçbir şey kaçmasın diye)
        bot.on('messagestr', (str) => {
            if(str.trim().length > 0 && !str.includes('health')) { // Çakışmayı önle
                 // Sadece logda görünmeyen kritik sistem mesajları için yedek
                 console.log("Sohbet Yedek:", str);
            }
        });

        bot.on('login', () => socket.emit('log', '<b style="color:#55ff55">[SİSTEM] Sunucu bağlantısı kuruldu.</b>'));
        
        setInterval(() => {
            if(bot && bot.entity) {
                socket.emit('stats', {
                    pos: `${Math.round(bot.entity.position.x)},${Math.round(bot.entity.position.y)},${Math.round(bot.entity.position.z)}`,
                    hp: Math.round(bot.health)
                });
            }
        }, 3000);
    });

    socket.on('chat', (m) => { if(bot) bot.chat(m); });
    socket.on('stop', () => { automationActive = false; isWorking = false; });
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
        socket.emit('log', '<i>[SİSTEM] Envanter boşaltıldı.</i>');
    });
});

process.on('uncaughtException', (e) => console.log('Render Hatası Engellendi:', e));
server.listen(process.env.PORT || 10000, '0.0.0.0');
