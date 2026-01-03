const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const vec3 = require('vec3');
const inventoryViewer = require('mineflayer-web-inventory'); // Envanter takibi için

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let bot = null;
let automationActive = false;
let isWorking = false;

// HTML: Sadece fonksiyonel, görsel süs yok
const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>SkyBot v31 - High Performance Log</title>
    <style>
        body { background: #000; color: #0f0; font-family: 'Consolas', monospace; margin: 0; padding: 10px; display: flex; flex-direction: column; height: 100vh; }
        #terminal { flex: 1; border: 1px solid #333; overflow-y: scroll; padding: 10px; background: #050505; font-size: 13px; line-height: 1.4; border-bottom: 2px solid #1f6feb; }
        .controls { background: #111; padding: 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; border-bottom: 1px solid #333; }
        input { background: #000; border: 1px solid #444; color: #0f0; padding: 8px; width: 100%; box-sizing: border-box; }
        button { background: #222; color: #fff; border: 1px solid #555; padding: 8px; cursor: pointer; font-weight: bold; }
        button:hover { background: #333; border-color: #1f6feb; }
        .system { color: #58a6ff; }
        .error { color: #f85149; }
        .chat { color: #e1e1e1; }
        .action { color: #d2a8ff; font-style: italic; }
        .bot-status { color: #d4a017; font-weight: bold; }
    </style>
</head>
<body>
    <div class="controls">
        <input id="h" placeholder="IP:Port">
        <input id="u" placeholder="Kullanıcı Adı">
        <button onclick="connect()">SUNUCUYA BAĞLAN</button>
        <button onclick="socket.emit('disc')" style="color:red">KES</button>
        <input id="c" placeholder="Sandık (X,Y,Z)">
        <input id="b" placeholder="Hedef (X,Y,Z)">
        <button onclick="start()" style="color:#238636">OTOMASYONU BAŞLAT</button>
        <button onclick="stop()" style="color:red">DURDUR</button>
    </div>
    <div id="terminal"></div>
    <div style="display:flex; padding:10px; background:#111;">
        <input id="msg" placeholder="Komut veya mesaj yazın..." style="flex:1;">
        <button onclick="send()" style="width:100px; margin-left:10px;">GÖNDER</button>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const term = document.getElementById('terminal');
        
        function log(msg, cls='') {
            const d = document.createElement('div');
            d.className = cls;
            d.innerHTML = \`[\${new Date().toLocaleTimeString()}] \${msg}\`;
            term.appendChild(d);
            term.scrollTop = term.scrollHeight;
            if(term.childNodes.length > 500) term.removeChild(term.firstChild);
        }

        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        function stop() { socket.emit('stop'); }
        function send() { const i=document.getElementById('msg'); if(i.value){ socket.emit('chat', i.value); i.value=''; } }

        socket.on('log', d => log(d.m, d.c));
        document.getElementById('msg').onkeydown = e => { if(e.key==='Enter') send(); };
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

io.on('connection', (socket) => {
    const logger = (m, c = '') => socket.emit('log', { m, c });

    socket.on('conn', (data) => {
        if (bot) { bot.quit(); logger("Eski bot bağlantısı sonlandırıldı.", "system"); }

        const [host, port] = data.h.split(':');
        bot = mineflayer.createBot({
            host,
            port: parseInt(port) || 25565,
            username: data.u,
            version: "1.16.5",
            auth: 'offline',
            hideErrors: false,
            checkTimeoutInterval: 90000
        });

        bot.loadPlugin(pathfinder);
        // inventoryViewer(bot); // İsteğe bağlı: Web üzerinden envanter izlemek için

        // --- DERİN PAKET DİNLEME (TERMINAL ASLA BOŞ KALMAZ) ---

        // 1. Standart Mesajlar
        bot.on('message', (jsonMsg) => {
            logger(jsonMsg.toString(), "chat");
        });

        // 2. Ham Paket Dinleyici (En Derin Katman)
        bot._client.on('chat', (packet) => {
            try {
                const raw = JSON.parse(packet.message);
                if (packet.position === 2) {
                    logger("[ACTION BAR] " + (raw.text || raw.value || "Veri okunamadı"), "action");
                }
            } catch (e) {}
        });

        // 3. Durum Değişiklikleri
        bot.on('login', () => logger("Sunucu el sıkışması tamamlandı. Giriş yapılıyor...", "system"));
        bot.on('spawn', () => logger("Bot dünyada doğdu. Konum: " + bot.entity.position, "bot-status"));
        bot.on('health', () => logger(`Can: ${Math.round(bot.health)} | Açlık: ${Math.round(bot.food)}`, "bot-status"));
        bot.on('death', () => logger("Bot öldü!", "error"));
        bot.on('kicked', (reason) => logger("SUNUCUDAN ATILDI: " + reason, "error"));
        bot.on('error', (err) => logger("BAĞLANTI HATASI: " + err.message, "error"));

        // 4. Deneyim ve Level (Bazı sunucular burayı mesaj alanı olarak kullanır)
        bot.on('experience', () => logger(`XP Güncellendi: ${bot.experience.points}`, "system"));
    });

    // GELİŞMİŞ OTOMASYON DÖNGÜSÜ
    socket.on('start', async (data) => {
        if (!bot) return logger("Önce bağlanmalıs.n!", "error");
        automationActive = true;
        const cP = new vec3(...data.c.split(',').map(Number));
        const bP = new vec3(...data.b.split(',').map(Number));

        logger("Otomasyon başlatıldı. Sandık: " + cP + " | Hedef: " + bP, "system");

        const worker = async () => {
            if (!automationActive || isWorking) return;
            isWorking = true;
            try {
                const mcData = require('minecraft-data')(bot.version);
                bot.pathfinder.setMovements(new Movements(bot, mcData));

                // ENVANTER KONTROLÜ
                const blockItems = bot.inventory.items().filter(i => i.name.includes('block') || i.name.includes('cobble'));

                if (blockItems.length === 0) {
                    logger("Envanter boş, sandığa gidiliyor...", "bot-status");
                    await bot.pathfinder.goto(new goals.GoalNear(cP.x, cP.y, cP.z, 1.2));
                    
                    const block = bot.blockAt(cP);
                    if (!block || !['chest', 'trapped_chest', 'barrel'].includes(block.name)) {
                        logger("HATA: Belirtilen koordinatta sandık bulunamadı!", "error");
                    } else {
                        const chest = await bot.openChest(block);
                        logger("Sandık açıldı, eşyalar toplanıyor...", "bot-status");
                        for (const item of chest.containerItems()) {
                            await chest.withdraw(item.type, null, item.count);
                            await new Promise(r => setTimeout(r, 450));
                        }
                        await chest.close();
                    }
                } else {
                    logger(`Elimde ${blockItems.length} slot eşya var, hedefe gidiliyor...`, "bot-status");
                    await bot.pathfinder.goto(new goals.GoalNear(bP.x, bP.y, bP.z, 1.2));
                    
                    const targetBlock = bot.blockAt(bP);
                    if (targetBlock) {
                        const win = await bot.activateBlock(targetBlock);
                        logger("Teslimat penceresi açıldı, aktarılıyor...", "bot-status");
                        for (const item of bot.inventory.items()) {
                            await bot.clickWindow(item.slot, 0, 1);
                            await new Promise(r => setTimeout(r, 450));
                        }
                        await bot.closeWindow(win);
                    }
                }
            } catch (e) {
                logger("Döngü hatası: " + e.message, "error");
            }
            isWorking = false;
            if (automationActive) setTimeout(worker, 2000);
        };
        worker();
    });

    socket.on('chat', (m) => { if(bot) bot.chat(m); });
    socket.on('stop', () => { automationActive = false; logger("Otomasyon durduruldu.", "system"); });
    socket.on('disc', () => { if(bot) bot.quit(); logger("Bağlantı kesildi.", "system"); });
});

// Render çökme koruması
process.on('uncaughtException', (e) => console.error('Kritik Hata Yakalandı:', e));
process.on('unhandledRejection', (e) => console.error('Söz Verme Hatası:', e));

server.listen(process.env.PORT || 10000, '0.0.0.0', () => {
    console.log("Sunucu aktif port:", process.env.PORT || 10000);
});
                                                              
