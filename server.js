const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Global değişkenler
let bot = null;
let automation = null;

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Ana route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Bot modüllerini yükle
app.post('/start-bot', (req, res) => {
    const { host, port, username, version } = req.body;
    
    try {
        // Eski botu temizle
        if (bot) {
            bot.end();
            bot = null;
        }
        
        // Bot modülünü dinamik yükle
        const Bot = require('./bot');
        bot = new Bot(host, port, username, version, io);
        
        // Otomasyon modülünü başlat
        const Automation = require('./automation');
        automation = new Automation(bot, io);
        
        io.emit('bot-status', { status: 'başlatıldı', message: 'Bot başarıyla başlatıldı!' });
        res.json({ success: true, message: 'Bot başlatıldı' });
    } catch (error) {
        io.emit('bot-error', { message: `Bot başlatma hatası: ${error.message}` });
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/start-automation', (req, res) => {
    const { chestCoords, targetCoords, emptyCoords } = req.body;
    
    if (!automation || !bot) {
        return res.status(400).json({ success: false, error: 'Bot başlatılmamış' });
    }
    
    automation.start(chestCoords, targetCoords, emptyCoords);
    res.json({ success: true, message: 'Otomasyon başlatıldı' });
});

app.post('/stop-automation', (req, res) => {
    if (automation) {
        automation.stop();
        res.json({ success: true, message: 'Otomasyon durduruldu' });
    } else {
        res.json({ success: true, message: 'Otomasyon zaten durdurulmuş' });
    }
});

app.post('/stop-bot', (req, res) => {
    if (bot) {
        bot.end();
        bot = null;
        automation = null;
        io.emit('bot-status', { status: 'durduruldu', message: 'Bot durduruldu' });
        res.json({ success: true, message: 'Bot durduruldu' });
    } else {
        res.json({ success: true, message: 'Bot zaten durdurulmuş' });
    }
});

// Render.com için uyku modunu engelleme
setInterval(() => {
    console.log('Uyku modu önleyici aktif');
}, 300000); // 5 dakikada bir

// Hata yakalama
process.on('uncaughtException', (err) => {
    console.error('Yakalanmamış hata:', err);
    io.emit('system-error', { message: `Sistem hatası: ${err.message}` });
});

// Socket.io bağlantısı
io.on('connection', (socket) => {
    console.log('Yeni kullanıcı bağlandı');
    
    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı');
    });
    
    socket.on('send-command', (command) => {
        if (bot && bot.bot) {
            bot.bot.chat(command);
            io.emit('chat-message', { 
                type: 'command', 
                message: `Komut gönderildi: ${command}`,
                sender: 'Kullanıcı'
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`);
    console.log(`Panel adresi: http://localhost:${PORT}`);
});

module.exports = { app, server, io };