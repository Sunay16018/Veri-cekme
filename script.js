class MinecraftPanel {
    constructor() {
        this.socket = io();
        this.cycleCount = 0;
        this.errorCount = 0;
        this.autoscroll = true;
        this.isConnected = false;
        this.botStatus = 'kapalı';
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.updateServerTime();
    }
    
    initializeElements() {
        // Bağlantı elemanları
        this.hostInput = document.getElementById('host');
        this.portInput = document.getElementById('port');
        this.usernameInput = document.getElementById('username');
        this.versionInput = document.getElementById('version');
        
        // Koordinat elemanları
        this.chestX = document.getElementById('chest-x');
        this.chestY = document.getElementById('chest-y');
        this.chestZ = document.getElementById('chest-z');
        this.targetX = document.getElementById('target-x');
        this.targetY = document.getElementById('target-y');
        this.targetZ = document.getElementById('target-z');
        this.emptyX = document.getElementById('empty-x');
        this.emptyY = document.getElementById('empty-y');
        this.emptyZ = document.getElementById('empty-z');
        
        // Butonlar
        this.startBotBtn = document.getElementById('start-bot');
        this.stopBotBtn = document.getElementById('stop-bot');
        this.startAutomationBtn = document.getElementById('start-automation');
        this.stopAutomationBtn = document.getElementById('stop-automation');
        this.sendCommandBtn = document.getElementById('send-command');
        this.clearTerminalBtn = document.getElementById('clear-terminal');
        this.toggleAutoscrollBtn = document.getElementById('toggle-autoscroll');
        
        // Dashboard elemanları
        this.healthBar = document.getElementById('health-bar');
        this.healthText = document.getElementById('health-text');
        this.foodBar = document.getElementById('food-bar');
        this.foodText = document.getElementById('food-text');
        this.posX = document.getElementById('pos-x');
        this.posY = document.getElementById('pos-y');
        this.posZ = document.getElementById('pos-z');
        this.equippedItem = document.getElementById('equipped-item');
        this.botStatusDot = document.getElementById('bot-status-dot');
        this.botStatusText = document.getElementById('bot-status-text');
        this.actionBarText = document.getElementById('action-bar-text');
        this.titleText = document.getElementById('title-text');
        
        // Terminal
        this.terminalOutput = document.getElementById('terminal-output');
        this.commandInput = document.getElementById('command-input');
        this.terminalCommand = document.getElementById('terminal-command');
        
        // Footer
        this.cycleCountElement = document.getElementById('cycle-count');
        this.errorCountElement = document.getElementById('error-count');
        this.connectionStatus = document.getElementById('connection-status');
        this.serverTime = document.getElementById('server-time');
    }
    
    setupEventListeners() {
        // Bot başlat/durdur
        this.startBotBtn.addEventListener('click', () => this.startBot());
        this.stopBotBtn.addEventListener('click', () => this.stopBot());
        
        // Otomasyon başlat/durdur
        this.startAutomationBtn.addEventListener('click', () => this.startAutomation());
        this.stopAutomationBtn.addEventListener('click', () => this.stopAutomation());
        
        // Komut gönder
        this.sendCommandBtn.addEventListener('click', () => this.sendCommand());
        this.commandInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCommand();
        });
        
        // Terminal kontrolleri
        this.clearTerminalBtn.addEventListener('click', () => this.clearTerminal());
        this.toggleAutoscrollBtn.addEventListener('click', () => this.toggleAutoscroll());
        this.terminalCommand.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.executeTerminalCommand();
        });
        
        // Otomatik koordinat önerisi
        this.setupCoordinateSuggestions();
    }
    
    setupSocketListeners() {
        // Bot durum güncellemeleri
        this.socket.on('bot-status', (data) => {
            this.updateBotStatus(data.status, data.message);
            this.logMessage('system', `Bot durumu: ${data.message}`);
        });
        
        // Dashboard güncellemeleri
        this.socket.on('dashboard-update', (data) => {
            this.updateDashboard(data);
        });
        
        // Chat mesajları
        this.socket.on('chat-message', (data) => {
            this.logMessage(data.type, data.message, data.sender);
        });
        
        // Action Bar mesajları
        this.socket.on('action-bar', (data) => {
            this.updateActionBar(data.message);
        });
        
        // Title mesajları
        this.socket.on('title-message', (data) => {
            this.updateTitle(data.message);
        });
        
        // System mesajları
        this.socket.on('system-message', (data) => {
            this.logMessage('system', data.message);
        });
        
        // Otomasyon durumları
        this.socket.on('automation-status', (data) => {
            this.logMessage('system', `Otomasyon: ${data.message}`);
            if (data.status === 'başlatıldı') {
                this.startAutomationBtn.disabled = true;
                this.stopAutomationBtn.disabled = false;
            } else if (data.status === 'durduruldu') {
                this.startAutomationBtn.disabled = false;
                this.stopAutomationBtn.disabled = true;
            }
        });
        
        this.socket.on('automation-cycle', (data) => {
            this.cycleCount++;
            this.cycleCountElement.textContent = `Döngü Sayısı: ${this.cycleCount}`;
            this.logMessage('success', data.message);
        });
        
        this.socket.on('automation-action', (data) => {
            this.logMessage('system', `Otomasyon: ${data.message}`);
        });
        
        this.socket.on('automation-warning', (data) => {
            this.logMessage('warning', `Uyarı: ${data.message}`);
        });
        
        // Hatalar
        this.socket.on('bot-error', (data) => {
            this.errorCount++;
            this.errorCountElement.textContent = `Hata Sayısı: ${this.errorCount}`;
            this.logMessage('error', data.message);
        });
        
        this.socket.on('automation-error', (data) => {
            this.errorCount++;
            this.errorCountElement.textContent = `Hata Sayısı: ${this.errorCount}`;
            this.logMessage('error', `Otomasyon Hatası: ${data.message}`);
        });
        
        this.socket.on('system-error', (data) => {
            this.logMessage('error', data.message);
        });
        
        // Bağlantı durumu
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.connectionStatus.textContent = 'Bağlantı: Aktif';
            this.connectionStatus.className = 'status-online';
            this.logMessage('system', 'Sunucuya bağlanıldı');
        });
        
        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.connectionStatus.textContent = 'Bağlantı: Kesildi';
            this.connectionStatus.className = 'status-offline';
            this.logMessage('error', 'Sunucu bağlantısı kesildi');
        });
    }
    
    setupCoordinateSuggestions() {
        // Rastgele koordinat önerileri (demo amaçlı)
        const suggestCoords = (xInput, yInput, zInput) => {
            const x = Math.floor(Math.random() * 100) - 50;
            const y = Math.floor(Math.random() * 10) + 60;
            const z = Math.floor(Math.random() * 100) - 50;
            
            xInput.value = x;
            yInput.value = y;
            zInput.value = z;
        };
        
        // Örnek koordinat butonları ekle
        const addSuggestionButton = (containerId, inputs, label) => {
            const container = document.querySelector(containerId);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-secondary';
            btn.innerHTML = `<i class="fas fa-dice"></i> ${label}`;
            btn.style.marginTop = '5px';
            btn.addEventListener('click', () => {
                suggestCoords(inputs[0], inputs[1], inputs[2]);
            });
            container.appendChild(btn);
        };
        
        addSuggestionButton('.coords-group:nth-child(1)', 
            [this.chestX, this.chestY, this.chestZ], 'Rastgele Sandık');
        addSuggestionButton('.coords-group:nth-child(2)', 
            [this.targetX, this.targetY, this.targetZ], 'Rastgele Hedef');
        addSuggestionButton('.coords-group:nth-child(3)', 
            [this.emptyX, this.emptyY, this.emptyZ], 'Rastgele Boşaltma');
    }
    
    async startBot() {
        const botData = {
            host: this.hostInput.value,
            port: parseInt(this.portInput.value),
            username: this.usernameInput.value,
            version: this.versionInput.value
        };
        
        if (!botData.host) {
            this.showAlert('warning', 'Lütfen sunucu adresini girin!');
            return;
        }
        
        this.startBotBtn.disabled = true;
        this.startBotBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Bağlanıyor...';
        
        try {
            const response = await fetch('/start-bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(botData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.startBotBtn.style.display = 'none';
                this.stopBotBtn.disabled = false;
                this.startAutomationBtn.disabled = false;
                this.commandInput.disabled = false;
                this.sendCommandBtn.disabled = false;
                
                this.showAlert('success', 'Bot başarıyla başlatıldı!');
            } else {
                throw new Error(data.error || 'Bilinmeyen hata');
            }
        } catch (error) {
            this.showAlert('error', `Bağlantı hatası: ${error.message}`);
            this.startBotBtn.disabled = false;
            this.startBotBtn.innerHTML = '<i class="fas fa-play"></i> Bot Başlat';
        }
    }
    
    async stopBot() {
        try {
            const response = await fetch('/stop-bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.startBotBtn.style.display = 'flex';
                this.startBotBtn.disabled = false;
                this.startBotBtn.innerHTML = '<i class="fas fa-play"></i> Bot Başlat';
                this.stopBotBtn.disabled = true;
                this.startAutomationBtn.disabled = true;
                this.stopAutomationBtn.disabled = true;
                this.commandInput.disabled = true;
                this.sendCommandBtn.disabled = true;
                
                this.updateBotStatus('kapalı', 'Bot durduruldu');
                this.showAlert('info', 'Bot durduruldu');
            }
        } catch (error) {
            this.showAlert('error', `Durdurma hatası: ${error.message}`);
        }
    }
    
    async startAutomation() {
        const chestCoords = {
            x: parseInt(this.chestX.value),
            y: parseInt(this.chestY.value),
            z: parseInt(this.chestZ.value)
        };
        
        const targetCoords = {
            x: parseInt(this.targetX.value),
            y: parseInt(this.targetY.value),
            z: parseInt(this.targetZ.value)
        };
        
        const emptyCoords = {
            x: parseInt(this.emptyX.value),
            y: parseInt(this.emptyY.value),
            z: parseInt(this.emptyZ.value)
        };
        
        // Koordinat kontrolü
        if (isNaN(chestCoords.x) || isNaN(chestCoords.y) || isNaN(chestCoords.z) ||
            isNaN(targetCoords.x) || isNaN(targetCoords.y) || isNaN(targetCoords.z) ||
            isNaN(emptyCoords.x) || isNaN(emptyCoords.y) || isNaN(emptyCoords.z)) {
            this.showAlert('warning', 'Lütfen tüm koordinatları doğru girin!');
            return;
        }
        
        const automationData = { chestCoords, targetCoords, emptyCoords };
        
        try {
            const response = await fetch('/start-automation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(automationData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showAlert('success', 'Otomasyon başlatıldı!');
            } else {
                throw new Error(data.error || 'Bilinmeyen hata');
            }
        } catch (error) {
            this.showAlert('error', `Otomasyon hatası: ${error.message}`);
        }
    }
    
    async stopAutomation() {
        try {
            const response = await fetch('/stop-automation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.showAlert('info', 'Otomasyon durduruldu');
            }
        } catch (error) {
            this.showAlert('error', `Durdurma hatası: ${error.message}`);
        }
    }
    
    async sendCommand() {
        const command = this.commandInput.value.trim();
        
        if (!command) {
            this.showAlert('warning', 'Lütfen bir komut girin!');
            return;
        }
        
        // Komut başına / ekle (yoksa)
        const fullCommand = command.startsWith('/') ? command : `/${command}`;
        
        this.socket.emit('send-command', fullCommand);
        this.commandInput.value = '';
        
        this.logMessage('command', fullCommand, 'Kullanıcı');
    }
    
    executeTerminalCommand() {
        const command = this.terminalCommand.value.trim();
        
        if (!command) return;
        
        this.logMessage('system', `Terminal: ${command}`, 'Kullanıcı');
        
        // Terminal komutlarını işle
        switch (command.toLowerCase()) {
            case 'clear':
                this.clearTerminal();
                break;
            case 'help':
                this.showHelp();
                break;
            case 'status':
                this.logMessage('system', `Bot durumu: ${this.botStatus}`);
                this.logMessage('system', `Döngü sayısı: ${this.cycleCount}`);
                this.logMessage('system', `Hata sayısı: ${this.errorCount}`);
                break;
            case 'reset':
                this.cycleCount = 0;
                this.errorCount = 0;
                this.cycleCountElement.textContent = `Döngü Sayısı: 0`;
                this.errorCountElement.textContent = `Hata Sayısı: 0`;
                this.logMessage('success', 'İstatistikler sıfırlandı');
                break;
            default:
                this.logMessage('warning', `Bilinmeyen komut: ${command}. 'help' yazarak komutları görün.`);
        }
        
        this.terminalCommand.value = '';
    }
    
    showHelp() {
        this.logMessage('system', '=== TERMİNAL KOMUTLARI ===', 'Sistem');
        this.logMessage('system', 'clear - Terminali temizle', 'Sistem');
        this.logMessage('system', 'help - Bu yardım mesajını göster', 'Sistem');
        this.logMessage('system', 'status - Bot ve sistem durumunu göster', 'Sistem');
        this.logMessage('system', 'reset - İstatistikleri sıfırla', 'Sistem');
    }
    
    updateBotStatus(status, message) {
        this.botStatus = status;
        this.botStatusText.textContent = `Durum: ${message}`;
        
        // Durum dot'ını güncelle
        this.botStatusDot.className = 'status-dot';
        if (status === 'bağlandı' || status === 'spawn' || status === 'başlatıldı') {
            this.botStatusDot.classList.add('online');
        }
    }
    
    updateDashboard(data) {
        // Can barı
        const healthPercent = (data.health / 20) * 100;
        this.healthBar.style.width = `${healthPercent}%`;
        this.healthText.textContent = `${data.health}/20`;
        
        // Can barı rengini güncelle
        if (data.health <= 5) {
            this.healthBar.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
        } else if (data.health <= 10) {
            this.healthBar.style.background = 'linear-gradient(90deg, #f39c12, #e67e22)';
        } else {
            this.healthBar.style.background = 'linear-gradient(90deg, #2ecc71, #1abc9c)';
        }
        
        // Yemek barı
        const foodPercent = (data.food / 20) * 100;
        this.foodBar.style.width = `${foodPercent}%`;
        this.foodText.textContent = `${data.food}/20`;
        
        // Koordinatlar
        this.posX.textContent = data.position.x;
        this.posY.textContent = data.position.y;
        this.posZ.textContent = data.position.z;
        
        // Eldeki eşya
        this.equippedItem.textContent = data.equippedItem;
    }
    
    updateActionBar(message) {
        this.actionBarText.textContent = message;
        this.actionBarText.classList.add('fade-in');
        
        setTimeout(() => {
            this.actionBarText.classList.remove('fade-in');
        }, 500);
    }
    
    updateTitle(message) {
        this.titleText.textContent = message;
        this.titleText.classList.add('fade-in');
        
        setTimeout(() => {
            this.titleText.classList.remove('fade-in');
        }, 500);
    }
    
    logMessage(type, message, sender = 'Sistem') {
        const timestamp = new Date().toLocaleTimeString('tr-TR');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        let typeText = '';
        let typeColor = '';
        
        switch (type) {
            case 'system':
                typeText = 'SİSTEM';
                typeColor = '#1abc9c';
                break;
            case 'chat':
                typeText = 'SOHBET';
                typeColor = '#3498db';
                break;
            case 'command':
                typeText = 'KOMUT';
                typeColor = '#f39c12';
                break;
            case 'error':
                typeText = 'HATA';
                typeColor = '#e74c3c';
                break;
            case 'success':
                typeText = 'BAŞARI';
                typeColor = '#2ecc71';
                break;
            case 'warning':
                typeText = 'UYARI';
                typeColor = '#f1c40f';
                break;
        }
        
        logEntry.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="log-type" style="color: ${typeColor}">[${typeText}]</span>
            ${sender ? `<span class="sender">${sender}:</span>` : ''}
            <span class="log-message">${this.escapeHtml(message)}</span>
        `;
        
        this.terminalOutput.appendChild(logEntry);
        
        // Otomatik kaydırma
        if (this.autoscroll) {
            this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
        }
        
        // Kayan yazı efekti
        logEntry.classList.add('fade-in');
    }
    
    clearTerminal() {
        this.terminalOutput.innerHTML = '';
        this.logMessage('system', 'Terminal temizlendi');