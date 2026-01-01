const express = require('express');
const path = require('path');
const axios = require('axios'); // Veri çekmek için gerekli
const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// OYUNCU BİLGİSİ ÇEKME API'Sİ
app.get('/api/lookup', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.json({ error: 'Kullanıcı adı girilmedi.' });

    try {
        // Ashcon API üzerinden detaylı sorgu
        const response = await axios.get(`https://api.ashcon.app/mojang/v2/user/${username}`);
        const data = response.data;

        // Veriyi düzenleyip frontend'e gönderelim
        const playerInfo = {
            username: data.username,
            uuid: data.uuid,
            created_at: data.created_at || "Bilinmiyor (Çok eski hesap)",
            username_history: data.username_history,
            textures: {
                skin: data.textures.skin.url,
                slim: data.textures.slim,
                cape: data.textures.cape ? data.textures.cape.url : null
            }
        };

        res.json({ status: 'success', data: playerInfo });

    } catch (error) {
        // Kullanıcı bulunamazsa veya API hatası olursa
        res.json({ status: 'error', message: 'Oyuncu bulunamadı veya sunucu hatası.' });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`İstihbarat Paneli ${PORT} portunda aktif.`));
