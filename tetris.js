const config = {
    type: Phaser.AUTO,
    width: 300,
    height: 600,
    backgroundColor: 0x111111,
    parent: 'game-container',
    pixelArt: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
        preload,
        create,
        update
    }
};

const ROWS = 20;
const COLS = 10;
const BLOCK_SIZE = 30;

const TETROMINOES = {
    I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: 0x00f0f0 },
    J: { shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: 0x0000f0 },
    L: { shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: 0xf0a000 },
    O: { shape: [[1, 1], [1, 1]], color: 0xf0f000 },
    S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: 0x00f000 },
    T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: 0xa000f0 },
    Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: 0xf00000 }
};

const game = new Phaser.Game(config);

let grid = [];
let activePiece = null;
let nextPieceType = null;
let lastDropTime = 0;
let dropInterval = 800;
let score = 0;
let level = 1;
let gameOver = false;
let clearingRows = [];
let clearingStartTime = 0;
const CLEAR_ANIM_DURATION = 600;
let particles = [];

// ── Player name & leaderboard (localStorage) ──────────────────────────────
const LS_NAME = 'tetris_player_name';
const LS_LB = 'tetris_leaderboard';
const MAX_LB = 10;
let playerName = '';
let scoreSubmittedThisGame = false;

function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LS_LB)) || []; }
    catch { return []; }
}

function saveScoreToLeaderboard(name, pts) {
    const lb = getLeaderboard();
    lb.push({ name: name.trim() || 'ANON', score: pts });
    lb.sort((a, b) => b.score - a.score);
    // Deduplicate: keep only the first (highest) score per name (case-insensitive)
    const seen = new Set();
    const deduped = lb.filter(entry => {
        const key = entry.name.toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    deduped.splice(MAX_LB); // keep only top 10
    localStorage.setItem(LS_LB, JSON.stringify(deduped));
    return deduped;
}

function renderLeaderboard(highlightScore) {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    const lb = getLeaderboard();
    if (lb.length === 0) {
        list.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>';
        return;
    }
    list.innerHTML = lb.map((entry, i) => {
        const isHighlight = entry.score === highlightScore && i === lb.findIndex(e => e.score === highlightScore);
        const topCls = i < 3 ? ' top3' : '';
        const hlCls = isHighlight ? ' lb-highlight' : '';
        return `<div class="lb-row${hlCls}">
            <span class="lb-rank${topCls}">${i + 1}</span>
            <span class="lb-name">${escHtml(entry.name)}</span>
            <span class="lb-score">${String(entry.score).padStart(4, '0')}</span>
        </div>`;
    }).join('');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function preload() { }

function create() {
    for (let r = 0; r < ROWS; r++) {
        grid[r] = Array(COLS).fill(0);
    }

    this.graphics = this.add.graphics();
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceBar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    spawnPiece.call(this);
    setupTouchGestures.call(this);
}

function spawnPiece() {
    const keys = Object.keys(TETROMINOES);

    // Initialize nextPieceType if it's the first spawn
    if (!nextPieceType) {
        nextPieceType = keys[Math.floor(Math.random() * keys.length)];
    }

    const type = nextPieceType;
    const tetromino = TETROMINOES[type];

    // Generate the next piece for the queue
    nextPieceType = keys[Math.floor(Math.random() * keys.length)];
    drawNextPiece();

    activePiece = {
        type: type,
        shape: JSON.parse(JSON.stringify(tetromino.shape)),
        color: tetromino.color,
        x: Math.floor(COLS / 2) - Math.floor(tetromino.shape[0].length / 2),
        y: 0
    };

    if (checkCollision(activePiece.x, activePiece.y, activePiece.shape)) {
        gameOver = true;
    }
}

function drawNextPiece() {
    const canvas = document.getElementById('next-block-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clear previous drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!nextPieceType) return;

    const tetromino = TETROMINOES[nextPieceType];
    const shape = tetromino.shape;
    const colorHex = '#' + tetromino.color.toString(16).padStart(6, '0');

    // Calculate size to fit in 40x40 canvas with a bit of padding
    const blockSize = 8;
    const shapeWidth = shape[0].length * blockSize;
    const shapeHeight = shape.length * blockSize;

    // Center the shape in the canvas
    const offsetX = (canvas.width - shapeWidth) / 2;
    const offsetY = (canvas.height - shapeHeight) / 2;

    ctx.fillStyle = colorHex;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    shape.forEach((row, r) => {
        row.forEach((value, c) => {
            if (value) {
                const x = offsetX + c * blockSize;
                const y = offsetY + r * blockSize;
                // Use fillRect for broad Android compatibility (roundRect not available pre-Chrome 99)
                ctx.fillRect(x, y, blockSize - 1, blockSize - 1);
                ctx.strokeRect(x, y, blockSize - 1, blockSize - 1);
            }
        });
    });
}

function checkCollision(x, y, shape) {
    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                let newX = x + c;
                let newY = y + r;
                if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && grid[newY][newX])) {
                    return true;
                }
            }
        }
    }
    return false;
}

