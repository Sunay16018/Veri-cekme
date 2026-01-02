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
    <meta charset="UTF-8"><title>SkyBot v4 - Render</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #0d1117; color: white; font-family: sans-serif; margin: 0; display: flex; height: 100vh; }
        .side { width: 300px; background: #161b22; padding: 20px; border-right: 1px solid #333; display:flex; flex-direction:column; }
        .main { flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 10px; }
        input { background: #010409; border: 1px solid #333; color: white; padding: 10px; border-radius: 5px; width: 100%; margin-bottom: 8px; box-sizing: border-box; }
        button { padding: 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 5px; color: white; }
        #log { flex: 1; background: black; border-radius: 8px; padding: 15px; overflow-y: auto; font-family: monospace; font-size: 13px; border: 1px solid #333; line-height:1.5; }
        .status { font-size: 12px; color: #8b949e; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="side">
        <h3>SKY-BOT v4</h3>
        <input id="h" placeholder="Sunucu IP:Port">
        <input id="u" placeholder="Bot İsmi">
        <button style="background:#1f6feb" onclick="connect()">BAĞLAN</button>
        <button style="background:#444" onclick="disconnect()">BAĞLANTIYI KES</button>
        <hr style="border:0.5px solid #333; margin:15px 0; width:100%;">
        <label>Sandık (X,Y,Z)</label><input id="c" placeholder="10, 64, 20">
        <label>Hedef Blok (X,Y,Z)</label><input id="b" placeholder="15, 64, 25">
        <button style="background:#238636" onclick="start()">OTOMASYONU BAŞLAT</button>
        <button style="background:#da3633" onclick="stop()">DURDUR</button>
    </div>
    <div class="main">
        <div id="log"></div>
        <div style="display:flex; gap:10px;">
            <input id="msg" placeholder="Mesaj veya /login..." style="margin:0;">
            <button style="background:#1f6feb; width:100px; margin:0;" onclick="send()">GÖNDER</button>
        </div>
    </div>
    <script>
        const socket = io();
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function disconnect() { socket.emit('disc'); }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        function stop() { socket.emit('stop'); }
        function send() { const i=document.getElementById('msg'); if(i.value){ socket.emit('chat', i.value); i.value=''; } }
        socket.on('log', m => { const l=document.getElementById('log'); l.innerHTML += '<div>'+m+'</div>'; l.scrollTop = l.scrollHeight; });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

io.on('connection', (socket) => {
    
    socket.on('conn', (data) => {
        if (bot) { bot.quit(); socket.emit('log', 'Eski bot kapatılıyor...'); }
        
        const [ip, port] = data.h.split(':');
        bot = mineflayer.createBot({
            host: ip,
            port: parseInt(port) || 25565,
            username: data.u,
            version: "1.16.5",
            auth: 'offline'
        });

        bot.loadPlugin(pathfinder);

        bot.on('login', () => socket.emit('log', '<b style="color:lime">[BAĞLANDI] Lütfen /login yapın ve Skyblock\'a geçin.</b>'));
        bot.on('message', (m) => socket.emit('log', `[CHAT] ${m.toHTML()}`));
        bot.on('kicked', (r) => { automationActive = false; socket.emit('log', '<b style="color:red">[ATILDI] Sebep: '+JSON.stringify(r)+'</b>'); });
        bot.on('error', (e) => socket.emit('log', '<b style="color:red">[HATA] '+e.message+'</b>'));
    });

    socket.on('disc', () => {
        automationActive = false;
        if(bot) { bot.quit(); bot = null; }
        socket.emit('log', '<b style="color:orange">[SİSTEM] Botun bağlantısı kesildi.</b>');
    });

    socket.on('chat', (m) => { if(bot) bot.chat(m); });

    socket.on('stop', () => { 
        automationActive = false; 
        if(bot) bot.pathfinder.setGoal(null);
        socket.emit('log', '<b>[DURDURULDU] Otomasyon kapatıldı.</b>'); 
    });

    socket.on('start', async (data) => {
        if(!bot) return socket.emit('log', '<b style="color:red">Önce botu bağla!</b>');
        automationActive = true;
        
        const cV = new vec3(...data.c.split(',').map(Number));
        const bV = new vec3(...data.b.split(',').map(Number));

        socket.emit('log', '<b style="color:cyan">[OTO] Döngü Aktif. Hedefler: Sandık('+data.c+') Blok('+data.b+')</b>');

        const automationLoop = async () => {
            if (!automationActive || !bot) return;

            try {
                const mcData = require('minecraft-data')(bot.version);
                const movements = new Movements(bot, mcData);
                movements.canDig = false;
                bot.pathfinder.setMovements(movements);

                // 1. Sandık İşlemi
                socket.emit('log', '<i>Sandığa gidiliyor...</i>');
                await bot.pathfinder.goto(new goals.GoalNear(cV.x, cV.y, cV.z, 2));
                
                const chestBlock = bot.blockAt(cV);
                if (chestBlock && chestBlock.name !== 'air') {
                    const chest = await bot.openChest(chestBlock);
                    for (const item of chest.containerItems()) {
                        if (item.name.includes('block')) await chest.withdraw(item.type, null, item.count);
                    }
                    await chest.close();
                }

                // 2. Blok İşlemi
                socket.emit('log', '<i>Hedefe gidiliyor...</i>');
                await bot.pathfinder.goto(new goals.GoalNear(bV.x, bV.y, bV.z, 2));
                
                const target = bot.blockAt(bV);
                if (target && target.name !== 'air') {
                    await bot.lookAt(target.position.offset(0.5, 0.5, 0.5));
                    bot.setControlState('sneak', true);
                    const window = await bot.activateBlock(target);
                    for (const item of bot.inventory.items()) {
                        if (item.name.includes('block')) await bot.clickWindow(item.slot, 0, 1);
                    }
                    bot.closeWindow(window);
                    bot.setControlState('sneak', false);
                    socket.emit('log', '<b style="color:lime">[TAMAMLANDI] Döngü 5sn içinde tekrarlanacak.</b>');
                }
            } catch (e) {
                socket.emit('log', '<span style="color:orange">Uyarı: '+e.message+'</span>');
            }

            if(automationActive) setTimeout(automationLoop, 5000);
        };

        automationLoop();
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log('Sunucu calisiyor.'));
      
