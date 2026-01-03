const Vec3 = require('vec3');

class Automation {
    constructor(bot, io) {
        this.bot = bot;
        this.io = io;
        this.isRunning = false;
        this.currentTask = null;
        this.retryCount = 0;
        this.maxRetries = 3;
    }
    
    async start(chestCoords, targetCoords, emptyCoords) {
        this.isRunning = true;
        this.chestCoords = chestCoords;
        this.targetCoords = targetCoords;
        this.emptyCoords = emptyCoords;
        
        this.io.emit('automation-status', { 
            status: 'başlatıldı', 
            message: 'Otomasyon başlatıldı!' 
        });
        
        await this.mainLoop();
    }
    
    stop() {
        this.isRunning = false;
        if (this.currentTask) {
            clearTimeout(this.currentTask);
        }
        this.io.emit('automation-status', { 
            status: 'durduruldu', 
            message: 'Otomasyon durduruldu' 
        });
    }
    
    async mainLoop() {
        while (this.isRunning) {
            try {
                await this.executeCycle();
                this.retryCount = 0; // Başarılı döngüde retry sıfırla
                
                // Kısa bekleme
                await this.sleep(1000);
                
            } catch (error) {
                this.io.emit('automation-error', { 
                    message: `Döngü hatası: ${error.message}` 
                });
                
                this.retryCount++;
                
                if (this.retryCount >= this.maxRetries) {
                    this.io.emit('automation-error', { 
                        message: 'Maksimum yeniden deneme sayısına ulaşıldı. Otomasyon durduruluyor.' 
                    });
                    this.stop();
                    break;
                }
                
                // Hata durumunda kısa bekle ve tekrar dene
                await this.sleep(2000);
            }
        }
    }
    
    async executeCycle() {
        // 1. Sandık koordinatına git
        await this.gotoWithRecovery(this.chestCoords);
        
        // 2. Sandığı aç
        await this.openChest(this.chestCoords);
        
        // 3. Eşyaları al
        await this.collectItems();
        
        // 4. Hedef koordinata git
        await this.gotoWithRecovery(this.targetCoords);
        
        // 5. Bloğu aktifleştir
        await this.activateBlock(this.targetCoords);
        
        // 6. Envanteri boşalt
        await this.gotoWithRecovery(this.emptyCoords);
        await this.emptyInventory();
        
        this.io.emit('automation-cycle', { 
            message: 'Döngü başarıyla tamamlandı!' 
        });
    }
    
    async gotoWithRecovery(coords) {
        try {
            await this.bot.goto(coords.x, coords.y, coords.z);
        } catch (error) {
            this.io.emit('automation-warning', { 
                message: 'Yol bulma takıldı, kurtarma modu aktif...' 
            });
            
            // Geri git ve yeniden dene
            await this.recoverFromStuck();
            
            // Tekrar dene
            await this.bot.goto(coords.x, coords.y, coords.z);
        }
    }
    
    async recoverFromStuck() {
        // Mevcut pozisyondan 3 blok geri git
        const currentPos = this.bot.bot.entity.position;
        const backPos = {
            x: currentPos.x - 3,
            y: currentPos.y,
            z: currentPos.z
        };
        
        await this.bot.goto(backPos.x, backPos.y, backPos.z);
        await this.sleep(500);
        
        // Zıplama hareketi
        this.bot.bot.setControlState('jump', true);
        await this.sleep(300);
        this.bot.bot.setControlState('jump', false);
        await this.sleep(500);
    }
    
    async openChest(coords) {
        const chestBlock = this.bot.bot.blockAt(new Vec3(coords.x, coords.y, coords.z));
        
        if (chestBlock && chestBlock.name.includes('chest')) {
            const chest = await this.bot.bot.openContainer(chestBlock);
            
            if (chest) {
                this.io.emit('automation-action', { 
                    message: `Sandık açıldı: ${coords.x}, ${coords.y}, ${coords.z}` 
                });
                
                // Sandık kapatma için referans sakla
                this.currentChest = chest;
                return chest;
            }
        }
        
        throw new Error('Sandık bulunamadı veya açılamadı');
    }
    
    async collectItems() {
        if (!this.currentChest) {
            throw new Error('Açık sandık bulunamadı');
        }
        
        let collected = false;
        
        // Sandıktaki tüm eşyaları al
        for (let i = 0; i < this.currentChest.containerItems.length; i++) {
            const item = this.currentChest.containerItems[i];
            if (item) {
                try {
                    await this.currentChest.withdraw(item.type, null, item.count);
                    this.io.emit('automation-action', { 
                        message: `Eşya alındı: ${item.name} x${item.count}` 
                    });
                    collected = true;
                    await this.sleep(100); // Sunucu yükünü azalt
                } catch (err) {
                    console.error('Eşya alma hatası:', err);
                }
            }
        }
        
        // Sandığı kapat
        this.currentChest.close();
        this.currentChest = null;
        
        if (!collected) {
            this.io.emit('automation-warning', { 
                message: 'Sandıkta alınacak eşya bulunamadı' 
            });
        }
        
        return collected;
    }
    
    async activateBlock(coords) {
        const block = this.bot.bot.blockAt(new Vec3(coords.x, coords.y, coords.z));
        
        if (block) {
            // Bloğa tıkla
            await this.bot.bot.activateBlock(block);
            this.io.emit('automation-action', { 
                message: `Blok aktifleştirildi: ${coords.x}, ${coords.y}, ${coords.z}` 
            });
            await this.sleep(500);
            return true;
        }
        
        throw new Error('Hedef blok bulunamadı');
    }
    
    async emptyInventory() {
        const items = this.bot.bot.inventory.items();
        
        if (items.length === 0) {
            this.io.emit('automation-warning', { 
                message: 'Envanterde bırakılacak eşya yok' 
            });
            return;
        }
        
        // Yere eşya bırak
        for (const item of items) {
            try {
                await this.bot.bot.tossStack(item);
                this.io.emit('automation-action', { 
                    message: `Eşya bırakıldı: ${item.name} x${item.count}` 
                });
                await this.sleep(100);
            } catch (err) {
                console.error('Eşya bırakma hatası:', err);
            }
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = Automation;