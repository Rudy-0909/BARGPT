// ===== موسيقى الجاز عبر YouTube IFrame Player API =====
const JAZZ_VIDEO_ID = 'nv_2rz5BFDA'; // فيديو جاز 5 ساعات
let jazzPlayer = null;
let jazzPlayerReady = false;
let isMusicPlaying = false;

// يستدعيها سكربت يوتيوب تلقائياً بمجرد تحميل الـ API
function onYouTubeIframeAPIReady() {
    jazzPlayer = new YT.Player('jazzPlayer', {
        videoId: JAZZ_VIDEO_ID,
        playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            fs: 0,
            disablekb: 1,
            playsinline: 1
        },
        events: {
            onReady: (e) => {
                jazzPlayerReady = true;
                e.target.setVolume(35);
            }
        }
    });
}

function toggleMusic() {
    const btn = document.getElementById('musicToggle');
    if (!jazzPlayerReady) {
        alert("Jazz player is still loading, try again in a second.");
        return;
    }
    if (isMusicPlaying) {
        jazzPlayer.pauseVideo();
        isMusicPlaying = false;
        btn.innerText = "🎷 Jazz: OFF";
    } else {
        jazzPlayer.playVideo();
        isMusicPlaying = true;
        btn.innerText = "🎷 Jazz: ON";
    }
}

// ===== توليد الصوت (TTS) مع نظام احتياطي =====
function speakText(text) {
    return new Promise((resolve) => {
        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        })
        .then(res => {
            if (!res.ok) throw new Error("TTS backend failed");
            return res.blob();
        })
        .then(blob => {
            const audio = new Audio(URL.createObjectURL(blob));
            audio.onended = resolve;
            audio.onerror = resolve;
            audio.play().catch(resolve);
        })
        .catch(() => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'en-US';
                utterance.pitch = 0.7;
                utterance.rate = 0.9;
                utterance.onend = resolve;
                utterance.onerror = resolve;
                window.speechSynthesis.speak(utterance);
            } else resolve();
        });
    });
}

// ===== بدء التجربة (بسيطة: خلفية الفيديو تلف من نفسها تلقائياً) =====
function startExperience() {
    const overlay = document.getElementById('intro-overlay');

    overlay.style.transition = 'opacity 0.6s ease';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 600);

    // تشغيل الجاز بمجرد دخول المستخدم
    if (jazzPlayerReady) {
        jazzPlayer.playVideo();
        isMusicPlaying = true;
        document.getElementById('musicToggle').innerText = "🎷 Jazz: ON";
    } else {
        setTimeout(() => {
            if (jazzPlayerReady) {
                jazzPlayer.playVideo();
                isMusicPlaying = true;
                document.getElementById('musicToggle').innerText = "🎷 Jazz: ON";
            }
        }, 1000);
    }

    // الجملة الافتتاحية
    setTimeout(() => {
        const line = "Alcohol is bad. But I suspect your problem is worse.";
        appendMessage('Alexander', line, 'alexander');
        speakText(line);
    }, 700);
}

// ===== نظام الطرد =====
function kickOutUser() {
    const kickOverlay = document.createElement('div');
    kickOverlay.className = 'kick-overlay';
    kickOverlay.innerHTML = `
        <h1>YOU WERE THROWN OUT</h1>
        <p>Alexander slammed the cellar door shut.</p>
    `;
    document.body.appendChild(kickOverlay);
    setTimeout(() => { window.location.href = "https://www.google.com"; }, 2200);
}

// ===== تتبع عدد الرسائل ونظام التصعيد العشوائي =====
let userMessageCount = 0;
let escalationTriggered = false;
let chatHistory = []; // ذاكرة المحادثة بطرف المتصفح (بدل ذاكرة السيرفر المفقودة)