function rotatePiece(piece) {
    const rotated = piece.shape[0].map((_, index) =>
        piece.shape.map(row => row[index]).reverse()
    );
    if (!checkCollision(piece.x, piece.y, rotated)) {
        piece.shape = rotated;
    }
}

function lockPiece() {
    activePiece.shape.forEach((row, r) => {
        row.forEach((value, c) => {
            if (value) {
                const gridY = activePiece.y + r;
                const gridX = activePiece.x + c;
                if (gridY >= 0) grid[gridY][gridX] = activePiece.color;
            }
        });
    });
    clearLines();
}

function createParticles(row) {
    const MAX_PARTICLES = 30;
    for (let c = 0; c < COLS; c++) {
        const color = grid[row][c];
        if (color && particles.length < MAX_PARTICLES) {
            particles.push({
                x: c * BLOCK_SIZE + BLOCK_SIZE / 2,
                y: row * BLOCK_SIZE + BLOCK_SIZE / 2,
                vx: (Math.random() - 0.5) * 4,
                vy: -Math.random() * 5 - 2,
                color: color,
                size: BLOCK_SIZE / 2,
                rotation: 0,
                vRotation: (Math.random() - 0.5) * 0.2,
                alpha: 1
            });
            grid[row][c] = 0;
        } else {
            grid[row][c] = 0;
        }
    }
}

function clearLines() {
    clearingRows = [];
    for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r].every(cell => cell !== 0)) {
            clearingRows.push(r);
        }
    }

    if (clearingRows.length > 0) {
        clearingStartTime = game.loop.time;
        clearingRows.forEach(r => createParticles(r));

        let linesCleared = clearingRows.length;
        score += [0, 100, 300, 500, 800][linesCleared] * level;
        const scoreEl = document.getElementById('score');
        if (scoreEl) scoreEl.innerText = score.toString().padStart(4, '0');

        if (score >= level * 1000) {
            level++;
            const levelEl = document.getElementById('level');
            if (levelEl) levelEl.innerText = level;
            dropInterval = Math.max(100, dropInterval - 100);
        }
    } else {
        spawnPiece();
    }
}

function finalizeLineClear() {
    let newGrid = grid.filter(row => !row.every(cell => cell === 0));
    while (newGrid.length < ROWS) {
        newGrid.unshift(Array(COLS).fill(0));
    }
    grid = newGrid;

    clearingRows = [];
    particles = [];
    spawnPiece();
}

function update(time, delta) {
    if (gameOver) {
        // Board is static — no need to redraw every frame once game is over
        return;
    }

    if (clearingRows.length > 0) {
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.25;
            p.rotation += p.vRotation;
            p.alpha -= 0.02;
        });

        if (time - clearingStartTime > CLEAR_ANIM_DURATION) {
            finalizeLineClear();
        }
        draw.call(this);
        return;
    }

    if (time - lastDropTime > dropInterval) {
        if (!checkCollision(activePiece.x, activePiece.y + 1, activePiece.shape)) {
            activePiece.y++;
        } else {
            lockPiece();
        }
        lastDropTime = time;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
        if (!checkCollision(activePiece.x - 1, activePiece.y, activePiece.shape)) activePiece.x--;
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
        if (!checkCollision(activePiece.x + 1, activePiece.y, activePiece.shape)) activePiece.x++;
    } else if (this.cursors.down.isDown) {
        if (!checkCollision(activePiece.x, activePiece.y + 1, activePiece.shape)) activePiece.y++;
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
        rotatePiece(activePiece);
    } else if (Phaser.Input.Keyboard.JustDown(this.spaceBar)) {
        while (!checkCollision(activePiece.x, activePiece.y + 1, activePiece.shape)) activePiece.y++;
        lockPiece();
    }

    draw.call(this);
}

