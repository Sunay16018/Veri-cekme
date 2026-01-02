const { goals } = require('mineflayer-pathfinder');
const vec3 = require('vec3');

class Automation {
    constructor(bot, io, username) {
        this.bot = bot; this.io = io; this.username = username;
        this.active = false;
    }

    async start(chestStr, blockStr) {
        this.active = true;
        const c = chestStr.split(',').map(Number);
        const b = blockStr.split(',').map(Number);
        this.chestPos = new vec3(c[0], c[1], c[2]);
        this.blockPos = new vec3(b[0], b[1], b[2]);
        this.loop();
    }

    stop() { this.active = false; this.bot.pathfinder.setGoal(null); }

    async loop() {
        if (!this.active) return;
        try {
            // 1. Sandığa Yürü ve Al
            await this.goTo(this.chestPos, 2);
            const chestBlock = this.bot.blockAt(this.chestPos);
            if (chestBlock && chestBlock.name !== 'air') {
                const chest = await this.bot.openChest(chestBlock);
                for (const item of chest.containerItems()) {
                    if (item.name.includes('block')) await chest.withdraw(item.type, null, item.count);
                }
                await chest.close();
            }

            // 2. Bloğa Yürü ve Shift+Sağ Tık Yap
            await this.goTo(this.blockPos, 2);
            const target = this.bot.blockAt(this.blockPos);
            if (target && target.name !== 'air') {
                await this.bot.lookAt(target.position.offset(0.5, 0.5, 0.5));
                this.bot.setControlState('sneak', true);
                const window = await this.bot.activateBlock(target);
                
                // Menüye Shift-Tık Boşaltma
                for (const item of this.bot.inventory.items()) {
                    if (item.name.includes('block')) await this.bot.clickWindow(item.slot, 0, 1);
                }
                this.bot.closeWindow(window);
                this.bot.setControlState('sneak', false);
                this.io.emit('log', `<b>[OTO] ${this.username}: İşlem tamamlandı.</b>`);
            }
        } catch (e) { this.io.emit('log', `<i style="color:red">Hata: ${e.message}</i>`); }
        if (this.active) setTimeout(() => this.loop(), 5000);
    }

    async goTo(pos, range) {
        const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range);
        this.bot.pathfinder.setGoal(goal);
        return new Promise(res => {
            const i = setInterval(() => {
                if (!this.active || this.bot.entity.position.distanceTo(pos) < range + 1) {
                    clearInterval(i); res();
                }
            }, 500);
        });
    }
}
module.exports = Automation;
