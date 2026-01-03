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

// Arayüz aynı kalıyor, sadece log ve buton fonksiyonları güçlendirildi
const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>SkyBot v24 - Anti-Kick</title>
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
        <h3>SKY-BOT v24</h3>
        <input id="h" placeholder="SunucuIP:Port">
        <input id="u" placeholder="Bot İsmi">
        <button style="background:#1f6feb" onclick="connect()">BAĞLAN</button>
        <button style="background:#444" onclick="disconnect()">BAĞLANTIYI KES</button>
        <hr style="border:0.5px solid #333; margin:15px 0;">
        <button id="dropBtn" style="background:#d4a017; color: black;" onclick="dropAll()">ENVANTERİ GÜVENLİ BOŞALT</button>
        <hr style="border:0.5px solid #333; margin:15px 0;">
        <label>Sandık (X,Y,Z)</label><input id="c" placeholder="7779, 101, 7822">
        <label>Hedef (X,Y,Z)</label><input id="b" placeholder="7785, 101, 7825">
        <button style="background:#238636" onclick="start()">OTOMASYONU BAŞLAT</button>
        <button style="background:#da3633" onclick="stop()">DURDUR</button>
    </div>
    <div class="main">
        <div id="log"></div>
        <div style="display:flex; gap:10px;">
            <input id="msg" placeholder="Mesaj..." style="margin:0; flex:1;">
            <button style="background:#1f6feb; width:80px;" onclick="send()">YAZ</button>
        </div>
    </div>
    <script>
        const socket = io();
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function disconnect() { socket.emit('disc'); }
        function dropAll() { 
            document.getElementById('dropBtn').innerText = "BOŞALTILIYOR...";
            document.getElementById('dropBtn').disabled = true;
            socket.emit('drop-all'); 
        }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        function stop() { socket.emit('stop'); }
        function send() { const i=document.getElementById('msg'); if(i.value){ socket.emit('chat', i.value); i.value=''; } }
        document.getElementById('msg').addEventListener('keypress', (e) => { if(e.key==='Enter') send(); });
        socket.on('log', m => { const l=document.getElementById('log'); l.innerHTML += '<div>' + m + '</div>'; l.scrollTop = l.scrollHeight; });
        socket.on('drop-done', () => {
            document.getElementById('dropBtn').innerText = "ENVANTERİ GÜVENLİ BOŞALT";
            document.getElementById('dropBtn').disabled = false;
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
            version: "1.16.5", // Versiyonu sabitledim, sorun çıkarsa false yapabilirsin
            auth: 'offline'
        });

        bot.loadPlugin(pathfinder);
        bot.on('login', () => socket.emit('log', '<b>>> GİRİŞ BAŞARILI</b>'));
        bot.on('message', (m) => socket.emit('log', `<span style="color:#8b949e">[Sunucu]</span> ${m.toString()}`));
        bot.on('error', (e) => socket.emit('log', `<b style="color:red">HATA: ${e.message}</b>`));
        bot.on('kicked', (reason) => socket.emit('log', `<b style="color:orange">ATILDI: ${reason}</b>`));
    });

    // GÜVENLİ BOŞALTMA (Drop Fix)
    socket.on('drop-all', async () => {
        if(!bot) return;
        const items = bot.inventory.items();
        if(items.length === 0) {
            socket.emit('log', '>> Envanter zaten boş.');
            socket.emit('drop-done');
            return;
        }

        socket.emit('log', `>> ${items.length} parça eşya güvenli şekilde atılıyor...`);
        for (const item of items) {
            try {
                // Her eşyayı yere atarken 400ms bekle (Sunucudan atılmayı engeller)
                await bot.tossStack(item);
                await new Promise(r => setTimeout(r, 400)); 
            } catch (e) {
                console.log("Drop hatası:", e.message);
            }
        }
        socket.emit('log', '>> İşlem bitti, envanter temiz.');
        socket.emit('drop-done');
    });

    socket.on('start', async (data) => {
        if(!bot) return;
        automationActive = true;
        const cP = data.c.split(',').map(n => Math.floor(Number(n.trim())));
        const bP = data.b.split(',').map(n => Math.floor(Number(n.trim())));
        const chestVec = new vec3(cP[0], cP[1], cP[2]);
        const targetVec = new vec3(bP[0], bP[1], bP[2]);

        const runLoop = async () => {
            if(!automationActive || !bot || isWorking) return;
            isWorking = true;
            try {
                const mcData = require('minecraft-data')(bot.version);
                bot.pathfinder.setMovements(new Movements(bot, mcData));
                const items = bot.inventory.items().filter(i => i.name.includes('block'));

                if (items.length === 0) {
                    socket.emit('log', '>> Sandığa gidiliyor...');
                    await bot.pathfinder.goto(new goals.GoalNear(chestVec.x, chestVec.y, chestVec.z, 2));
                    const chest = await bot.openChest(bot.blockAt(chestVec));
                    const blockItems = chest.containerItems().filter(i => i.name.includes('block'));
                    for (const item of blockItems) {
                        if (bot.inventory.emptySlotCount() === 0) break;
                        await chest.withdraw(item.type, null, item.count);
                        await new Promise(r => setTimeout(r, 400)); // Sandıktan alırken de yavaşlatıldı
                    }
                    await chest.close();
                } else {
                    socket.emit('log', '>> Hedefe gidiliyor...');
                    await bot.pathfinder.goto(new goals.GoalNear(targetVec.x, targetVec.y, targetVec.z, 2));
                    const targetBlock = bot.blockAt(targetVec);
                    if (targetBlock) {
                        const win = await bot.activateBlock(targetBlock);
                        const invBlocks = bot.inventory.items().filter(i => i.name.includes('block'));
                        for (const it of invBlocks) {
                            await bot.clickWindow(it.slot, 0, 1);
                            await new Promise(r => setTimeout(r, 400));
                        }
                        await bot.closeWindow(win);
                    }
                }
            } catch (e) { }
            isWorking = false;
            if(automationActive) setTimeout(runLoop, 2000); // Döngü arası 2 saniyeye çıkarıldı
        };
        runLoop();
    });

    socket.on('chat', (m) => bot.chat(m));
    socket.on('stop', () => { automationActive = false; isWorking = false; });
    socket.on('disc', () => { if(bot) bot.quit(); automationActive = false; });
});

server.listen(process.env.PORT || 10000, '0.0.0.0');