// ===== إرسال الرسائل =====
async function sendMessage() {
    const input = document.getElementById('userInput');
    const scene = document.getElementById('scene');
    const text = input.value.trim();
    if (!text) return;

    appendMessage('You', text, 'you');
    input.value = '';
    scene.classList.add('thinking');
    userMessageCount++;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history: chatHistory })
        });
        const data = await res.json();

        appendMessage('Alexander', data.text, 'alexander');

        // حدّث الذاكرة المحلية (آخر ٨ رسائل تُرسل بالمرة الجاية)
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: data.text });
        if (chatHistory.length > 8) chatHistory = chatHistory.slice(-8);

        await speakText(data.text);

        if (data.text.toLowerCase().includes('get out')) {
            kickOutUser();
        }
    } catch (e) {
        appendMessage('Alexander', 'The bar is silent...', 'alexander');
    } finally {
        scene.classList.remove('thinking');
    }

    // بعد الرسالة الخامسة: تصعيد مضمون (مرة وحدة بالجلسة)
    if (userMessageCount >= 5 && !escalationTriggered) {
        escalationTriggered = true;
        triggerEscalation();
    }
}

function appendMessage(sender, text, className) {
    const box = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `msg ${className}`;
    div.innerHTML = `<strong>${sender}:</strong> `;
    div.appendChild(document.createTextNode(text));
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// ===== التحويل الصوتي إلى نص =====
function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Voice recognition not supported.');
    const recog = new SpeechRecognition();
    recog.onresult = (e) => {
        document.getElementById('userInput').value = e.results[0][0].transcript;
        sendMessage();
    };
    recog.start();
}

// ===== لعبة التصعيد: تصويب ثابت (Shooting Gallery) =====
const GAME_DURATION = 25; // ثانية
const MAX_HEALTH = 5;
const ENEMY_LIFETIME = 1900; // مللي ثانية قبل ما يصيب اللاعب لو ما انطلق عليه

let shooterCanvas, shooterCtx, escalationOverlay;
let gameEnemies = [];
let gameScore = 0;
let gameHealth = MAX_HEALTH;
let gameTimeLeft = GAME_DURATION;
let gameRunning = false;
let gameLastSpawn = 0;
let gameLoopId = null;
let gameTimerIntervalId = null;

function triggerEscalation() {
    const handoffLine = "Trouble's here. Take this. Don't miss.";
    appendMessage('Alexander', handoffLine, 'alexander');
    speakText(handoffLine).then(() => {
        setTimeout(startShooterGame, 400);
    });
}

function startShooterGame() {
    escalationOverlay = document.getElementById('escalationOverlay');
    shooterCanvas = document.getElementById('shooterCanvas');
    shooterCtx = shooterCanvas.getContext('2d');

    // لازم نظهر الطبقة أولاً قبل قياس أبعادها، وإلا الأبعاد تطلع صفر (display:none)
    escalationOverlay.classList.add('active');

    const rect = escalationOverlay.getBoundingClientRect();
    shooterCanvas.width = rect.width;
    shooterCanvas.height = rect.height;

    gameEnemies = [];
    gameScore = 0;
    gameHealth = MAX_HEALTH;
    gameTimeLeft = GAME_DURATION;
    gameRunning = true;
    gameLastSpawn = 0;

    document.getElementById('scoreValue').innerText = '0';
    document.getElementById('healthFill').style.width = '100%';
    document.getElementById('escalationTimer').innerText = String(GAME_DURATION);

    shooterCanvas.onclick = handleShooterClick;

    gameTimerIntervalId = setInterval(() => {
        if (!gameRunning) return;
        gameTimeLeft--;
        document.getElementById('escalationTimer').innerText = String(Math.max(0, gameTimeLeft));
        if (gameTimeLeft <= 0) endShooterGame(true);
    }, 1000);

    let lastFrame = performance.now();
    function loop(now) {
        if (!gameRunning) return;
        const dt = now - lastFrame;
        lastFrame = now;
        updateShooterGame(now, dt);
        gameLoopId = requestAnimationFrame(loop);
    }
    gameLoopId = requestAnimationFrame(loop);
}

function spawnEnemy() {
    const margin = 0.12;
    const x = (margin + Math.random() * (1 - margin * 2)) * shooterCanvas.width;
    const y = (0.2 + Math.random() * 0.55) * shooterCanvas.height;
    gameEnemies.push({
        x, y,
        radius: shooterCanvas.width * 0.035,
        bornAt: performance.now(),
        hit: false
    });
}

