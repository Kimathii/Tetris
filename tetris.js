const config = {
    type: Phaser.AUTO,
    width: 300,
    height: 600,
    backgroundColor: '#050505',
    parent: 'game-container',
    scene: {
        preload: preload,
        create: create,
        update: update
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
    spawnPiece();
}

function clearLines() {
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r].every(cell => cell !== 0)) {
            grid.splice(r, 1);
            grid.unshift(Array(COLS).fill(0));
            linesCleared++;
            r++;
        }
    }
    if (linesCleared > 0) {
        score += [0, 100, 300, 500, 800][linesCleared] * level;
        const scoreEl = document.getElementById('score');
        if (scoreEl) scoreEl.innerText = score.toString().padStart(4, '0');

        if (score >= level * 1000) {
            level++;
            const levelEl = document.getElementById('level');
            if (levelEl) levelEl.innerText = level;
            dropInterval = Math.max(100, dropInterval - 100);
        }
    }
}

function update(time, delta) {
    if (gameOver) return;

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

function drawBlock(graphics, x, y, color, alpha = 1) {
    graphics.fillStyle(color, alpha);
    graphics.fillRoundedRect(x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2, 6);
    if (alpha > 0.5) {
        graphics.lineStyle(2, 0xffffff, 0.3);
        graphics.strokeRoundedRect(x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2, 6);
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
            if (color) drawBlock(this.graphics, c, r, color);
        });
    });

    // Draw Active Piece
    if (activePiece) {
        // Ghost Piece
        let ghostY = activePiece.y;
        while (!checkCollision(activePiece.x, ghostY + 1, activePiece.shape)) ghostY++;
        activePiece.shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value) drawBlock(this.graphics, activePiece.x + c, ghostY + r, activePiece.color, 0.15);
            });
        });

        activePiece.shape.forEach((row, r) => {
            row.forEach((value, c) => {
                if (value) drawBlock(this.graphics, activePiece.x + c, activePiece.y + r, activePiece.color);
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
    window.location.reload(); // Refresh the page as a "Quit" action
});
