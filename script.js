/* -------------------------------------------------------------
   Falling‑Sands Playground – main JavaScript (refactored)
   ------------------------------------------------------------- */
(function () {
  // === CONFIGURATION ============================================
  const CELL_SIZE = 8;
  const STEAM_LIFETIME = 120;

  // === DOM REFS ================================================
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const toolbar = document.getElementById('toolbar');
  const pauseBtn = document.getElementById('pauseBtn');
  const clearBtn = document.getElementById('clearBtn');
  const fpsDisplay = document.getElementById('fps');

  // === STATE ==================================================
  let widthCells = 0;
  let heightCells = 0;
  let grid = null;        // Uint8Array – material IDs
  let lifeGrid = null;    // Uint16Array – steam lifetimes
  let activeTool = 0;     // 0=eraser,1=sand,2=water,3=stone,4=fire,5=steam
  let mouseDown = false;
  let mousePos = { x: 0, y: 0 };
  let paused = false;
  let frameCount = 0;
  let lastFpsUpdate = 0;
  let fps = 0;

  // === PALETTE (RGBA) ==========================================
  const PALETTE = [
    [0, 0, 0, 0],           // 0 – empty (transparent)
    [194, 178, 128, 255],   // 1 – sand
    [74, 144, 226, 255],    // 2 – water
    [85, 85, 85, 255],      // 3 – stone
    [255, 69, 0, 255],      // 4 – fire
    [204, 204, 255, 180]    // 5 – steam (semi‑transparent)
  ];

  // === HELPERS =================================================
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
    if (typeId === 5) lifeGrid[idx] = STEAM_LIFETIME; // steam
  }

  function clearGrid() {
    grid.fill(0);
    lifeGrid.fill(0);
  }

  function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    // recompute grid dimensions
    widthCells = Math.floor(width / CELL_SIZE);
    heightCells = Math.floor(height / CELL_SIZE);

    // new buffers
    const newGrid = new Uint8Array(widthCells * heightCells);
    const newLifeGrid = new Uint16Array(widthCells * heightCells);

    // copy old cells where they still fit
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

  // -----------------------------------------------------------------
  // 1️⃣  Mouse‑painting (called each tick)
  // -----------------------------------------------------------------
  function handleMousePainting() {
    if (mouseDown) {
      paintAt(mousePos.x, mousePos.y, activeTool);
    }
  }

  // -----------------------------------------------------------------
  // 2️⃣  Particle simulation – the big switch‑case block
  // -----------------------------------------------------------------
  function updateParticles() {
    for (let y = heightCells - 1; y >= 0; y--) {
      for (let x = 0; x < widthCells; x++) {
        const idx = y * widthCells + x;
        const type = grid[idx];

        switch (type) {
          // ---------------------------------------------------------
          // Sand (1) – fall, slide, swap with water
          // ---------------------------------------------------------
          case 1: {
            if (y === heightCells - 1) break;
            const below = idx + widthCells;
            if (grid[below] === 0 || grid[below] === 2) {
              // swap with empty or water
              const tmp = grid[idx];
              grid[idx] = grid[below];
              grid[below] = tmp;

              const lifeA = lifeGrid[idx];
              const lifeB = lifeGrid[below];
              lifeGrid[idx] = lifeB;
              lifeGrid[below] = lifeA;
            } else {
              const left = x > 0 ? below - 1 : -1;
              const right = x < widthCells - 1 ? below + 1 : -1;
              const candidates = [];
              if (left !== -1 && grid[left] === 0) candidates.push(left);
              if (right !== -1 && grid[right] === 0) candidates.push(right);
              if (candidates.length) {
                const target = candidates[Math.random() < 0.5 ? 0 : 1];
                const tmp = grid[idx];
                grid[idx] = grid[target];
                grid[target] = tmp;

                const lifeA = lifeGrid[idx];
                const lifeB = lifeGrid[target];
                lifeGrid[idx] = lifeB;
                lifeGrid[target] = lifeA;
              }
            }
            break;
          }

          // ---------------------------------------------------------
          // Water (2) – fall, spread sideways, try diagonals
          // ---------------------------------------------------------
          case 2: {
            if (y === heightCells - 1) break;
            const waterBelow = idx + widthCells;
            if (grid[waterBelow] === 0) {
              const tmp = grid[idx];
              grid[idx] = grid[waterBelow];
              grid[waterBelow] = tmp;

              const lifeA = lifeGrid[idx];
              const lifeB = lifeGrid[waterBelow];
              lifeGrid[idx] = lifeB;
              lifeGrid[waterBelow] = lifeA;
            } else {
              const side = [];
              if (x > 0 && grid[idx - 1] === 0) side.push(idx - 1);
              if (x < widthCells - 1 && grid[idx + 1] === 0) side.push(idx + 1);
              if (side.length) {
                const target = side[Math.random() < 0.5 ? 0 : 1];
                const tmp = grid[idx];
                grid[idx] = grid[target];
                grid[target] = tmp;

                const lifeA = lifeGrid[idx];
                const lifeB = lifeGrid[target];
                lifeGrid[idx] = lifeB;
                lifeGrid[target] = lifeA;
              } else {
                // try diagonals if sides blocked
                const diag = [];
                if (x > 0 && grid[waterBelow - 1] === 0) diag.push(waterBelow - 1);
                if (x < widthCells - 1 && grid[waterBelow + 1] === 0) diag.push(waterBelow + 1);
                if (diag.length) {
                  const target = diag[Math.random() < 0.5 ? 0 : 1];
                  const tmp = grid[idx];
                  grid[idx] = grid[target];
                  grid[target] = tmp;

                  const lifeA = lifeGrid[idx];
                  const lifeB = lifeGrid[target];
                  lifeGrid[idx] = lifeB;
                  lifeGrid[target] = lifeA;
                }
              }
            }
            break;
          }

          // ---------------------------------------------------------
          // Fire (4) – rises, burns water into steam, otherwise behaves like sand
          // ---------------------------------------------------------
          case 4: {
            // 1️⃣ try to turn adjacent water into steam
            const neighbours = [
              idx - widthCells - 1,
              idx - widthCells,
              idx - widthCells + 1,
              idx - 1,
              idx + 1,
              idx + widthCells - 1,
              idx + widthCells,
              idx + widthCells + 1,
            ];
            let reacted = false;
            for (const nIdx of neighbours) {
              if (nIdx < 0 || nIdx >= grid.length) continue;
              if (grid[nIdx] === 2) {
                grid[idx] = 5;
                grid[nIdx] = 5;
                lifeGrid[idx] = STEAM_LIFETIME;
                lifeGrid[nIdx] = STEAM_LIFETIME;
                reacted = true;
                break;
              }
            }
            if (reacted) break;

            // 2️⃣ otherwise move down like sand
            if (y === heightCells - 1) break;
            const fireBelow = idx + widthCells;
            if (grid[fireBelow] === 0) {
              const tmp = grid[idx];
              grid[idx] = grid[fireBelow];
              grid[fireBelow] = tmp;

              const lifeA = lifeGrid[idx];
              const lifeB = lifeGrid[fireBelow];
              lifeGrid[idx] = lifeB;
              lifeGrid[fireBelow] = lifeA;
            } else {
              const side = [];
              if (x > 0 && grid[idx - 1] === 0) side.push(idx - 1);
              if (x < widthCells - 1 && grid[idx + 1] === 0) side.push(idx + 1);
              if (side.length) {
                const target = side[Math.random() < 0.5 ? 0 : 1];
                const tmp = grid[idx];
                grid[idx] = grid[target];
                grid[target] = tmp;

                const lifeA = lifeGrid[idx];
                const lifeB = lifeGrid[target];
                lifeGrid[idx] = lifeB;
                lifeGrid[target] = lifeA;
              } else {
                const diag = [];
                if (x > 0 && grid[fireBelow - 1] === 0) diag.push(fireBelow - 1);
                if (x < widthCells - 1 && grid[fireBelow + 1] === 0) diag.push(fireBelow + 1);
                if (diag.length) {
                  const target = diag[Math.random() < 0.5 ? 0 : 1];
                  const tmp = grid[idx];
                  grid[idx] = grid[target];
                  grid[target] = tmp;

                  const lifeA = lifeGrid[idx];
                  const lifeB = lifeGrid[target];
                  lifeGrid[idx] = lifeB;
                  lifeGrid[target] = lifeA;
                }
              }
            }
            break;
          }

          // ---------------------------------------------------------
          // Steam (5) – rises, fades after a lifetime
          // ---------------------------------------------------------
          case 5: {
            if (--lifeGrid[idx] <= 0) {
              grid[idx] = 0;
              break;
            }
            if (y === 0) break;
            const above = idx - widthCells;
            if (grid[above] === 0) {
              const tmp = grid[idx];
              grid[idx] = grid[above];
              grid[above] = tmp;

              const lifeA = lifeGrid[idx];
              const lifeB = lifeGrid[above];
              lifeGrid[idx] = lifeB;
              lifeGrid[above] = lifeA;
            } else {
              const side = [];
              if (x > 0 && grid[idx - 1] === 0) side.push(idx - 1);
              if (x < widthCells - 1 && grid[idx + 1] === 0) side.push(idx + 1);
              if (side.length) {
                const target = side[Math.random() < 0.5 ? 0 : 1];
                const tmp = grid[idx];
                grid[idx] = grid[target];
                grid[target] = tmp;

                const lifeA = lifeGrid[idx];
                const lifeB = lifeGrid[target];
                lifeGrid[idx] = lifeB;
                lifeGrid[target] = lifeA;
              } else {
                const diag = [];
                if (x > 0 && grid[above - 1] === 0) diag.push(above - 1);
                if (x < widthCells - 1 && grid[above + 1] === 0) diag.push(above + 1);
                if (diag.length) {
                  const target = diag[Math.random() < 0.5 ? 0 : 1];
                  const tmp = grid[idx];
                  grid[idx] = grid[target];
                  grid[target] = tmp;

                  const lifeA = lifeGrid[idx];
                  const lifeB = lifeGrid[target];
                  lifeGrid[idx] = lifeB;
                  lifeGrid[target] = lifeA;
                }
              }
            }
            break;
          }

          // ---------------------------------------------------------
          // 0 (empty) – nothing to do
          // ---------------------------------------------------------
          default:
            break;
        } // end switch
      } // end x loop
    } // end y loop
  }

  // -----------------------------------------------------------------
  // 3️⃣  Rendering – builds ImageData and draws it
  // -----------------------------------------------------------------
  function renderFrame() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let y = 0; y < heightCells; y++) {
      for (let x = 0; x < widthCells; x++) {
        const idx = y * widthCells + x;
        const type = grid[idx];
        const [r, g, b, a] = PALETTE[type];

        // top‑left pixel of this cell inside the canvas buffer
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

  // -----------------------------------------------------------------
  // 4️⃣  FPS counter – updates once per second
  // -----------------------------------------------------------------
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

  // -----------------------------------------------------------------
  // MAIN LOOP – orchestrates the helpers
  // -----------------------------------------------------------------
  function tick() {
    if (!paused) {
      handleMousePainting();   // 1️⃣ paint with the mouse
      updateParticles();       // 2️⃣ run physics
      renderFrame();           // 3️⃣ draw
      updateFps();             // 4️⃣ FPS display
    }
    requestAnimationFrame(tick);
  }

  // === EVENT SETUP =================================================
  function init() {
    // ----- canvas & grid -----
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    widthCells = Math.floor(canvas.width / CELL_SIZE);
    heightCells = Math.floor(canvas.height / CELL_SIZE);

    grid = new Uint8Array(widthCells * heightCells);
    lifeGrid = new Uint16Array(widthCells * heightCells);

    // ----- toolbar buttons -----
    const tools = document.querySelectorAll('.tool');
    tools.forEach(btn => {
      btn.addEventListener('click', function () {
        activeTool = parseInt(this.dataset.id);
        tools.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
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
          activeTool = 1;
          break;
        case 'w':
          activeTool = 2;
          break;
        case 'r':
          activeTool = 3;
          break;
        case 'f':
          activeTool = 4;
          break;
        case 'e':
          activeTool = 0;
          break;
        case ' ': // space → pause
          paused = !paused;
          pauseBtn.classList.toggle('paused');
          pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
          e.preventDefault();
          break;
        case 'c': // clear
          clearGrid();
          renderFrame();
          e.preventDefault();
          break;
        default:
          return; // ignore other keys
      }

      // sync UI with the new tool
      tools.forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.id) === activeTool) {
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        }
      });

      canvas.focus(); // keep canvas focus for dragging
    });

    // ----- start loop -----
    requestAnimationFrame(tick);
  }

  // Run when the DOM is ready
  document.addEventListener('DOMContentLoaded', init);
})();