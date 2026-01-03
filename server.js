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

const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>SkyBot v30</title></head>
<body style="background:#000; color:#0f0; font-family:monospace; padding:20px;">
    <h2 style="color:#fff">SKY-BOT TERMINAL v30</h2>
    
    <div style="background:#111; padding:15px; border:1px solid #333; margin-bottom:10px;">
        <input id="h" placeholder="IP:Port"> <input id="u" placeholder="Bot İsmi">
        <button onclick="connect()" style="cursor:pointer">BAGLAN</button>
    </div>

    <div id="log" style="height:400px; overflow-y:scroll; border:1px solid #0f0; padding:10px; margin-bottom:10px; background:#000; white-space:pre-wrap;"></div>
    
    <div style="display:flex; gap:5px;">
        <input id="msg" placeholder="Komut yaz (örn: /login 123)" style="flex:1; padding:10px; background:#111; color:#0f0; border:1px solid #0f0;">
        <button onclick="send()" style="padding:10px 20px; background:#0f0; color:#000; border:none; font-weight:bold; cursor:pointer;">GÖNDER</button>
    </div>

    <hr style="border:0.5px solid #333; margin:20px 0;">
    <input id="c" placeholder="Sandik X,Y,Z"> <input id="b" placeholder="Hedef X,Y,Z">
    <button onclick="start()" style="padding:10px; background:white; cursor:pointer;">OTOMASYONU BASLAT</button>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function send() { const i=document.getElementById('msg'); if(i.value){ socket.emit('chat', i.value); i.value=''; } }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        
        socket.on('log', m => { 
            const l = document.getElementById('log'); 
            l.innerHTML += '<div>' + m + '</div>'; 
            l.scrollTop = l.scrollHeight; 
        });

        document.getElementById('msg').onkeydown = (e) => { if(e.key==='Enter') send(); };
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

io.on('connection', (socket) => {
    socket.on('conn', (data) => {
        if(bot) bot.quit();
        const [host, port] = data.h.split(':');
        
        bot = mineflayer.createBot({
            host, 
            port: parseInt(port)||25565, 
            username: data.u, 
            version: "1.16.5", 
            auth: 'offline',
            checkTimeoutInterval: 60000
        });

        bot.loadPlugin(pathfinder);

        // 1. YÖNTEM: Standart Chat
        bot.on('message', (json) => {
            socket.emit('log', json.toString()); 
        });

        // 2. YÖNTEM: Ham String (Lobi mesajları için en iyisi)
        bot.on('messagestr', (str) => {
            if(str.trim()) socket.emit('log', "[GELEN]: " + str);
        });

        // 3. YÖNTEM: Action Bar / Sistem mesajları
        bot._client.on('chat', (packet) => {
            try {
                const msg = JSON.parse(packet.message);
                if(msg.text || msg.extra) {
                    // Burası en derindeki mesajları bile yakalar
                    console.log("Paket yakalandı");
                }
            } catch(e){}
        });

        bot.on('login', () => socket.emit('log', '<b>[SİSTEM] Sunucuya girildi, mesajlar bekleniyor...</b>'));
        bot.on('kicked', (reason) => socket.emit('log', '<b>[ATILDI]</b> ' + reason));
        bot.on('error', (err) => socket.emit('log', '<b>[HATA]</b> ' + err.message));
    });

    socket.on('chat', (m) => {
        if(bot) {
            bot.chat(m);
            socket.emit('log', '<span style="color:#888">[SİZ]: ' + m + '</span>');
        }
    });

    // Otomasyon döngüsü (En kararlı hali)
    socket.on('start', async (data) => {
        if(!bot) return;
        const cP = new vec3(...data.c.split(',').map(Number));
        const bP = new vec3(...data.b.split(',').map(Number));
        
        while(true) {
            try {
                bot.pathfinder.setMovements(new Movements(bot, require('minecraft-data')(bot.version)));
                
                socket.emit('log', "Sandığa gidiliyor...");
                await bot.pathfinder.goto(new goals.GoalNear(cP.x, cP.y, cP.z, 1));
                
                const chestBlock = bot.blockAt(cP);
                const chest = await bot.openChest(chestBlock);
                for (const item of chest.containerItems()) {
                    await chest.withdraw(item.type, null, item.count);
                    await new Promise(r => setTimeout(r, 500));
                }
                await chest.close();

                socket.emit('log', "Hedefe gidiliyor...");
                await bot.pathfinder.goto(new goals.GoalNear(bP.x, bP.y, bP.z, 1));
                
                const win = await bot.activateBlock(bot.blockAt(bP));
                for (const item of bot.inventory.items()) {
                    await bot.clickWindow(item.slot, 0, 1);
                    await new Promise(r => setTimeout(r, 500));
                }
                await bot.closeWindow(win);
            } catch(e) {
                socket.emit('log', "Döngü hatası (3sn beklenecek): " + e.message);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    });
});

server.listen(process.env.PORT || 10000);
