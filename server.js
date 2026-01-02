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
let isWorking = false; // Botun o an meşgul olup olmadığını kontrol eder

const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>SkyBot v21 - Kararlı</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background: #0d1117; color: white; font-family: sans-serif; margin: 0; display: flex; height: 100vh; }
        .side { width: 320px; background: #161b22; padding: 20px; border-right: 1px solid #333; display:flex; flex-direction:column; overflow-y: auto; }
        .main { flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 10px; }
        input { background: #010409; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 100%; margin-bottom: 8px; box-sizing: border-box; }
        button { padding: 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 5px; color: white; }
        #log { flex: 1; background: black; border-radius: 8px; padding: 15px; overflow-y: auto; font-family: monospace; font-size: 13px; border: 1px solid #333; color: #00ff00; }
    </style>
</head>
<body>
    <div class="side">
        <h3>SKY-BOT v21</h3>
        <input id="h" placeholder="IP:Port">
        <input id="u" placeholder="Bot İsmi">
        <button style="background:#1f6feb" onclick="connect()">BAĞLAN</button>
        <button style="background:#444" onclick="disconnect()">KES</button>
        <hr style="border:0.5px solid #333; margin:15px 0;">
        <button style="background:#d4a017; color: black;" onclick="dropAll()">ENVANTERİ BOŞALT</button>
        <hr style="border:0.5px solid #333; margin:15px 0;">
        <label>Sandık</label><input id="c" placeholder="X, Y, Z">
        <label>Hedef</label><input id="b" placeholder="X, Y, Z">
        <button style="background:#238636" onclick="start()">BAŞLAT</button>
        <button style="background:#da3633" onclick="stop()">DURDUR</button>
    </div>
    <div class="main"><div id="log"></div></div>
    <script>
        const socket = io();
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function disconnect() { socket.emit('disc'); }
        function dropAll() { socket.emit('drop-all'); }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        function stop() { socket.emit('stop'); }
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
        bot.on('login', () => socket.emit('log', '<b>>> BAĞLANDI</b>'));
    });

    socket.on('start', async (data) => {
        if(!bot) return;
        automationActive = true;
        const chestVec = new vec3(...data.c.split(',').map(n => Math.floor(Number(n.trim()))));
        const targetVec = new vec3(...data.b.split(',').map(n => Math.floor(Number(n.trim()))));

        const runLoop = async () => {
            if(!automationActive || !bot || isWorking) return;
            
            isWorking = true; // Bot işleme başladı, döngü beklemede kalsın
            try {
                const mcData = require('minecraft-data')(bot.version);
                bot.pathfinder.setMovements(new Movements(bot, mcData));

                const itemsInInv = bot.inventory.items().filter(i => i.name.includes('block'));

                // EĞER ENVANTER BOŞSA SANDIĞA GİT
                if (itemsInInv.length === 0) {
                    socket.emit('log', 'Sandığa gidiliyor...');
                    await bot.pathfinder.goto(new goals.GoalNear(chestVec.x, chestVec.y, chestVec.z, 2));
                    
                    const block = bot.blockAt(chestVec);
                    if (block && block.name !== 'air') {
                        const chest = await bot.openChest(block);
                        const items = chest.containerItems().filter(i => i.name.includes('block'));
                        
                        if (items.length === 0) {
                            socket.emit('log', 'Sandık boş! 10 saniye bekleniyor...');
                            await chest.close();
                            await new Promise(r => setTimeout(r, 10000));
                        } else {
                            for (const item of items) {
                                if (bot.inventory.emptySlotCount() === 0) break;
                                await chest.withdraw(item.type, null, item.count);
                                await new Promise(r => setTimeout(r, 250));
                            }
                            await chest.close();
                            socket.emit('log', 'Eşyalar alındı.');
                        }
                    }
                } 
                // EĞER ENVANTERDE BLOK VARSA HEDEFE GİT
                else {
                    socket.emit('log', 'Dizmeye gidiliyor...');
                    await bot.pathfinder.goto(new goals.GoalNear(targetVec.x, targetVec.y, targetVec.z, 2));
                    
                    const tBlock = bot.blockAt(targetPos);
                    const win = await bot.activateBlock(bot.blockAt(targetVec));
                    const toDrop = bot.inventory.items().filter(i => i.name.includes('block'));
                    
                    for (const it of toDrop) {
                        await bot.clickWindow(it.slot, 0, 1);
                        await new Promise(r => setTimeout(r, 250));
                    }
                    await bot.closeWindow(win);
                    socket.emit('log', 'Teslimat tamamlandı.');
                }
            } catch (err) {
                socket.emit('log', 'Hata: ' + err.message);
            } finally {
                isWorking = false; // İşlem bitti, döngü tekrar çalışabilir
                if(automationActive) setTimeout(runLoop, 1000);
            }
        };
        runLoop();
    });

    socket.on('stop', () => { automationActive = false; isWorking = false; });
    socket.on('drop-all', async () => { /* Aynı Toss Mantığı */ });
    socket.on('disc', () => { if(bot) bot.quit(); automationActive = false; });
});

server.listen(process.env.PORT || 10000, '0.0.0.0');
                        
