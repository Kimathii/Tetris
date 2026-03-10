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
let lastDropTime = 0;
let dropInterval = 800;
let score = 0;
let level = 1;
let gameOver = false;
let clearingRows = [];
let clearingStartTime = 0;
const CLEAR_ANIM_DURATION = 600; // Longer for crumbling effect
let particles = [];

function preload() { }

function create() {
    for (let r = 0; r < ROWS; r++) {
        grid[r] = Array(COLS).fill(0);
    }

    this.graphics = this.add.graphics();
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceBar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    spawnPiece.call(this);
}

function spawnPiece() {
    const keys = Object.keys(TETROMINOES);
    const type = keys[Math.floor(Math.random() * keys.length)];
    const tetromino = TETROMINOES[type];

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
    for (let c = 0; c < COLS; c++) {
        const color = grid[row][c];
        if (color) {
            // Break each block into 4 particles
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 2; j++) {
                    particles.push({
                        x: c * BLOCK_SIZE + (i * BLOCK_SIZE / 2),
                        y: row * BLOCK_SIZE + (j * BLOCK_SIZE / 2),
                        vx: (Math.random() - 0.5) * 4,
                        vy: -Math.random() * 5 - 2, // Burst upwards
                        color: color,
                        size: BLOCK_SIZE / 2,
                        rotation: 0,
                        vRotation: (Math.random() - 0.5) * 0.2,
                        alpha: 1
                    });
                }
            }
            grid[row][c] = 0; // Clear from grid immediately so they don't draw twice
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

        // Spawn particles for each clearing row
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
    // Note: Rows are already visually "cleared" by particles, 
    // but we need to actually shift the grid data down.
    // We filter out 0 rows and fill the top.
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
    if (gameOver) return;

    // Handle Animation State
    if (clearingRows.length > 0) {
        // Update Particles
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.25; // Gravity
            p.rotation += p.vRotation;
            p.alpha -= 0.02; // Fade out
        });

        if (time - clearingStartTime > CLEAR_ANIM_DURATION) {
            finalizeLineClear();
        }
        draw.call(this);
        return;
    }

    // Normal Game Logic
    if (time - lastDropTime > dropInterval) {
        if (!checkCollision(activePiece.x, activePiece.y + 1, activePiece.shape)) {
            activePiece.y++;
        } else {
            lockPiece();
        }
        lastDropTime = time;
    }

    // Input
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

    // Draw Grid background
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

    // Draw Landed Pieces
    grid.forEach((row, r) => {
        row.forEach((color, c) => {
            if (color) drawBlock(this.graphics, c * BLOCK_SIZE, r * BLOCK_SIZE, color);
        });
    });

    // Draw Particles (Crumbling effect)
    particles.forEach(p => {
        if (p.alpha > 0) {
            drawBlock(this.graphics, p.x, p.y, p.color, p.alpha, p.size);
        }
    });

    // Draw Active Piece
    if (activePiece && clearingRows.length === 0) {
        // Ghost Piece
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

function showGameOver() {
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

    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.innerText = '0000';
    const levelEl = document.getElementById('level');
    if (levelEl) levelEl.innerText = '1';

    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.style.display = 'none';

    spawnPiece();
}

// Event Listeners for UI Buttons
document.getElementById('play-again-btn').addEventListener('click', () => {
    resetGame();
});

document.getElementById('quit-btn').addEventListener('click', () => {
    alert("Thanks for playing!");
    window.location.reload();
});

// Mobile Touch Controls
const setupTouchControls = () => {
    const btnLeft = document.getElementById('touch-left');
    const btnRight = document.getElementById('touch-right');
    const btnDown = document.getElementById('touch-down');
    const btnRotate = document.getElementById('touch-rotate');
    const btnRestart = document.getElementById('touch-restart');

    if (btnLeft) btnLeft.addEventListener('pointerdown', () => {
        if (gameOver || clearingRows.length > 0) return;
        if (!checkCollision(activePiece.x - 1, activePiece.y, activePiece.shape)) activePiece.x--;
    });
    if (btnRight) btnRight.addEventListener('pointerdown', () => {
        if (gameOver || clearingRows.length > 0) return;
        if (!checkCollision(activePiece.x + 1, activePiece.y, activePiece.shape)) activePiece.x++;
    });
    if (btnDown) btnDown.addEventListener('pointerdown', () => {
        if (gameOver || clearingRows.length > 0) return;
        while (!checkCollision(activePiece.x, activePiece.y + 1, activePiece.shape)) {
            activePiece.y++;
        }
        lockPiece();
    });
    if (btnRotate) btnRotate.addEventListener('pointerdown', () => {
        if (gameOver || clearingRows.length > 0) return;
        rotatePiece(activePiece);
    });
    if (btnRestart) btnRestart.addEventListener('pointerdown', () => {
        resetGame();
    });
};

setupTouchControls();