function drawBlock(graphics, x, y, color, alpha = 1, size = BLOCK_SIZE) {
    graphics.fillStyle(color, alpha);
    graphics.fillRoundedRect(x + 1, y + 1, size - 2, size - 2, 4);
    if (alpha > 0.5) {
        graphics.lineStyle(2, 0xffffff, 0.2);
        graphics.strokeRoundedRect(x + 1, y + 1, size - 2, size - 2, 4);
    }
}

function draw() {
    this.graphics.clear();

    this.graphics.lineStyle(1, 0xffffff, 0.05);
    for (let r = 0; r <= ROWS; r++) {
        this.graphics.moveTo(0, r * BLOCK_SIZE);
        this.graphics.lineTo(COLS * BLOCK_SIZE, r * BLOCK_SIZE);
    }
    for (let c = 0; c <= COLS; c++) {
        this.graphics.moveTo(c * BLOCK_SIZE, 0);
        this.graphics.lineTo(c * BLOCK_SIZE, ROWS * BLOCK_SIZE);
    }
    this.graphics.strokePath();

    grid.forEach((row, r) => {
        row.forEach((color, c) => {
            if (color) drawBlock(this.graphics, c * BLOCK_SIZE, r * BLOCK_SIZE, color);
        });
    });

    particles.forEach(p => {
        if (p.alpha > 0) {
            drawBlock(this.graphics, p.x, p.y, p.color, p.alpha, p.size);
        }
    });

    if (activePiece && clearingRows.length === 0) {
        let ghostY = activePiece.y;
        while (!checkCollision(activePiece.x, ghostY + 1, activePiece.shape)) ghostY++;
        activePiece.shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value) drawBlock(this.graphics, (activePiece.x + c) * BLOCK_SIZE, (ghostY + r) * BLOCK_SIZE, activePiece.color, 0.15);
            });
        });

        activePiece.shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value) drawBlock(this.graphics, (activePiece.x + c) * BLOCK_SIZE, (activePiece.y + r) * BLOCK_SIZE, activePiece.color);
            });
        });
    }

    if (gameOver) {
        showGameOver();
    }
}

// Lightweight redraw used only during line-clear animation
// Skips grid + piece rendering to avoid unnecessary GPU work each frame
function drawParticlesOnly() {
    this.graphics.clear();
    particles.forEach(p => {
        if (p.alpha > 0) {
            drawBlock(this.graphics, p.x, p.y, p.color, p.alpha, p.size);
        }
    });
}

function showGameOver() {
    if (!scoreSubmittedThisGame && score > 0) {
        scoreSubmittedThisGame = true;
        saveScoreToLeaderboard(playerName, score);
    }
    renderLeaderboard(score);
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function resetGame() {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
        grid[r] = Array(COLS).fill(0);
    }
    score = 0;
    level = 1;
    dropInterval = 800;
    gameOver = false;
    clearingRows = [];
    particles = [];
    nextPieceType = null;
    scoreSubmittedThisGame = false;

    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.innerText = '0000';
    const levelEl = document.getElementById('level');
    if (levelEl) levelEl.innerText = '1';

    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.style.display = 'none';

    spawnPiece();
}

