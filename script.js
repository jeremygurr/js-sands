/* -----------------------------------------------------------
   Falling‑Sands Playground – main JavaScript (refactored)
   ----------------------------------------------------------- */
(function () {
  // -----------------------------------------------------------
  // CONFIGURATION & GLOBALS
  // -----------------------------------------------------------
  const CELL_SIZE = 8;
  const STEAM_LIFETIME = 120;

  // ----- particle type IDs (named constants) -----
  const EMPTY = 0;
  const SAND = 1;
  const WATER = 2;
  const STONE = 3;
  const FIRE = 4;
  const STEAM = 5;

  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const toolbar = document.getElementById('toolbar');
  const pauseBtn = document.getElementById('pauseBtn');
  const clearBtn = document.getElementById('clearBtn');
  const fpsDisplay = document.getElementById('fps');

  let widthCells = 0;
  let heightCells = 0;
  let grid = null;   // Uint8Array – material IDs
  let lifeGrid = null;   // Uint16Array – steam lifetimes
  let activeTool = SAND;   // default to sand
  let mouseDown = false;
  let mousePos = { x: 0, y: 0 };
  let paused = false;
  let frameCount = 0;
  let lastFpsUpdate = 0;
  let fps = 0;

  const PALETTE = [
    [0, 0, 0, 0], // EMPTY – transparent
    [194, 178, 128, 255],    // SAND
    [74, 144, 226, 255],    // WATER
    [85, 85, 85, 255],   // STONE
    [255, 69, 0, 255],    // FIRE
    [204, 204, 255, 180]     // STEAM (semi‑transparent)
  ];

  // -----------------------------------------------------------
  // HELPERS
  // -----------------------------------------------------------
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function getCellFromPixel(px, py) {
    const x = Math.floor(px / CELL_SIZE);
    const y = Math.floor(py / CELL_SIZE);
    return { x: clamp(x, 0, widthCells - 1), y: clamp(y, 0, heightCells - 1) };
  }

  function paintAt(px, py, typeId) {
    const { x, y } = getCellFromPixel(px, py);
    const idx = y * widthCells + x;
    if (idx < 0 || idx >= grid.length) return;
    grid[idx] = typeId;
    if (typeId === STEAM) lifeGrid[idx] = STEAM_LIFETIME;
  }

  function clearGrid() {
    grid.fill(EMPTY);
    lifeGrid.fill(0);
  }

  function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    widthCells = Math.floor(width / CELL_SIZE);
    heightCells = Math.floor(height / CELL_SIZE);

    const newGrid = new Uint8Array(widthCells * heightCells);
    const newLifeGrid = new Uint16Array(widthCells * heightCells);

    for (let y = 0; y < heightCells; y++) {
      for (let x = 0; x < widthCells; x++) {
        const oldX = x * CELL_SIZE + CELL_SIZE / 2;
        const oldY = y * CELL_SIZE + CELL_SIZE / 2;
        const oldCell = getCellFromPixel(oldX, oldY);
        if (
          oldCell.x < 0 ||
          oldCell.x >= widthCells ||
          oldCell.y < 0 ||
          oldCell.y >= heightCells
        )
          continue;
        const oldIdx = oldCell.y * widthCells + oldCell.x;
        const newIdx = y * widthCells + x;
        newGrid[newIdx] = grid[oldIdx];
        newLifeGrid[newIdx] = lifeGrid[oldIdx];
      }
    }

    grid = newGrid;
    lifeGrid = newLifeGrid;
    renderFrame();
  }

  /**
   * Activate the tool with the given numeric `id`.
   * - Updates the global `activeTool`.
   * - Removes the `.active` class from every tool button.
   * - Adds `.active` to the matching button and sets `aria‑pressed="true"`.
   *
   * @param {number} id  The `data-id` of the tool to activate.
   */
  function setActiveTool(id) {
    activeTool = id; // update the simulation state

    // `tools` is defined once in `init()` (see below) – we keep a reference
    tools.forEach(btn => btn.classList.remove('active'));

    const target = Array.from(tools).find(
      btn => parseInt(btn.dataset.id, 10) === id
    );
    if (target) {
      target.classList.add('active');
      target.setAttribute('aria-pressed', 'true');
    }
  }

  // -----------------------------------------------------------
  // MOUSE / PAINTING
  // -----------------------------------------------------------
  function handleMousePainting() {
    if (mouseDown) paintAt(mousePos.x, mousePos.y, activeTool);
  }

  // -----------------------------------------------------------
  // PARTICLE SIMULATION (big switch)
  // -----------------------------------------------------------
  function updateParticles() {
    for (let y = heightCells - 1; y >= 0; y--) {
      for (let x = 0; x < widthCells; x++) {
        const idx = y * widthCells + x;
        const type = grid[idx];

        switch (type) {
          case SAND: {               // ---- Sand ----
            if (y === heightCells - 1) break;
            const below = idx + widthCells;
            if (grid[below] === EMPTY || grid[below] === WATER) {
              // swap with empty or water below
              [grid[idx], grid[below]] = [grid[below], grid[idx]];
              [lifeGrid[idx], lifeGrid[below]] = [lifeGrid[below], lifeGrid[idx]];
            } else {
              // try to slide left/right
              const left = x > 0 ? below - 1 : -1;
              const right = x < widthCells - 1 ? below + 1 : -1;
              const candidates = [];
              if (left !== -1 && grid[left] === EMPTY) candidates.push(left);
              if (right !== -1 && grid[right] === EMPTY) candidates.push(right);
              if (candidates.length) {
                const target = candidates[Math.random() < 0.5 ? 0 : 1];
                [grid[idx], grid[target]] = [grid[target], grid[idx]];
                [lifeGrid[idx], lifeGrid[target]] = [lifeGrid[target], lifeGrid[idx]];
              }
            }
            break;
          }

          case WATER: {              // ---- Water ----
            if (y === heightCells - 1) break;
            const waterBelow = idx + widthCells;
            if (grid[waterBelow] === EMPTY) {
              // fall straight down
              [grid[idx], grid[waterBelow]] = [grid[waterBelow], grid[idx]];
              [lifeGrid[idx], lifeGrid[waterBelow]] = [lifeGrid[waterBelow], lifeGrid[idx]];
            } else {
              // try side then diagonal moves
              const side = [];
              if (x > 0 && grid[idx - 1] === EMPTY) side.push(idx - 1);
              if (x < widthCells - 1 && grid[idx + 1] === EMPTY) side.push(idx + 1);
              if (side.length) {
                const target = side[Math.random() < 0.5 ? 0 : 1];
                [grid[idx], grid[target]] = [grid[target], grid[idx]];
                [lifeGrid[idx], lifeGrid[target]] = [lifeGrid[target], lifeGrid[idx]];
              } else {
                const diag = [];
                if (x > 0 && grid[waterBelow - 1] === EMPTY) diag.push(waterBelow - 1);
                if (x < widthCells - 1 && grid[waterBelow + 1] === EMPTY) diag.push(waterBelow + 1);
                if (diag.length) {
                  const target = diag[Math.random() < 0.5 ? 0 : 1];
                  [grid[idx], grid[target]] = [grid[target], grid[idx]];
                  [lifeGrid[idx], lifeGrid[target]] = [lifeGrid[target], lifeGrid[idx]];
                }
              }
            }
            break;
          }

          case STONE: {              // ---- Stone ----
            // Stone never moves – nothing to do
            break;
          }

          case FIRE: {               // ---- Fire ----
            const neighbours = [
              idx - widthCells - 1, idx - widthCells, idx - widthCells + 1,
              idx - 1, idx + 1,
              idx + widthCells - 1, idx + widthCells, idx + widthCells + 1,
            ];
            let reacted = false;
            for (const nIdx of neighbours) {
              if (nIdx < 0 || nIdx >= grid.length) continue;
              if (grid[nIdx] === WATER) {
                grid[idx] = STEAM;
                grid[nIdx] = STEAM;
                lifeGrid[idx] = STEAM_LIFETIME;
                lifeGrid[nIdx] = STEAM_LIFETIME;
                reacted = true;
                break;
              }
            }
            if (reacted) break;

            // fire behaves like sand (falls) but can also spread sideways/diag
            if (y === heightCells - 1) break;
            const fireBelow = idx + widthCells;
            if (grid[fireBelow] === EMPTY) {
              [grid[idx], grid[fireBelow]] = [grid[fireBelow], grid[idx]];
              [lifeGrid[idx], lifeGrid[fireBelow]] = [lifeGrid[fireBelow], lifeGrid[idx]];
            } else {
              const side = [];
              if (x > 0 && grid[idx - 1] === EMPTY) side.push(idx - 1);
              if (x < widthCells - 1 && grid[idx + 1] === EMPTY) side.push(idx + 1);
              if (side.length) {
                const target = side[Math.random() < 0.5 ? 0 : 1];
                [grid[idx], grid[target]] = [grid[target], grid[idx]];
                [lifeGrid[idx], lifeGrid[target]] = [lifeGrid[target], lifeGrid[idx]];
              } else {
                const diag = [];
                if (x > 0 && grid[fireBelow - 1] === EMPTY) diag.push(fireBelow - 1);
                if (x < widthCells - 1 && grid[fireBelow + 1] === EMPTY) diag.push(fireBelow + 1);
                if (diag.length) {
                  const target = diag[Math.random() < 0.5 ? 0 : 1];
                  [grid[idx], grid[target]] = [grid[target], grid[idx]];
                  [lifeGrid[idx], lifeGrid[target]] = [lifeGrid[target], lifeGrid[idx]];
                }
              }
            }
            break;
          }

          case STEAM: {              // ---- Steam ----
            // NOTE: the lifetime‑decrement code is commented out in the original
            // if (--lifeGrid[idx] <= 0) { grid[idx] = EMPTY; break; }

            if (y === 0) break; // top of screen – can't rise further
            const above = idx - widthCells;
            if (grid[above] === EMPTY) {
              // rise straight up
              [grid[idx], grid[above]] = [grid[above], grid[idx]];
              [lifeGrid[idx], lifeGrid[above]] = [lifeGrid[above], lifeGrid[idx]];
            } else {
              // try side then diagonal moves
              const side = [];
              if (x > 0 && grid[idx - 1] === EMPTY) side.push(idx - 1);
              if (x < widthCells - 1 && grid[idx + 1] === EMPTY) side.push(idx + 1);
              if (side.length) {
                const target = side[Math.random() < 0.5 ? 0 : 1];
                [grid[idx], grid[target]] = [grid[target], grid[idx]];
                [lifeGrid[idx], lifeGrid[target]] = [lifeGrid[target], lifeGrid[idx]];
              } else {
                const diag = [];
                if (x > 0 && grid[above - 1] === EMPTY) diag.push(above - 1);
                if (x < widthCells - 1 && grid[above + 1] === EMPTY) diag.push(above + 1);
                if (diag.length) {
                  const target = diag[Math.random() < 0.5 ? 0 : 1];
                  [grid[idx], grid[target]] = [grid[target], grid[idx]];
                  [lifeGrid[idx], lifeGrid[target]] = [lifeGrid[target], lifeGrid[idx]];
                }
              }
            }
            break;
          }

          default:
            break;
        }
      }
    }
  }

  // -----------------------------------------------------------
  // RENDERING
  // -----------------------------------------------------------
  function renderFrame() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let y = 0; y < heightCells; y++) {
      for (let x = 0; x < widthCells; x++) {
        const idx = y * widthCells + x;
        const type = grid[idx];
        const [r, g, b, a] = PALETTE[type];
        const pixelStart = (y * CELL_SIZE * canvas.width + x * CELL_SIZE) * 4;

        for (let dy = 0; dy < CELL_SIZE; dy++) {
          for (let dx = 0; dx < CELL_SIZE; dx++) {
            const offset = (dy * canvas.width + dx) * 4 + pixelStart;
            data[offset] = r;
            data[offset + 1] = g;
            data[offset + 2] = b;
            data[offset + 3] = a;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // -----------------------------------------------------------
  // FPS COUNTER
  // -----------------------------------------------------------
  function updateFps() {
    frameCount++;
    const now = Date.now();
    if (now - lastFpsUpdate >= 1000) {
      fps = frameCount;
      frameCount = 0;
      lastFpsUpdate = now;
      fpsDisplay.textContent = `${fps} FPS`;
    }
  }

  // -----------------------------------------------------------
  // MAIN LOOP
  // -----------------------------------------------------------
  function tick() {
    if (paused) {
      requestAnimationFrame(tick);
      return;
    }
    handleMousePainting();
    updateParticles();
    renderFrame();
    updateFps();
    requestAnimationFrame(tick);
  }

  // -----------------------------------------------------------
  // INITIALISATION
  // -----------------------------------------------------------
  let tools; // will hold the NodeList of tool buttons (global for setActiveTool)

  function init() {
    // ----- canvas & grid -----
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    widthCells = Math.floor(canvas.width / CELL_SIZE);
    heightCells = Math.floor(canvas.height / CELL_SIZE);

    grid = new Uint8Array(widthCells * heightCells);
    lifeGrid = new Uint16Array(widthCells * heightCells);

    // ----- toolbar buttons -----
    tools = document.querySelectorAll('.tool');

    // set default tool (sand) using the new helper
    setActiveTool(SAND);

    // Click‑handler for any tool (keeps UI in sync)
    tools.forEach(btn => {
      btn.addEventListener('click', function () {
        setActiveTool(parseInt(this.dataset.id, 10));
      });
    });

    // ----- pause button -----
    pauseBtn.addEventListener('click', function () {
      paused = !paused;
      this.classList.toggle('paused');
      this.setAttribute('aria-pressed', paused ? 'true' : 'false');
    });

    // ----- clear button -----
    clearBtn.addEventListener('click', function () {
      clearGrid();
      renderFrame();
    });

    // ----- mouse handling -----
    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      mouseDown = true;
      paintAt(e.offsetX, e.offsetY, activeTool);
    });

    canvas.addEventListener('mousemove', e => {
      if (mouseDown) paintAt(e.offsetX, e.offsetY, activeTool);
      mousePos = { x: e.offsetX, y: e.offsetY };
    });

    window.addEventListener('mouseup', () => (mouseDown = false));
    window.addEventListener('mouseleave', () => (mouseDown = false));

    // ----- resize -----
    window.addEventListener('resize', resizeCanvas);

    // ----- keyboard shortcuts -----
    window.addEventListener('keydown', e => {
      switch (e.key.toLowerCase()) {
        case 's':
          setActiveTool(SAND);
          break;
        case 'w':
          setActiveTool(WATER);
          break;
        case 'r':
          setActiveTool(STONE);
          break;
        case 'f':
          setActiveTool(FIRE);
          break;
        case 'e':
          setActiveTool(EMPTY);
          break;
        case ' ':
          // space → pause
          paused = !paused;
          pauseBtn.classList.toggle('paused');
          pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
          e.preventDefault();
          break;
        case 'c':
          // clear
          clearGrid();
          renderFrame();
          e.preventDefault();
          break;
        default:
          return;
      }
    });

    // ----- start loop -----
    requestAnimationFrame(tick);
  }

  // Run when the DOM is ready
  document.addEventListener('DOMContentLoaded', init);
})();