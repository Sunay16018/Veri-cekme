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

// --- WEB ARAYÜZÜ ---
const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>SkyBot v8 - Pro</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #0d1117; color: white; font-family: sans-serif; margin: 0; display: flex; height: 100vh; }
        .side { width: 320px; background: #161b22; padding: 20px; border-right: 1px solid #333; display:flex; flex-direction:column; overflow-y: auto; }
        .main { flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 10px; }
        input { background: #010409; border: 1px solid #333; color: white; padding: 10px; border-radius: 5px; width: 100%; margin-bottom: 8px; box-sizing: border-box; font-size: 13px; }
        button { padding: 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 5px; color: white; transition: 0.2s; }
        button:hover { opacity: 0.8; }
        #log { flex: 1; background: black; border-radius: 8px; padding: 15px; overflow-y: auto; font-family: monospace; font-size: 13px; border: 1px solid #333; line-height:1.5; color: #d1d5db; }
        h3 { color: #58a6ff; margin-top: 0; }
        label { font-size: 12px; color: #8b949e; display: block; margin-bottom: 4px; }
    </style>
</head>
<body>
    <div class="side">
        <h3>SKY-BOT v8</h3>
        <input id="h" placeholder="Sunucu IP:Port">
        <input id="u" placeholder="Bot İsmi">
        <button style="background:#1f6feb" onclick="connect()">BAĞLAN</button>
        <button style="background:#444" onclick="disconnect()">BAĞLANTIYI KES</button>
        
        <hr style="border:0.5px solid #333; margin:15px 0; width:100%;">
        
        <label>Sadece Yürü (X, Y, Z)</label>
        <input id="g" placeholder="7770, 100, 7800">
        <button style="background:#8957e5" onclick="goToPos()">GİT</button>

        <hr style="border:0.5px solid #333; margin:15px 0; width:100%;">

        <label>Otomasyon: Sandık (X, Y, Z)</label>
        <input id="c" placeholder="7779, 101, 7822">
        <label>Otomasyon: Hedef Blok (X, Y, Z)</label>
        <input id="b" placeholder="7785, 101, 7825">
        <button style="background:#238636" onclick="start()">OTOMASYONU BAŞLAT</button>
        <button style="background:#da3633" onclick="stop()">DURDUR</button>
    </div>
    <div class="main">
        <div id="log"></div>
        <div style="display:flex; gap:10px;">
            <input id="msg" placeholder="Mesaj veya komut yaz..." style="margin:0;">
            <button style="background:#1f6feb; width:100px; margin:0;" onclick="send()">YAZ</button>
        </div>
    </div>
    <script>
        const socket = io();
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function disconnect() { socket.emit('disc'); }
        function goToPos() { socket.emit('walk-to', document.getElementById('g').value); }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        function stop() { socket.emit('stop'); }
        function send() { const i=document.getElementById('msg'); if(i.value){ socket.emit('chat', i.value); i.value=''; } }
        
        socket.on('log', m => { 
            const l=document.getElementById('log'); 
            l.innerHTML += '<div>'+m+'</div>'; 
            l.scrollTop = l.scrollHeight; 
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

io.on('connection', (socket) => {
    socket.on('conn', (data) => {
        if(bot) bot.quit();
        const [ip, port] = data.h.split(':');
        bot = mineflayer.createBot({ host: ip, port: parseInt(port)||25565, username: data.u, version: "1.16.5", auth: 'offline' });
        bot.loadPlugin(pathfinder);
        
        bot.on('login', () => socket.emit('log', '<b style="color:lime">[BAĞLANDI] Giriş başarılı.</b>'));
        bot.on('message', (m) => socket.emit('log', `[CHAT] ${m.toHTML()}`));
        bot.on('error', (e) => socket.emit('log', '<span style="color:red">Hata: '+e.message+'</span>'));
    });

    socket.on('disc', () => { if(bot) bot.quit(); automationActive = false; socket.emit('log', 'Bağlantı kesildi.'); });
    socket.on('chat', (m) => { if(bot) bot.chat(m); });
    socket.on('stop', () => { automationActive = false; if(bot) bot.pathfinder.setGoal(null); socket.emit('log', 'Otomasyon durduruldu.'); });

    // --- SADECE YÜRÜME KOMUTU ---
    socket.on('walk-to', async (coords) => {
        if(!bot) return socket.emit('log', '<b style="color:red">Bot bağlı değil!</b>');
        try {
            const p = coords.split(',').map(n => Math.floor(Number(n.trim())));
            const target = new vec3(p[0], p[1], p[2]);
            socket.emit('log', 'Hedefe yürünüyor: ' + target);
            
            const mcData = require('minecraft-data')(bot.version);
            bot.pathfinder.setMovements(new Movements(bot, mcData));
            await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 1));
            socket.emit('log', '<b style="color:lime">Hedefe ulaşıldı.</b>');
        } catch (e) {
            socket.emit('log', '<span style="color:red">Yürüme hatası: '+e.message+'</span>');
        }
    });

    // --- OTOMASYON DÖNGÜSÜ (V7 STABİL) ---
    socket.on('start', async (data) => {
        if(!bot) return;
        automationActive = true;
        const cP = data.c.split(',').map(n => Math.floor(Number(n.trim())));
        const bP = data.b.split(',').map(n => Math.floor(Number(n.trim())));
        const chestVec = new vec3(cP[0], cP[1], cP[2]);
        const targetVec = new vec3(bP[0], bP[1], bP[2]);

        socket.emit('log', '<b style="color:cyan">[OTO] Başlatıldı.</b>');

        const runLoop = async () => {
            if(!automationActive || !bot) return;
            try {
                const mcData = require('minecraft-data')(bot.version);
                const movements = new Movements(bot, mcData);
                movements.canDig = false;
                bot.pathfinder.setMovements(movements);

                // 1. Sandık
                if (bot.entity.position.distanceTo(chestVec) > 3) {
                    await bot.pathfinder.goto(new goals.GoalNear(chestVec.x, chestVec.y, chestVec.z, 2));
                }
                const chestBlock = bot.blockAt(chestVec);
                if (chestBlock && chestBlock.name !== 'air') {
                    await bot.lookAt(chestBlock.position);
                    const chest = await bot.openChest(chestBlock);
                    for (const item of chest.containerItems()) {
                        if (item.name.includes('block')) {
                            await new Promise(r => setTimeout(r, 250)); 
                            try { await chest.withdraw(item.type, null, item.count); } catch(e){}
                        }
                    }
                    await chest.close();
                }

                // Eline al
                const blockInInv = bot.inventory.items().find(i => i.name.includes('block'));
                if (blockInInv) await bot.equip(blockInInv, 'hand');

                // 2. Teslimat
                if (bot.entity.position.distanceTo(targetVec) > 3) {
                    await bot.pathfinder.goto(new goals.GoalNear(targetVec.x, targetVec.y, targetVec.z, 2));
                }
                const targetBlock = bot.blockAt(targetVec);
                if (targetBlock && targetBlock.name !== 'air') {
                    await bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5));
                    bot.setControlState('sneak', true);
                    const window = await bot.activateBlock(targetBlock);
                    for (const item of bot.inventory.items()) {
                        if (item.name.includes('block')) {
                            await new Promise(r => setTimeout(r, 250));
                            try { await bot.clickWindow(item.slot, 0, 1); } catch(e){}
                        }
                    }
                    await new Promise(r => setTimeout(r, 500));
                    bot.closeWindow(window);
                    bot.setControlState('sneak', false);
                    socket.emit('log', '<b style="color:lime">[DÖNGÜ TAMAM]</b>');
                }
            } catch (err) {
                socket.emit('log', 'Sistem Mesajı: ' + err.message);
            }
            if(automationActive) setTimeout(runLoop, 2000);
        };
        runLoop();
    });
});

server.listen(process.env.PORT || 10000, '0.0.0.0');
