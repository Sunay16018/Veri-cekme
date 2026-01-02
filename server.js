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

// HTML ve Panel Kısmı (Aynı Kalıyor)
const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>SkyBot v12</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #0d1117; color: white; font-family: sans-serif; margin: 0; display: flex; height: 100vh; }
        .side { width: 320px; background: #161b22; padding: 20px; border-right: 1px solid #333; display:flex; flex-direction:column; overflow-y: auto; }
        .main { flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 10px; }
        input { background: #010409; border: 1px solid #333; color: white; padding: 10px; border-radius: 5px; width: 100%; margin-bottom: 8px; box-sizing: border-box; }
        button { padding: 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 5px; color: white; }
        #log { flex: 1; background: black; border-radius: 8px; padding: 15px; overflow-y: auto; font-family: monospace; font-size: 13px; border: 1px solid #333; color: #00ff00; }
        label { font-size: 11px; color: #8b949e; }
    </style>
</head>
<body>
    <div class="side">
        <h3>SKY-BOT v12</h3>
        <input id="h" placeholder="IP:Port">
        <input id="u" placeholder="Bot İsmi">
        <button style="background:#1f6feb" onclick="connect()">BAĞLAN</button>
        <button style="background:#444" onclick="disconnect()">KES</button>
        <hr style="border:0.5px solid #333; margin:15px 0;">
        <label>Yürü</label><input id="g" placeholder="X, Y, Z">
        <button style="background:#8957e5" onclick="goToPos()">GİT</button>
        <hr style="border:0.5px solid #333; margin:15px 0;">
        <label>Sandık</label><input id="c" placeholder="X, Y, Z">
        <label>Hedef Blok</label><input id="b" placeholder="X, Y, Z">
        <button style="background:#238636" onclick="start()">BAŞLAT</button>
        <button style="background:#da3633" onclick="stop()">DURDUR</button>
    </div>
    <div class="main"><div id="log"></div><div style="display:flex; gap:10px;"><input id="msg" style="margin:0; flex:1;"><button style="background:#1f6feb; width:80px;" onclick="send()">YAZ</button></div></div>
    <script>
        const socket = io();
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function disconnect() { socket.emit('disc'); }
        function goToPos() { socket.emit('walk-to', document.getElementById('g').value); }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        function stop() { socket.emit('stop'); }
        function send() { const i=document.getElementById('msg'); socket.emit('chat', i.value); i.value=''; }
        socket.on('log', m => { const l=document.getElementById('log'); l.innerHTML += '<div>'+m+'</div>'; l.scrollTop = l.scrollHeight; });
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
        bot.on('login', () => socket.emit('log', '>> BAĞLANDI'));
        bot.on('message', (m) => socket.emit('log', `[CHAT] ${m.toHTML()}`));
    });

    socket.on('disc', () => { if(bot) bot.quit(); automationActive = false; socket.emit('log', '>> AYRILDI'); });
    socket.on('chat', (m) => { if(bot) bot.chat(m); });
    socket.on('stop', () => { automationActive = false; socket.emit('log', '>> OTOMASYON DURDURULDU'); });

    socket.on('walk-to', async (coords) => {
        if(!bot) return;
        const p = coords.split(',').map(n => Math.floor(Number(n.trim())));
        bot.pathfinder.setMovements(new Movements(bot, require('minecraft-data')(bot.version)));
        await bot.pathfinder.goto(new goals.GoalNear(p[0], p[1], p[2], 1));
    });

    socket.on('start', async (data) => {
        if(!bot) return;
        automationActive = true;
        const chestVec = new vec3(...data.c.split(',').map(n => Math.floor(Number(n.trim()))));
        const targetVec = new vec3(...data.b.split(',').map(n => Math.floor(Number(n.trim()))));

        const runLoop = async () => {
            if(!automationActive || !bot) return;
            try {
                // ENVANTER DOLULUK KONTROLÜ
                const isFull = bot.inventory.emptySlotCount() === 0;
                const hasBlocks = bot.inventory.items().some(i => i.name.includes('block'));

                // 1. ADIM: SANDIĞA GİT VE AL
                if (!isFull) {
                    socket.emit('log', 'Sandığa gidiliyor...');
                    await bot.pathfinder.goto(new goals.GoalNear(chestVec.x, chestVec.y, chestVec.z, 2));
                    
                    const chestBlock = bot.blockAt(chestVec);
                    if (chestBlock) {
                        await bot.lookAt(chestBlock.position);
                        const chest = await bot.openChest(chestBlock);
                        
                        const chestItems = chest.containerItems();
                        for (const item of chestItems) {
                            if (item.name.includes('block')) {
                                // Envanter doldu mu diye her eşyada kontrol et
                                if (bot.inventory.emptySlotCount() === 0) {
                                    socket.emit('log', '<b style="color:yellow">>> ENVANTER DOLDU!</b>');
                                    break;
                                }
                                await chest.withdraw(item.type, null, item.count);
                                await new Promise(r => setTimeout(r, 150));
                            }
                        }
                        await chest.close();
                    }
                } else {
                    socket.emit('log', '<b style="color:yellow">>> ENVANTER ZATEN DOLU.</b>');
                }

                // 2. ADIM: ELİNE AL VE TESLİM ET
                const finalBlocks = bot.inventory.items().filter(i => i.name.includes('block'));
                if (finalBlocks.length > 0) {
                    await bot.equip(finalBlocks[0], 'hand');
                    socket.emit('log', 'Teslimata gidiliyor...');
                    await bot.pathfinder.goto(new goals.GoalNear(targetVec.x, targetVec.y, targetVec.z, 2));
                    
                    const targetBlock = bot.blockAt(targetVec);
                    if (targetBlock) {
                        await bot.lookAt(targetBlock.position.offset(0.5, 0.5, 0.5));
                        bot.setControlState('sneak', true);
                        const window = await bot.activateBlock(targetBlock);
                        
                        for (const item of bot.inventory.items()) {
                            if (item.name.includes('block')) {
                                await bot.clickWindow(item.slot, 0, 1);
                                await new Promise(r => setTimeout(r, 150));
                            }
                        }
                        await new Promise(r => setTimeout(r, 400));
                        bot.closeWindow(window);
                        bot.setControlState('sneak', false);
                        socket.emit('log', '<b style="color:cyan">Döngü Tamamlandı.</b>');
                    }
                } else {
                    socket.emit('log', '<span style="color:red">Envanterde blok yok, tekrar denenecek...</span>');
                }
            } catch (err) {
                socket.emit('log', 'Hata: ' + err.message);
            }
            if(automationActive) setTimeout(runLoop, 1000);
        };
        runLoop();
    });
});

server.listen(process.env.PORT || 10000, '0.0.0.0');
