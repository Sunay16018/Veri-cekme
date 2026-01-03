const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalNear } = require('mineflayer-pathfinder').goals;
const minecraftData = require('minecraft-data');
const Vec3 = require('vec3');

class MinecraftBot {
    constructor(host, port, username, version, io) {
        this.host = host || 'localhost';
        this.port = port || 25565;
        this.username = username || 'OtomasyonBot';
        this.version = version || '1.16.5';
        this.io = io;
        this.bot = null;
        
        this.initializeBot();
    }
    
    initializeBot() {
        try {
            this.bot = mineflayer.createBot({
                host: this.host,
                port: this.port,
                username: this.username,
                version: this.version,
                auth: 'offline'
            });
            
            // Pathfinder eklentisi
            this.bot.loadPlugin(pathfinder);
            
            this.setupEventListeners();
            this.setupPacketListeners();
            
        } catch (error) {
            this.io.emit('bot-error', { message: `Bot oluşturma hatası: ${error.message}` });
            throw error;
        }
    }
    
    setupEventListeners() {
        this.bot.on('login', () => {
            this.io.emit('bot-status', { 
                status: 'bağlandı', 
                message: `${this.username} sunucuya bağlandı!`
            });
            this.io.emit('chat-message', {
                type: 'system',
                message: 'Sunucuya başarıyla bağlanıldı!',
                sender: 'Sistem'
            });
        });
        
        this.bot.on('spawn', () => {
            this.io.emit('bot-status', { 
                status: 'spawn', 
                message: 'Dünyada oluştu'
            });
            this.updateDashboard();
        });
        
        this.bot.on('health', () => {
            this.updateDashboard();
        });
        
        this.bot.on('death', () => {
            this.io.emit('chat-message', {
                type: 'error',
                message: 'Bot öldü! Yeniden doğuyor...',
                sender: 'Sistem'
            });
        });
        
        this.bot.on('kicked', (reason) => {
            this.io.emit('bot-error', { 
                message: `Sunucudan atıldı: ${reason}`
            });
        });
        
        this.bot.on('error', (err) => {
            this.io.emit('bot-error', { 
                message: `Bot hatası: ${err.message}`
            });
        });
        
        // Düzenli durum güncelleme
        setInterval(() => {
            if (this.bot && this.bot.entity) {
                this.updateDashboard();
            }
        }, 1000);
    }
    
    setupPacketListeners() {
        // Tüm gizli paketleri dinle
        this.bot._client.on('chat', (packet) => {
            try {
                let message = '';
                
                // Farklı chat formatlarını yakala
                if (packet.message) {
                    message = packet.message;
                } else if (packet.translate) {
                    message = packet.translate;
                }
                
                if (message && message.trim()) {
                    this.io.emit('chat-message', {
                        type: 'chat',
                        message: this.stripColors(message),
                        sender: packet.sender || 'Sunucu'
                    });
                }
            } catch (err) {
                console.error('Chat paketi işleme hatası:', err);
            }
        });
        
        // Action Bar mesajları
        this.bot._client.on('title', (packet) => {
            if (packet.action === 2 && packet.text) { // Action Bar
                this.io.emit('action-bar', {
                    message: this.stripColors(JSON.parse(packet.text).text || packet.text)
                });
            } else if (packet.action === 0 && packet.text) { // Title
                this.io.emit('title-message', {
                    message: this.stripColors(JSON.parse(packet.text).text || packet.text)
                });
            }
        });
        
        // System mesajları (messagestr)
        this.bot._client.on('messagestr', (packet) => {
            if (packet.message) {
                this.io.emit('system-message', {
                    message: this.stripColors(packet.message),
                    type: 'system'
                });
            }
        });
        
        // Player list header/footer
        this.bot._client.on('playerlist_header', (packet) => {
            if (packet.header) {
                const header = JSON.parse(packet.header);
                if (header.text) {
                    this.io.emit('chat-message', {
                        type: 'system',
                        message: `Liste Başlığı: ${this.stripColors(header.text)}`,
                        sender: 'Sunucu'
                    });
                }
            }
        });
    }
    
    stripColors(text) {
        if (typeof text !== 'string') return text;
        return text.replace(/§[0-9a-fk-or]/g, '');
    }
    
    updateDashboard() {
        if (!this.bot || !this.bot.entity) return;
        
        const data = {
            health: Math.floor(this.bot.health),
            food: this.bot.food,
            position: {
                x: Math.floor(this.bot.entity.position.x),
                y: Math.floor(this.bot.entity.position.y),
                z: Math.floor(this.bot.entity.position.z)
            },
            equippedItem: this.bot.inventory.slots[this.bot.getEquipmentDestSlot('hand')]?.name || 'Boş'
        };
        
        this.io.emit('dashboard-update', data);
    }
    
    async goto(x, y, z, range = 1) {
        return new Promise((resolve, reject) => {
            if (!this.bot) {
                reject(new Error('Bot bağlı değil'));
                return;
            }
            
            const goal = new GoalNear(x, y, z, range);
            this.bot.pathfinder.setGoal(goal);
            
            const checkInterval = setInterval(() => {
                const distance = this.bot.entity.position.distanceTo(new Vec3(x, y, z));
                
                if (distance <= range) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve(true);
                }
            }, 500);
            
            const timeout = setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Hedefe ulaşma zaman aşımı'));
            }, 30000);
        });
    }
    
    end() {
        if (this.bot) {
            this.bot.end();
            this.bot = null;
        }
    }
}

module.exports = MinecraftBot;