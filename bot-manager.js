const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const Automation = require('./automation');

class BotManager {
    constructor(io) {
        this.io = io;
        this.bots = {};
        this.automations = {};
    }

    createBot(host, username, version) {
        if (this.bots[username]) return;
        const [ip, port] = host.split(':');
        const bot = mineflayer.createBot({
            host: ip, port: parseInt(port) || 25565,
            username: username, version: version || "1.16.5", auth: 'offline'
        });

        bot.loadPlugin(pathfinder);
        this.bots[username] = bot;
        this.automations[username] = new Automation(bot, this.io, username);

        bot.on('login', () => {
            this.io.emit('log', `<b style="color:#2ecc71">[GİRİŞ] ${username} bağlandı.</b>`);
            bot.pathfinder.setMovements(new Movements(bot));
        });

        bot.on('message', (msg) => this.io.emit('chat-log', { user: username, msg: msg.toHTML() }));
        bot.on('health', () => this.io.emit('status-update', { user: username, hp: bot.health, food: bot.food }));
        bot.on('end', () => delete this.bots[username]);
    }

    startAutomation(u, c, b) { if(this.automations[u]) this.automations[u].start(c, b); }
    stopAutomation(u) { if(this.automations[u]) this.automations[u].stop(); }
    chat(u, m) { if(this.bots[u]) this.bots[u].chat(m); }
}
module.exports = BotManager;
