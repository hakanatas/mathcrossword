document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const entranceScreen = document.getElementById('entrance-screen');
    const appContainer = document.querySelector('.app-container');
    const puzzleGrid = document.getElementById('puzzle-grid');
    const numberPool = document.getElementById('number-pool');
    const checkBtn = document.getElementById('check-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const menuBtn = document.getElementById('menu-btn');
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
    // Difficulty State
    let difficulty = 'easy'; // Default
    const difficultyScreen = document.getElementById('difficulty-screen');
    const difficultyBtns = document.querySelectorAll('#difficulty-screen button');

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            difficultyScreen.classList.remove('hidden');
        });
    }

    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            difficulty = btn.dataset.diff;
            difficultyScreen.classList.add('hidden');
            // Save difficulty preference
            localStorage.setItem('mathCrossword_difficulty', difficulty);
            // Reset game for new difficulty
            startNewGameWithDifficulty();
        });
    });

    function startNewGameWithDifficulty() {
        currentLevel = 1;
        currentScore = 0;
        gridData = [];
        poolNumbers = [];
        localStorage.removeItem('mathCrossword_currentPuzzle'); // clear old puzzle
        saveProgress(); // save reset level
        initGame();
    }

    function initGameData() {
        // Load difficulty
        const savedDiff = localStorage.getItem('mathCrossword_difficulty');
        if (savedDiff) {
            difficulty = savedDiff;
        } else {
            // Show selection screen if no difficulty saved (first time or clear)
            difficultyScreen.classList.remove('hidden');
            return; // Wait for selection
        }

        const savedProgress = JSON.parse(localStorage.getItem('mathCrossword_progress'));
        if (savedProgress) {
            currentLevel = savedProgress.level || 1;
            currentScore = savedProgress.score || 0;
        }

        const savedPuzzle = JSON.parse(localStorage.getItem('mathCrossword_currentPuzzle'));

        // Validate saved puzzle
        let isValid = false;
        if (savedPuzzle && savedPuzzle.gridData) {
            // Check if there are any numbers in the grid
            const hasNumbers = savedPuzzle.gridData.some(row =>
                row.some(cell => cell.type === 'number')
            );
            if (hasNumbers) isValid = true;
        }

        if (isValid) {
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
            console.log("No valid saved puzzle found, initializing new game.");
            initGame();
        }
    }

    function initGame() {
        // Retry logic to ensure we get a valid puzzle
        let attempts = 0;
        let success = false;

        while (!success && attempts < 5) {
            attempts++;
            success = generateChainedPuzzle();
        }

        if (!success) {
            console.error("Failed to generate puzzle after multiple attempts");
            // Fallback to a simple state or alert user?
            // For now, let's just proceed, renderGrid will handle empty gracefully-ish
        }

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

    function getDifficultyConfig() {
        switch (difficulty) {
            case 'easy':
                return { maxNum: 10, hintPct: 0.5, ops: ['+', '-'] };
            case 'medium':
                return { maxNum: 15, hintPct: 0.2, ops: ['+', '-', '*'] };
            case 'hard':
                return { maxNum: 50, hintPct: 0, ops: ['+', '-', '*', '/'] };
            default:
                return { maxNum: 10, hintPct: 0.5, ops: ['+', '-'] };
        }
    }

    function generateChainedPuzzle() {
        // Initialize empty grid (larger to allow more freedom)
        gridData = Array(fullGridSize).fill(null).map(() =>
            Array(fullGridSize).fill(null).map(() => ({ type: 'empty' }))
        );
        poolNumbers = [];

        const config = getDifficultyConfig();
        const currentOps = config.ops;
        const maxNumber = config.maxNum;

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

        if (equationsCount === 0) return false; // failed to place any

        calculateGridBoundaries();

        const allNumbers = [];
        const numberCells = [];

        // Collect all number cells
        for (let r = 0; r < fullGridSize; r++) {
            for (let c = 0; c < fullGridSize; c++) {
                if (gridData[r][c].type === 'number') {
                    numberCells.push({ r, c, val: gridData[r][c].correct });
                }
            }
        }

        // Apply hints
        const hintsCount = Math.floor(numberCells.length * config.hintPct);
        // Shuffle to pick random hints
        numberCells.sort(() => Math.random() - 0.5);

        numberCells.forEach((cell, idx) => {
            if (idx < hintsCount) {
                // Mark as fixed hint
                gridData[cell.r][cell.c].value = cell.val;
                gridData[cell.r][cell.c].fixed = true;
            } else {
                // Add to pool
                allNumbers.push(cell.val);
            }
        });

        poolNumbers = allNumbers.sort(() => Math.random() - 0.5);
        return true; // success

        function tryPlaceEquation(r, c, dir, seed) {
            const dr = dir === 'V' ? 1 : 0;
            const dc = dir === 'H' ? 1 : 0;

            // Hard mode prefer length 7 (3 numbers), else length 5 (2 numbers)
            let eqLen = 5;
            if (difficulty === 'hard' && Math.random() > 0.0) { // Always 3-term if hard? Or mix? Requirement said "at least 6 boxes", so length 7 is good (7 boxes). Let's do most of the time.
                eqLen = 7;
            }

            const maxIdx = eqLen - 1;
            if (r < 0 || c < 0 || r + dr * maxIdx >= fullGridSize || c + dc * maxIdx >= fullGridSize) return false;

            // Collision check
            for (let i = 0; i < eqLen; i++) {
                const tr = r + dr * i;
                const tc = c + dc * i;
                const existing = gridData[tr][tc];

                // Seed valid indices: 0, 2, 4 (for both), and 6 (for len 7)
                // These are the Node Positions (numbers or result)
                const isNodePos = (i % 2 === 0);

                if (seed && seed.r === tr && seed.c === tc) {
                    if (!isNodePos) return false;
                    // Seed index must be valid node pos
                    continue;
                }

                if (existing.type !== 'empty') return false;
            }

            // Neighbor Check
            for (let i = 0; i < eqLen; i++) {
                const tr = r + dr * i;
                const tc = c + dc * i;
                if (seed && seed.r === tr && seed.c === tc) continue;

                const nr = dr === 0 ? 1 : 0;
                const nc = dc === 0 ? 1 : 0;
                if (checkNeighbor(tr + nr, tc + nc)) return false;
                if (checkNeighbor(tr - nr, tc - nc)) return false;
            }

            function checkNeighbor(nr, nc) {
                if (nr >= 0 && nr < fullGridSize && nc >= 0 && nc < fullGridSize) {
                    if (gridData[nr][nc].type !== 'empty') return true;
                }
                return false;
            }

            // Generate Content
            let cellsToPlace = [];
            let valid = false;

            // Allow multiple attempts to find valid numbers
            for (let attempt = 0; attempt < 20; attempt++) {
                if (eqLen === 5) {
                    let n1 = getValAt(0);
                    let n2 = getValAt(2);
                    let nRes = getValAt(4);
                    let op = currentOps[Math.floor(Math.random() * currentOps.length)];

                    if (!n1) n1 = randNum();
                    if (!n2) n2 = randNum();

                    let res = calculate(n1, op, n2);

                    if (isValidResult(res, nRes)) {
                        cellsToPlace = [
                            { type: 'number', val: n1, pos: [r, c] },
                            { type: 'operator', val: op, pos: [r + dr, c + dc] },
                            { type: 'number', val: n2, pos: [r + dr * 2, c + dc * 2] },
                            { type: 'operator', val: '=', pos: [r + dr * 3, c + dc * 3] },
                            { type: 'result', val: res, pos: [r + dr * 4, c + dc * 4] }
                        ];
                        valid = true;
                        break;
                    }
                } else {
                    // Length 7
                    let n1 = getValAt(0);
                    let n2 = getValAt(2);
                    let n3 = getValAt(4);
                    let nRes = getValAt(6);

                    let op1 = currentOps[Math.floor(Math.random() * currentOps.length)];
                    let op2 = currentOps[Math.floor(Math.random() * currentOps.length)];

                    if (!n1) n1 = randNum();
                    if (!n2) n2 = randNum();
                    if (!n3) n3 = randNum();

                    let res = calculate3(n1, op1, n2, op2, n3);

                    if (isValidResult(res, nRes)) {
                        cellsToPlace = [
                            { type: 'number', val: n1, pos: [r, c] },
                            { type: 'operator', val: op1, pos: [r + dr, c + dc] },
                            { type: 'number', val: n2, pos: [r + dr * 2, c + dc * 2] },
                            { type: 'operator', val: op2, pos: [r + dr * 3, c + dc * 3] },
                            { type: 'number', val: n3, pos: [r + dr * 4, c + dc * 4] },
                            { type: 'operator', val: '=', pos: [r + dr * 5, c + dc * 5] },
                            { type: 'result', val: res, pos: [r + dr * 6, c + dc * 6] }
                        ];
                        valid = true;
                        break;
                    }
                }
            }

            if (!valid) return false;

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

            function getValAt(idx) {
                const tr = r + dr * idx;
                const tc = c + dc * idx;
                if (seed && seed.r === tr && seed.c === tc) return seed.val;
                return null;
            }
            function randNum() { return Math.floor(Math.random() * maxNumber) + 1; }
            function isValidResult(res, fixedRes) {
                if (fixedRes !== null && res !== fixedRes) return false;
                if (!Number.isInteger(res) || res <= 0 || res > (maxNumber * maxNumber * 2)) return false;
                return true;
            }
        } // end tryPlaceEquation

        function calculate3(n1, op1, n2, op2, n3) {
            const isHigh = (op) => op === '*' || op === '/';
            if (!isHigh(op1) && isHigh(op2)) {
                const intermediate = calculate(n2, op2, n3);
                return calculate(n1, op1, intermediate);
            } else {
                const intermediate = calculate(n1, op1, n2);
                return calculate(intermediate, op2, n3);
            }
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
            const availableWidth = gameArea.clientWidth - 10; // Reduced margin
            const availableHeight = gameArea.clientHeight - 10;
            const gap = 4; // Smaller gap for tight spaces

            const maxCellW = (availableWidth - (displayCols - 1) * gap) / displayCols;
            const maxCellH = (availableHeight - (displayRows - 1) * gap) / displayRows;

            // Allow cells to go much smaller, e.g. down to 20px if needed
            const cellSize = Math.floor(Math.min(maxCellW, maxCellH, 70));

            puzzleGrid.style.gap = `${gap}px`;
            puzzleGrid.style.width = `${cellSize * displayCols + (displayCols - 1) * gap}px`;
            puzzleGrid.style.fontSize = `${Math.max(12, cellSize * 0.5)}px`; // Ensure text remains legible-ish
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
                    if (cell.fixed) div.classList.add('cell-fixed');

                    if (!cell.fixed) {
                        div.addEventListener('dragover', e => e.preventDefault());
                        div.addEventListener('dragenter', handleDragEnter);
                        div.addEventListener('dragleave', handleDragLeave);
                        div.addEventListener('drop', handleDrop);
                        div.addEventListener('click', handleCellClick);
                    }
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
