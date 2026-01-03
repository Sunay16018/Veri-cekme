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
<head><meta charset="UTF-8"><title>SkyBot Kontrol Paneli</title></head>
<body style="background:#1a1a1a; color:#fff; font-family:sans-serif; padding:20px;">
    <h3 style="color:#1f6feb;">SKY-BOT KONTROL PANELİ</h3>
    
    <div style="background:#2d2d2d; padding:15px; border-radius:8px; margin-bottom:10px;">
        <input id="h" placeholder="IP:Port (örn: oyna.server.com)" style="padding:8px;"> 
        <input id="u" placeholder="Bot İsmi" style="padding:8px;">
        <button onclick="connect()" style="background:#1f6feb; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">BAĞLAN</button>
    </div>

    <div style="background:#2d2d2d; padding:15px; border-radius:8px; margin-bottom:10px;">
        <input id="c" placeholder="Sandık X,Y,Z" style="padding:8px;"> 
        <input id="b" placeholder="Hedef X,Y,Z" style="padding:8px;">
        <button onclick="start()" style="background:#238636; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">OTOMASYONU BAŞLAT</button>
        <button onclick="location.reload()" style="background:#da3633; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">SİSTEMİ SIFIRLA</button>
    </div>

    <div id="log" style="background:#000; height:350px; overflow-y:scroll; padding:15px; border:2px solid #333; font-family:monospace; color:#00ff00; border-radius:8px;"></div>
    
    <div style="margin-top:10px; display:flex; gap:10px;">
        <input id="msg" placeholder="Komut veya mesaj yaz (örn: /login 1234)" style="flex:1; padding:12px; background:#000; border:1px solid #1f6feb; color:white; border-radius:4px;">
        <button onclick="send()" style="background:#1f6feb; color:white; border:none; padding:0 20px; border-radius:4px; cursor:pointer; font-weight:bold;">GÖNDER</button>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        
        function connect() { socket.emit('conn', {h:document.getElementById('h').value, u:document.getElementById('u').value}); }
        function start() { socket.emit('start', {c:document.getElementById('c').value, b:document.getElementById('b').value}); }
        
        // Komut Gönderme Fonksiyonu
        function send() { 
            const input = document.getElementById('msg');
            if(input.value) {
                socket.emit('chat', input.value); 
                input.value = ''; // Gönderince kutuyu temizle
            }
        }

        // Enter tuşuna basınca gönderme
        document.getElementById('msg').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') { send(); }
        });

        socket.on('log', m => { 
            const l = document.getElementById('log'); 
            l.innerHTML += '<div>' + m + '</div>'; 
            l.scrollTop = l.scrollHeight; 
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

io.on('connection', (socket) => {
    // BAĞLANMA
    socket.on('conn', (data) => {
        if(bot) bot.quit();
        const [host, port] = data.h.split(':');
        bot = mineflayer.createBot({ host, port: parseInt(port)||25565, username: data.u, version: "1.16.5", auth: 'offline' });
        bot.loadPlugin(pathfinder);

        bot.on('login', () => socket.emit('log', '<b>[SİSTEM] Oyuna giriş başarılı!</b>'));
        bot.on('messagestr', (msg) => socket.emit('log', msg));
        bot.on('error', (err) => socket.emit('log', '<span style="color:red">HATA: ' + err.message + '</span>'));
        bot.on('kicked', (reason) => socket.emit('log', '<span style="color:orange">ATILDI: ' + reason + '</span>'));
    });

    // KOMUT GÖNDERME (SENİN İSTEDİĞİN KISIM)
    socket.on('chat', (message) => {
        if(bot) {
            bot.chat(message); // Bot mesajı veya komutu sunucuya gönderir
            socket.emit('log', '<span style="color:#aaa">Gönderilen: ' + message + '</span>');
        } else {
            socket.emit('log', '<span style="color:red">Hata: Önce sunucuya bağlanmalısın!</span>');
        }
    });

    // OTOMASYON
    socket.on('start', async (data) => {
        if(!bot) return;
        const c = data.c.split(',').map(Number);
        const b = data.b.split(',').map(Number);
        const chestPos = new vec3(c[0], c[1], c[2]);
        const targetPos = new vec3(b[0], b[1], b[2]);

        socket.emit('log', '<b>[SİSTEM] Otomasyon döngüsü başlatıldı.</b>');

        while(true) {
            try {
                const mcData = require('minecraft-data')(bot.version);
                bot.pathfinder.setMovements(new Movements(bot, mcData));

                socket.emit('log', 'Sandığa gidiliyor...');
                await bot.pathfinder.goto(new goals.GoalNear(chestPos.x, chestPos.y, chestPos.z, 1));
                
                const block = bot.blockAt(chestPos);
                const chest = await bot.openChest(block);
                socket.emit('log', 'Eşyalar alınıyor...');
                for (const item of chest.containerItems()) {
                    await chest.withdraw(item.type, null, item.count);
                    await new Promise(r => setTimeout(r, 600)); 
                }
                await chest.close();

                socket.emit('log', 'Hedefe gidiliyor...');
                await bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
                
                const tBlock = bot.blockAt(targetPos);
                const win = await bot.activateBlock(tBlock);
                socket.emit('log', 'Eşyalar teslim ediliyor...');
                for (const item of bot.inventory.items()) {
                    await bot.clickWindow(item.slot, 0, 1);
                    await new Promise(r => setTimeout(r, 600));
                }
                await bot.closeWindow(win);
                
                socket.emit('log', '<b>[DÖNGÜ] İşlem tamam, tekrar başa dönülüyor.</b>');
            } catch (err) {
                socket.emit('log', 'Takılma oldu, 3 sn sonra devam edilecek...');
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    });
});

server.listen(process.env.PORT || 10000);
                