// Touch Gestures Implementation
function setupTouchGestures() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    const swipeThreshold = 30; // Min pixels for a swipe
    const tapThreshold = 200; // Max ms for a tap

    this.input.on('pointerdown', (pointer) => {
        startX = pointer.x;
        startY = pointer.y;
        startTime = game.loop.time;
    });

    this.input.on('pointerup', (pointer) => {
        if (gameOver || clearingRows.length > 0) return;

        const deltaX = pointer.x - startX;
        const deltaY = pointer.y - startY;
        const duration = game.loop.time - startTime;

        // Detect Swipes
        if (Math.abs(deltaX) > swipeThreshold || Math.abs(deltaY) > swipeThreshold) {
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Horizontal Swipe
                if (deltaX > swipeThreshold) {
                    // Swipe Right
                    if (!checkCollision(activePiece.x + 1, activePiece.y, activePiece.shape)) activePiece.x++;
                } else if (deltaX < -swipeThreshold) {
                    // Swipe Left
                    if (!checkCollision(activePiece.x - 1, activePiece.y, activePiece.shape)) activePiece.x--;
                }
            } else {
                // Vertical Swipe
                if (deltaY > swipeThreshold) {
                    // Swipe Down -> Hard Drop
                    while (!checkCollision(activePiece.x, activePiece.y + 1, activePiece.shape)) {
                        activePiece.y++;
                    }
                    lockPiece();
                }
            }
        }
        // Detect Tap
        else if (duration < tapThreshold) {
            rotatePiece(activePiece);
        }
    });
}

// Event Listeners for UI Buttons
document.getElementById('play-again-btn').addEventListener('click', resetGame);
document.getElementById('header-restart').addEventListener('click', (e) => {
    if (e.target.innerText.toUpperCase() === 'RELOAD') {
        location.reload();
    } else {
        resetGame();
    }
});

document.getElementById('quit-btn').addEventListener('click', () => {
    document.getElementById('game-over-overlay').style.display = 'none';
    document.getElementById('quit-confirm-overlay').style.display = 'flex';
});

document.getElementById('confirm-yes-btn').addEventListener('click', () => {
    document.getElementById('quit-confirm-overlay').style.display = 'none';
    document.getElementById('thank-you-overlay').style.display = 'flex';
    gameOver = true; // Ensure game logic remains stopped
    const headerRestart = document.getElementById('header-restart');
    if (headerRestart) headerRestart.innerText = 'RELOAD';
});

document.getElementById('confirm-no-btn').addEventListener('click', () => {
    document.getElementById('quit-confirm-overlay').style.display = 'none';
    document.getElementById('game-over-overlay').style.display = 'flex';
});

// Loading Screen Logic
const hints = [
    "tap to rotate the block",
    "swipe down to drop the block",
    "swipe left and right to direct the block"
];

function initLoadingScreen() {
    console.log("Initializing Loading Screen...");
    const loadingScreen = document.getElementById('loading-screen');
    const hintText = document.getElementById('hint-text');
    const mainWrapper = document.querySelector('.main-wrapper');

    if (!loadingScreen || !mainWrapper) {
        console.error("Loading screen elements not found");
        return;
    }

    // Select a single random hint for this session
    if (hintText) {
        const randomHint = hints[Math.floor(Math.random() * hints.length)];
        hintText.innerText = randomHint;
    }

    // Fail-safe and Transition
    const finishLoading = () => {
        console.log("Finishing loading...");
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            loadingScreen.style.visibility = 'hidden';
            // Show the name entry screen instead of going straight to the game
            showNameEntry();
        }, 500);
    };

    // Set timeout to finish loading after 2 seconds
    setTimeout(finishLoading, 2000);
}

// ── Name Entry logic ─────────────────────────────────────────────────────
function showNameEntry() {
    const screen = document.getElementById('name-entry-screen');
    const input = document.getElementById('player-name-input');
    const btn = document.getElementById('start-game-btn');
    if (!screen || !input || !btn) { startActualGame(); return; }

    // Pre-fill saved name
    const saved = localStorage.getItem(LS_NAME) || '';
    input.value = saved;
    screen.style.display = 'flex';

    // Allow pressing Enter to start
    input.addEventListener('keydown', function handler(e) {
        if (e.key === 'Enter') { input.removeEventListener('keydown', handler); confirmName(); }
    });

    btn.addEventListener('click', confirmName);

    function confirmName() {
        const name = input.value.trim();
        playerName = name || 'ANON';
        if (name) localStorage.setItem(LS_NAME, name);
        screen.style.display = 'none';
        startActualGame();
    }
}

function startActualGame() {
    const mainWrapper = document.querySelector('.main-wrapper');
    if (mainWrapper) mainWrapper.style.display = 'flex';
    if (window.game && window.game.scale) window.game.scale.refresh();
}

// Run immediately as the script is at the end of the body
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoadingScreen);
} else {
    initLoadingScreen();
}
