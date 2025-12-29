document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const entranceScreen = document.getElementById('entrance-screen');
    const appContainer = document.querySelector('.app-container');
    const puzzleGrid = document.getElementById('puzzle-grid');
    const numberPool = document.getElementById('number-pool');
    const checkBtn = document.getElementById('check-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const levelDisplay = document.getElementById('level-display');
    const scoreDisplay = document.getElementById('score-display');
    const winOverlay = document.getElementById('win-overlay');
    const nextLevelBtn = document.getElementById('next-level-btn');

    // Game State
    let currentLevel = 1;
    let currentScore = 0;
    let gridData = [];
    let poolNumbers = [];
    let fullGridSize = 13; // Larger internal grid for better branching
    let displayRows = 13;
    let displayCols = 13;
    let startRow = 0;
    let startCol = 0;

    const OPERATORS = ['+', '-', '*', '/'];

    // --- Initialization ---

    function initGameData() {
        const savedProgress = JSON.parse(localStorage.getItem('mathCrossword_progress'));
        if (savedProgress) {
            currentLevel = savedProgress.level || 1;
            currentScore = savedProgress.score || 0;
        }

        const savedPuzzle = JSON.parse(localStorage.getItem('mathCrossword_currentPuzzle'));
        if (savedPuzzle) {
            gridData = savedPuzzle.gridData;
            poolNumbers = savedPuzzle.poolNumbers;
            startRow = savedPuzzle.startRow;
            startCol = savedPuzzle.startCol;
            displayRows = savedPuzzle.displayRows;
            displayCols = savedPuzzle.displayCols;

            renderGrid();
            renderPool();
            updateStats();
        } else {
            initGame();
        }
    }

    function initGame() {
        generateChainedPuzzle();
        renderGrid();
        renderPool();
        updateStats();
        savePuzzleState();
    }

    function savePuzzleState() {
        const puzzleState = {
            gridData,
            poolNumbers,
            startRow,
            startCol,
            displayRows,
            displayCols
        };
        localStorage.setItem('mathCrossword_currentPuzzle', JSON.stringify(puzzleState));
    }

    function saveProgress() {
        const progress = { level: currentLevel, score: currentScore };
        localStorage.setItem('mathCrossword_progress', JSON.stringify(progress));
    }

    function generateChainedPuzzle() {
        // Initialize empty grid (larger to allow more freedom)
        gridData = Array(fullGridSize).fill(null).map(() =>
            Array(fullGridSize).fill(null).map(() => ({ type: 'empty' }))
        );
        poolNumbers = [];

        // Equations count increases with level
        const targetEquations = Math.min(3 + Math.floor(currentLevel / 2), 7); // Capped at 7 for screen size
        let equationsCount = 0;
        let seedNodes = [];

        // First equation - Start near center
        let firstR = Math.floor(fullGridSize / 2);
        let firstC = Math.floor(fullGridSize / 2) - 2;
        let firstDir = Math.random() > 0.5 ? 'H' : 'V';

        if (tryPlaceEquation(firstR, firstC, firstDir, null)) {
            equationsCount++;
        }

        let attempts = 0;
        while (equationsCount < targetEquations && attempts < 400) {
            attempts++;
            if (seedNodes.length === 0) break;

            const seedIndex = Math.floor(Math.random() * seedNodes.length);
            const seed = seedNodes[seedIndex];
            const nextDir = seed.dir === 'H' ? 'V' : 'H';

            // Branch from the seed number
            // Seed can be 1st number (offset 0), 2nd number (offset -2), or result (offset -4)
            const offsets = [0, -2, -4];
            const offset = offsets[Math.floor(Math.random() * offsets.length)];

            let startR = nextDir === 'V' ? seed.r + offset : seed.r;
            let startC = nextDir === 'H' ? seed.c + offset : seed.c;

            if (tryPlaceEquation(startR, startC, nextDir, seed)) {
                equationsCount++;
            }
        }

        calculateGridBoundaries();

        const allNumbers = [];
        for (let r = 0; r < fullGridSize; r++) {
            for (let c = 0; c < fullGridSize; c++) {
                if (gridData[r][c].type === 'number') {
                    allNumbers.push(gridData[r][c].correct);
                }
            }
        }
        poolNumbers = allNumbers.sort(() => Math.random() - 0.5);

        function tryPlaceEquation(r, c, dir, seed) {
            const dr = dir === 'V' ? 1 : 0;
            const dc = dir === 'H' ? 1 : 0;

            if (r < 0 || c < 0 || r + dr * 4 >= fullGridSize || c + dc * 4 >= fullGridSize) return false;

            // Collision check
            for (let i = 0; i < 5; i++) {
                const tr = r + dr * i;
                const tc = c + dc * i;
                const existing = gridData[tr][tc];

                // If seed is provided, it must match at cell 0, 2, or 4
                if (seed && seed.r === tr && seed.c === tc) {
                    if (i !== 0 && i !== 2 && i !== 4) return false;
                    continue;
                }
                if (existing.type !== 'empty') return false;
            }

            // Crossword look: check neighbors of the new path to avoid clumping
            // (Keep it sparse)
            for (let i = 0; i < 5; i++) {
                const tr = r + dr * i;
                const tc = c + dc * i;
                if (seed && seed.r === tr && seed.c === tc) continue;

                // Check side neighbors
                const nr = dr === 0 ? 1 : 0;
                const nc = dc === 0 ? 1 : 0;

                const n1r = tr + nr, n1c = tc + nc;
                const n2r = tr - nr, n2c = tc - nc;

                if (n1r >= 0 && n1r < fullGridSize && n1c >= 0 && n1c < fullGridSize) {
                    if (gridData[n1r][n1c].type !== 'empty') return false;
                }
                if (n2r >= 0 && n2r < fullGridSize && n2c >= 0 && n2c < fullGridSize) {
                    if (gridData[n2r][n2c].type !== 'empty') return false;
                }
            }

            let n1 = seed && r === seed.r && c === seed.c ? seed.val : Math.floor(Math.random() * 9) + 1;
            let n2 = seed && r + dr * 2 === seed.r && c + dc * 2 === seed.c ? seed.val : Math.floor(Math.random() * 9) + 1;
            let nRes = seed && r + dr * 4 === seed.r && c + dc * 4 === seed.c ? seed.val : null;

            let op = OPERATORS[Math.floor(Math.random() * 4)];
            let res = calculate(n1, op, n2);

            if (nRes !== null && res !== nRes) return false;
            if (!Number.isInteger(res) || res <= 0 || res > 99) return false;

            const cellsToPlace = [
                { type: 'number', val: n1, pos: [r, c] },
                { type: 'operator', val: op, pos: [r + dr, c + dc] },
                { type: 'number', val: n2, pos: [r + dr * 2, c + dc * 2] },
                { type: 'operator', val: '=', pos: [r + dr * 3, c + dc * 3] },
                { type: 'result', val: res, pos: [r + dr * 4, c + dc * 4] }
            ];

            cellsToPlace.forEach((cell) => {
                const [tr, tc] = cell.pos;
                if (cell.type === 'number') {
                    gridData[tr][tc] = { type: 'number', value: null, correct: cell.val };
                    seedNodes.push({ r: tr, c: tc, val: cell.val, dir: dir });
                } else if (cell.type === 'result') {
                    gridData[tr][tc] = { type: 'result', value: cell.val };
                    seedNodes.push({ r: tr, c: tc, val: cell.val, dir: dir });
                } else {
                    gridData[tr][tc] = { type: cell.type, value: cell.val };
                }
            });

            return true;
        }
    }

    function calculate(a, op, b) {
        switch (op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return a / b;
            default: return 0;
        }
    }

    function calculateGridBoundaries() {
        let minR = fullGridSize, maxR = 0, minC = fullGridSize, maxC = 0;
        let hasCells = false;

        for (let r = 0; r < fullGridSize; r++) {
            for (let c = 0; c < fullGridSize; c++) {
                if (gridData[r][c].type !== 'empty') {
                    minR = Math.min(minR, r);
                    maxR = Math.max(maxR, r);
                    minC = Math.min(minC, c);
                    maxC = Math.max(maxC, c);
                    hasCells = true;
                }
            }
        }

        if (hasCells) {
            // Add 1 cell padding if possible
            startRow = Math.max(0, minR - 1);
            startCol = Math.max(0, minC - 1);
            displayRows = Math.min(fullGridSize - startRow, (maxR - startRow) + 2);
            displayCols = Math.min(fullGridSize - startCol, (maxC - startCol) + 2);
        }
    }

    function renderGrid() {
        puzzleGrid.innerHTML = '';
        puzzleGrid.style.gridTemplateColumns = `repeat(${displayCols}, 1fr)`;

        // Autoscale logic
        const updateScaling = () => {
            const gameArea = document.querySelector('.game-area');
            if (!gameArea) return;
            const availableWidth = gameArea.clientWidth - 30; // 15px margin each side
            const availableHeight = gameArea.clientHeight - 30;
            const gap = 6;

            const maxCellW = (availableWidth - (displayCols - 1) * gap) / displayCols;
            const maxCellH = (availableHeight - (displayRows - 1) * gap) / displayRows;
            const cellSize = Math.max(30, Math.floor(Math.min(maxCellW, maxCellH, 75)));

            puzzleGrid.style.width = `${cellSize * displayCols + (displayCols - 1) * gap}px`;
            puzzleGrid.style.fontSize = `${cellSize * 0.45}px`;
        };

        updateScaling();

        if (window.gameResizeObserver) window.gameResizeObserver.disconnect();
        window.gameResizeObserver = new ResizeObserver(() => updateScaling());
        window.gameResizeObserver.observe(document.querySelector('.game-area'));

        for (let r = startRow; r < startRow + displayRows; r++) {
            for (let c = startCol; c < startCol + displayCols; c++) {
                const cell = gridData[r][c];
                const div = document.createElement('div');
                div.className = `grid-cell cell-${cell.type}`;
                div.dataset.r = r;
                div.dataset.c = c;

                if (cell.type === 'number') {
                    div.textContent = cell.value || '';
                    if (cell.value) div.classList.add('filled');

                    div.addEventListener('dragover', e => e.preventDefault());
                    div.addEventListener('dragenter', handleDragEnter);
                    div.addEventListener('dragleave', handleDragLeave);
                    div.addEventListener('drop', handleDrop);
                    div.addEventListener('click', handleCellClick);
                } else if (cell.type !== 'empty') {
                    div.textContent = cell.value;
                }

                puzzleGrid.appendChild(div);
            }
        }
    }

    function renderPool() {
        numberPool.innerHTML = '';
        poolNumbers.forEach((num, index) => {
            const div = document.createElement('div');
            div.className = 'pool-number';
            div.textContent = num;
            div.draggable = true;
            div.dataset.index = index;
            div.dataset.value = num;

            div.addEventListener('dragstart', handleDragStart);
            div.addEventListener('dragend', handleDragEnd);
            div.addEventListener('click', handlePoolClick);

            numberPool.appendChild(div);
        });
    }

    // Drag, Drop, Click Handlers
    function handleDragStart(e) {
        e.target.classList.add('dragging');
        e.dataTransfer.setData('text/plain', e.target.dataset.value);
        e.dataTransfer.setData('source-index', e.target.dataset.index);
    }
    function handleDragEnd(e) { e.target.classList.remove('dragging'); }
    function handleDragEnter(e) { if (e.target.classList.contains('cell-number')) e.target.classList.add('drag-over'); }
    function handleDragLeave(e) { e.target.classList.remove('drag-over'); }

    function handleDrop(e) {
        e.preventDefault();
        const cell = e.target;
        cell.classList.remove('drag-over');
        if (!cell.classList.contains('cell-number')) return;

        const value = parseInt(e.dataTransfer.getData('text/plain'));
        const sourceIndex = parseInt(e.dataTransfer.getData('source-index'));
        const r = parseInt(cell.dataset.r);
        const c = parseInt(cell.dataset.c);

        if (gridData[r][c].value !== null) poolNumbers.push(gridData[r][c].value);
        gridData[r][c].value = value;
        poolNumbers.splice(sourceIndex, 1);

        renderGrid();
        renderPool();
        savePuzzleState();
    }

    let selectedPoolIndex = null;
    function handlePoolClick(e) {
        const index = parseInt(e.target.dataset.index);
        if (selectedPoolIndex === index) {
            selectedPoolIndex = null;
            e.target.style.outline = 'none';
        } else {
            selectedPoolIndex = index;
            document.querySelectorAll('.pool-number').forEach(el => el.style.outline = 'none');
            e.target.style.outline = '3px solid white';
        }
    }

    function handleCellClick(e) {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);

        if (selectedPoolIndex !== null) {
            const value = poolNumbers[selectedPoolIndex];
            if (gridData[r][c].value !== null) poolNumbers.push(gridData[r][c].value);
            gridData[r][c].value = value;
            poolNumbers.splice(selectedPoolIndex, 1);
            selectedPoolIndex = null;
            renderGrid();
            renderPool();
            savePuzzleState();
        } else if (gridData[r][c].value !== null) {
            poolNumbers.push(gridData[r][c].value);
            gridData[r][c].value = null;
            renderGrid();
            renderPool();
            savePuzzleState();
        }
    }

    function checkSolution() {
        let filled = true;
        for (let r = 0; r < fullGridSize; r++) {
            for (let c = 0; c < fullGridSize; c++) {
                if (gridData[r][c].type === 'number' && gridData[r][c].value === null) filled = false;
            }
        }

        if (filled) {
            let totalEquations = 0;
            let correctEquations = 0;

            for (let r = 0; r < fullGridSize; r++) {
                for (let c = 0; c <= fullGridSize - 5; c++) {
                    if (isStartOfEquation(r, c, 'H')) {
                        totalEquations++;
                        if (validateEquation(r, c, 'H')) correctEquations++;
                    }
                }
            }

            for (let c = 0; c < fullGridSize; c++) {
                for (let r = 0; r <= fullGridSize - 5; r++) {
                    if (isStartOfEquation(r, c, 'V')) {
                        totalEquations++;
                        if (validateEquation(r, c, 'V')) correctEquations++;
                    }
                }
            }

            if (correctEquations === totalEquations && totalEquations > 0) {
                showWin();
            } else {
                shakeGrid();
            }
        } else {
            shakeGrid();
        }
    }

    function isStartOfEquation(r, c, dir) {
        const dr = dir === 'V' ? 1 : 0;
        const dc = dir === 'H' ? 1 : 0;
        return (
            gridData[r][c].type === 'number' &&
            gridData[r + dr][c + dc].type === 'operator' &&
            gridData[r + dr * 2][c + dc * 2].type === 'number' &&
            gridData[r + dr * 3][c + dc * 3].value === '=' &&
            gridData[r + dr * 4][c + dc * 4].type === 'result'
        );
    }

    function validateEquation(r, c, dir) {
        const dr = dir === 'V' ? 1 : 0;
        const dc = dir === 'H' ? 1 : 0;
        return calculate(gridData[r][c].value, gridData[r + dr][c + dc].value, gridData[r + dr * 2][c + dc * 2].value) === gridData[r + dr * 4][c + dc * 4].value;
    }

    function shakeGrid() {
        puzzleGrid.classList.add('shake');
        setTimeout(() => puzzleGrid.classList.remove('shake'), 500);
    }

    function showWin() {
        winOverlay.classList.remove('hidden');
        currentScore += (currentLevel * 10);
        updateStats();
        saveProgress();
    }

    function updateStats() {
        levelDisplay.textContent = currentLevel;
        scoreDisplay.textContent = currentScore;
    }

    nextLevelBtn.addEventListener('click', () => {
        currentLevel++;
        winOverlay.classList.add('hidden');
        initGame();
        saveProgress();
    });

    newGameBtn.addEventListener('click', () => {
        localStorage.removeItem('mathCrossword_currentPuzzle');
        initGame();
    });
    checkBtn.addEventListener('click', checkSolution);

    // Initial load
    initGameData();
});