function updateShooterGame(now, dt) {
    // تفريخ أعداء جدد كل ~900-1400ms
    if (now - gameLastSpawn > 900 + Math.random() * 500) {
        if (gameEnemies.length < 4) spawnEnemy();
        gameLastSpawn = now;
    }

    shooterCtx.clearRect(0, 0, shooterCanvas.width, shooterCanvas.height);

    for (let i = gameEnemies.length - 1; i >= 0; i--) {
        const e = gameEnemies[i];
        const age = now - e.bornAt;
        const lifeRatio = age / ENEMY_LIFETIME;

        if (e.hit) {
            // انيميشن اختفاء بسيط بعد الإصابة
            e.hitAge = (e.hitAge || 0) + dt;
            const fade = 1 - e.hitAge / 250;
            if (fade <= 0) { gameEnemies.splice(i, 1); continue; }
            drawEnemy(e, fade, true);
            continue;
        }

        if (lifeRatio >= 1) {
            // العدو وصل ووصّل ضربة للاعب
            gameEnemies.splice(i, 1);
            damagePlayer();
            continue;
        }

        const scale = 0.5 + lifeRatio * 0.6;
        drawEnemy(e, scale, false);
    }
}

function drawEnemy(e, scale, isHit) {
    const r = e.radius * scale;
    shooterCtx.save();
    shooterCtx.globalAlpha = isHit ? Math.max(0, scale) : 1;
    // جسم (سيلويت مهاجم بقناع غاز بسيط)
    shooterCtx.fillStyle = isHit ? '#c8933f' : '#241a14';
    shooterCtx.beginPath();
    shooterCtx.arc(e.x, e.y, r, 0, Math.PI * 2);
    shooterCtx.fill();
    // عدسات القناع
    shooterCtx.fillStyle = '#7fae9e';
    shooterCtx.beginPath();
    shooterCtx.arc(e.x - r * 0.35, e.y, r * 0.22, 0, Math.PI * 2);
    shooterCtx.arc(e.x + r * 0.35, e.y, r * 0.22, 0, Math.PI * 2);
    shooterCtx.fill();
    shooterCtx.restore();
}

function handleShooterClick(evt) {
    if (!gameRunning) return;
    const rect = shooterCanvas.getBoundingClientRect();
    const mx = (evt.clientX - rect.left) * (shooterCanvas.width / rect.width);
    const my = (evt.clientY - rect.top) * (shooterCanvas.height / rect.height);

    for (let i = gameEnemies.length - 1; i >= 0; i--) {
        const e = gameEnemies[i];
        if (e.hit) continue;
        const dx = mx - e.x, dy = my - e.y;
        if (Math.sqrt(dx * dx + dy * dy) <= e.radius) {
            e.hit = true;
            e.hitAge = 0;
            gameScore++;
            document.getElementById('scoreValue').innerText = String(gameScore);
            break;
        }
    }
}

function damagePlayer() {
    gameHealth = Math.max(0, gameHealth - 1);
    const pct = (gameHealth / MAX_HEALTH) * 100;
    document.getElementById('healthFill').style.width = pct + '%';
    if (gameHealth <= 0) endShooterGame(false);
}

function endShooterGame(survived) {
    if (!gameRunning) return;
    gameRunning = false;
    clearInterval(gameTimerIntervalId);
    cancelAnimationFrame(gameLoopId);
    shooterCanvas.onclick = null;

    const resultDiv = document.createElement('div');
    resultDiv.className = 'escalation-result';
    resultDiv.innerHTML = survived
        ? `<h2>YOU SURVIVED</h2><p>Score: ${gameScore}</p>`
        : `<h2>OVERRUN</h2><p>Score: ${gameScore}</p>`;
    escalationOverlay.appendChild(resultDiv);

    setTimeout(() => {
        escalationOverlay.classList.remove('active');
        resultDiv.remove();
        gameEnemies = [];

        const line = survived
            ? "Not bad. Almost impressive, for a rookie."
            : "Pathetic. Sit down before you embarrass yourself further.";
        appendMessage('Alexander', line, 'alexander');
        speakText(line);
    }, 2200);
}
