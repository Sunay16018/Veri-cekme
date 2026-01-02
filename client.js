const socket = io();
let sel = "";

function connect() {
    sel = document.getElementById('user').value;
    socket.emit('connect-bot', { host: document.getElementById('host').value, user: sel });
    document.getElementById('bot-name').innerText = sel;
}

function start() {
    socket.emit('start-automation', { 
        user: sel, 
        chest: document.getElementById('coord-chest').value, 
        block: document.getElementById('coord-block').value 
    });
}

function stop() { socket.emit('stop-automation', sel); }
function send() { 
    const i = document.getElementById('chat-in');
    socket.emit('send-chat', { user: sel, msg: i.value });
    i.value = "";
}

socket.on('chat-log', d => {
    if(d.user === sel) {
        const b = document.getElementById('chat-box');
        b.innerHTML += `<div>${d.msg}</div>`;
        b.scrollTop = b.scrollHeight;
    }
});

socket.on('log', m => {
    const l = document.getElementById('logs');
    l.innerHTML += `<div>${m}</div>`;
    l.scrollTop = l.scrollHeight;
});

socket.on('status-update', d => {
    if(d.user === sel) {
        document.getElementById('hp-bar').style.width = (d.hp/20*100)+'%';
        document.getElementById('food-bar').style.width = (d.food/20*100)+'%';
    }
});
