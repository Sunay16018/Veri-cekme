const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const BotManager = require('./bot-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '')));

const botManager = new BotManager(io);

io.on('connection', (socket) => {
    socket.emit('log', '<span style="color:cyan">[SİSTEM] Panel hazır.</span>');
    socket.on('connect-bot', (data) => botManager.createBot(data.host, data.user, data.ver));
    socket.on('start-automation', (data) => botManager.startAutomation(data.user, data.chest, data.block));
    socket.on('stop-automation', (user) => botManager.stopAutomation(user));
    socket.on('send-chat', (data) => botManager.chat(data.user, data.msg));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => console.log(`Aktif: ${PORT}`));
