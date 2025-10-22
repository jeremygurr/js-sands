/* -----------------------------------------------------------
   Falling‑Sands Playground – main JavaScript (refactored)
   ----------------------------------------------------------- */
(function () {
  // -----------------------------------------------------------
  // CONFIGURATION & GLOBALS
  // -----------------------------------------------------------
  const CELL_SIZE = 8;

  const ACTION_SET = 1;
  const ACTION_SWAP = 2; 

  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  const toolbar = document.getElementById('toolbar');
  const pauseBtn = document.getElementById('pauseBtn');
  const clearBtn = document.getElementById('clearBtn');
  const fpsDisplay = document.getElementById('fps');

  let widthCells = 0;
  let heightCells = 0;
  let grid = null;   // Uint8Array – material IDs
  let mouseDown = false;
  let mousePos = { x: 0, y: 0 };
  let paused = false;
  let frameCount = 0;
  let lastFpsUpdate = 0;
  let fps = 0;
  let paintDelay = 0;
  let paintOn = false;
  let brushSize = 1;

  // max 63 because we use 64 bit bitfields
  const EDGE_VAL      = 0; // not a particle, represents outside of the window
  const EMPTY_VAL     = 1;
  const SAND_VAL      = 2;
  const WATER_VAL     = 3;
  const STONE_VAL     = 4;
  const LAVA_VAL      = 5;
  const CLOUD1_VAL    = 6;
  const CLOUD2_VAL    = 7;
  const CLOUD3_VAL    = 8;
  const WOOD_VAL      = 9;
  const HOTWOOD1_VAL  = 10;
  const HOTWOOD2_VAL  = 11;
  const EMBER_VAL     = 12;
  const CHAR_VAL      = 13;
  const ASH_VAL       = 14;
  const FIRE_VAL      = 15;
  const FIRE2_VAL     = 16;
  const FIRE3_VAL     = 17;

  const EDGE      = 1n << BigInt(EDGE_VAL);
  const EMPTY     = 1n << BigInt(EMPTY_VAL);
  const SAND      = 1n << BigInt(SAND_VAL);
  const WATER     = 1n << BigInt(WATER_VAL);
  const STONE     = 1n << BigInt(STONE_VAL);
  const LAVA      = 1n << BigInt(LAVA_VAL);
  const CLOUD1    = 1n << BigInt(CLOUD1_VAL);
  const CLOUD2    = 1n << BigInt(CLOUD2_VAL);
  const CLOUD3    = 1n << BigInt(CLOUD3_VAL);
  const WOOD      = 1n << BigInt(WOOD_VAL);
  const HOTWOOD1  = 1n << BigInt(HOTWOOD1_VAL);
  const HOTWOOD2  = 1n << BigInt(HOTWOOD2_VAL);
  const EMBER     = 1n << BigInt(EMBER_VAL);
  const CHAR      = 1n << BigInt(CHAR_VAL);
  const ASH       = 1n << BigInt(ASH_VAL);
  const FIRE      = 1n << BigInt(FIRE_VAL);
  const FIRE2     = 1n << BigInt(FIRE2_VAL);
  const FIRE3     = 1n << BigInt(FIRE3_VAL);
  const ANY       = -1n;
  const SKIP      = -1n; // used in a different context than ANY, so it takes on a different meaning

  const PALETTE = [
    [  0,   0,   0, 255], // EDGE (placeholder)
    [  0,   0,   0, 255], // EMPTY
    [194, 178, 128, 255], // SAND
    [ 74, 144, 226, 255], // WATER
    [ 85,  85,  85, 255], // STONE
    [255,  69,   0, 255], // LAVA
    [204, 204, 255, 255], // CLOUD1
    [170, 170, 230, 255], // CLOUD2
    [140, 140, 200, 255], // CLOUD3
    [124,  68,  58, 255], // WOOD
    [124,  68,  58, 255], // HOTWOOD1
    [124,  68,  58, 255], // HOTWOOD2
    [224, 120,   0, 255], // EMBER
    [ 60,  30,  30, 255], // CHAR
    [140, 140, 140, 255], // ASH
    [164, 120,   0, 255], // FIRE
    [160,  68,   0, 255], // FIRE2
    [160,  20,   0, 255], // FIRE3
  ];

//  define transformers
// from, to
// from matrix:
//   bitfield referring to all matching particle types
//   must also be able to refer to screen edge: -1
// to matrix:
//   either a reference to a particle from the previous matrix
//   or an absolue particle type
//   [transform_type, parameter]
//
// how to randomize left/right?
//   list of transforms has groups, list is executed in order, but groups choose one randomly
// must support chance of transform: check random first, then see if transform fits
// support sizes: 1x1, 3x3, 5x5
//
// avoid duplication of particles, or multi-stage transforms in a single tick:
//   if a transform is applied, skip all pixels it could have affected: next_x next_y

  const transformers = [];
  const CHANGE_TYPE_SWAP = 0;
  const CHANGE_TYPE_SET  = 1;

  function addTransformerGroup(array) {
    transformers.push(array);
  }

  function addSandTransformers() {
    addTransformerGroup([
      [       // matcher of group
        "sand down",
        1,    // probability
        [     // matcher matrix
           ANY,           ANY,  ANY, 
           ANY,          SAND,  ANY,  
           ANY, EMPTY | WATER,  ANY,
        ],
        CHANGE_TYPE_SWAP,
        [     // change matrix
          SKIP,  SKIP, SKIP,
          SKIP,     7, SKIP,
          SKIP,     4, SKIP,
        ],
      ],
    ]);
    addTransformerGroup([
      [       // matcher of group
        "sand diag",
        1,    // probability
        [     // matcher matrix
                    ANY,   ANY,  ANY, 
                    ANY,  SAND,  ANY,  
          EMPTY | WATER,   ANY,  ANY,
        ],
        CHANGE_TYPE_SWAP,
        [     // change matrix
          SKIP,  SKIP, SKIP,
          SKIP,     6, SKIP,
             4,  SKIP, SKIP,
        ],
      ],
      [       // matcher of group
        "sand diag",
        1,    // probability
        [     // matcher matrix
           ANY,   ANY,           ANY, 
           ANY,  SAND,           ANY,  
           ANY,   ANY, EMPTY | WATER,
        ],
        CHANGE_TYPE_SWAP,
        [     // change matrix
          SKIP,  SKIP, SKIP,
          SKIP,     8, SKIP,
          SKIP,  SKIP,    4,
        ],
      ],
    ]);
  }

  function addWaterTransformers() {
    addTransformerGroup([
      [       // matcher of group
        "water down",
        1,    // probability
        [     // matcher matrix
           ANY,   ANY,  ANY, 
           ANY, WATER,  ANY,  
           ANY, EMPTY,  ANY,
        ],
        CHANGE_TYPE_SET,
        [     // change matrix
          SKIP,  SKIP, SKIP,
          SKIP, EMPTY, SKIP,
          SKIP, WATER, SKIP,
        ],
      ],
    ]);
    addTransformerGroup([
      [       // matcher of group
        "water diag",
        1,    // probability
        [     // matcher matrix
           ANY,   ANY,  ANY, 
           ANY, WATER,  ANY,  
         EMPTY,   ANY,  ANY,
        ],
        CHANGE_TYPE_SET,
        [     // change matrix
          SKIP,  SKIP, SKIP,
          SKIP, EMPTY, SKIP,
         WATER,  SKIP, SKIP,
        ],
      ],
      [       // matcher of group
        "water diag",
        1,    // probability
        [     // matcher matrix
           ANY,   ANY,   ANY, 
           ANY, WATER,   ANY,  
           ANY,   ANY, EMPTY,
        ],
        CHANGE_TYPE_SET,
        [     // change matrix
          SKIP,  SKIP,  SKIP,
          SKIP, EMPTY,  SKIP,
          SKIP,  SKIP, WATER,
        ],
      ],
    ]);
    addTransformerGroup([
      [       // matcher of group
        "water side",
        1,    // probability
        [     // matcher matrix
           ANY,   ANY,  ANY, 
         EMPTY, WATER,  ANY,  
           ANY,   ANY,  ANY,
        ],
        CHANGE_TYPE_SET,
        [     // change matrix
          SKIP,  SKIP, SKIP,
         WATER, EMPTY, SKIP,
          SKIP,  SKIP, SKIP,
        ],
      ],
      [       // matcher of group
        "water side",
        1,    // probability
        [     // matcher matrix
           ANY,   ANY,   ANY, 
           ANY, WATER, EMPTY,  
           ANY,   ANY,   ANY,
        ],
        CHANGE_TYPE_SET,
        [     // change matrix
          SKIP,  SKIP,  SKIP,
          SKIP, EMPTY, WATER,
          SKIP,  SKIP,  SKIP,
        ],
      ],
    ]);
  }

  function setupTransformers() {
    addSandTransformers();
    addWaterTransformers();
  }

  let activeTool = SAND_VAL;   // default to sand

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

  // tests if i is between min (inclusive) and max (exclusive)
  function inBounds(i, min, max) {
    return i >= min && i < max;
  }

  function paintAt(px, py, typeId) {
    const { x, y } = getCellFromPixel(px, py);
    const idx = y * widthCells + x;
    if (idx < 0 || idx >= grid.length || paintDelay > 0) return;
    paintDelay = 3;
    let i=idx
    // if (i != 0 && i != 1) {
    //   console.log("paintAt: grid[" + i + "]=" + typeId);
    // }
    grid[i] = typeId;
    if (brushSize > 1) {
      i = idx - 2 - 2 * widthCells;
      if (inBounds(i, 0, grid.length)) grid[i] = typeId;
      i = idx + 2 + 2 * widthCells;
      if (inBounds(i, 0, grid.length)) grid[i] = typeId;
    }
    if (brushSize > 2) {
      i = idx - 2 + 2 * widthCells;
      if (inBounds(i, 0, grid.length)) grid[i] = typeId;
      i = idx + 2 - 2 * widthCells;
      if (inBounds(i, 0, grid.length)) grid[i] = typeId;
    }
  }

  function clearGrid() {
    grid.fill(EMPTY_VAL);
  }

  function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    widthCells = Math.floor(width / CELL_SIZE);
    heightCells = Math.floor(height / CELL_SIZE);

    const newGrid = new Uint8Array(widthCells * heightCells);

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
      }
    }

    grid = newGrid;
    paintDelay = 0;
    paintOn = false;
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
    if (paintOn) {
      paintAt(mousePos.x, mousePos.y, activeTool);
      if (activeTool == STONE_VAL) {
        paintOn = false;
      }
    }
  }

  // returns random integer over this interval: [0..max_value)
  function randInt(max_value) {
    return Math.floor(Math.random() * max_value);
  }

  function matcher_matches(matcher, x, y) {
    const width = Math.sqrt(matcher.length);

    if (width != 1 && width != 3 && width != 5) {
      console.error("Invalid matcher matrix width: " + width);
      return false;
    }

    const radius = Math.floor((width - 1) / 2);

    let result = true;

    for (let iy = 0; iy < width; iy++) {
    for (let ix = 0; ix < width; ix++) {

      const array_index = iy * width + ix;
      const mustMatch = matcher[array_index];

      if (mustMatch == ANY) {
        continue;
      }

      const mx = ix - radius;
      const my = iy - radius;
      const rx = mx + x;
      const ry = my + y;
      const ri = ry * widthCells + rx;

      let realParticle;
      let realField;
      if (inBounds(ri, 0, grid.length)) {
        realParticle = grid[ri];
        realField = 1n << BigInt(realParticle);
      } else {
        realField = EDGE;
      }

      if (!(realField & mustMatch)) {
        result = false;
        break;
      }

    }
    }

    return result;
  }
  
  function applySwapChanger(changer, x, y, changeGrid, width) {
    const radius = Math.floor((width - 1) / 2);
    let results = [];

    for (let iy = 0; iy < width; iy++) {
    for (let ix = 0; ix < width; ix++) {

      const array_index = iy * width + ix;
      const changeToIndex = changer[array_index];

      if (changeToIndex == SKIP) {
        continue;
      }

      const mx = ix - radius;
      const my = iy - radius;
      const rx = mx + x;
      const ry = my + y;
      const ri = ry * widthCells + rx;

      const changeToY = Math.trunc(changeToIndex / width);
      const changeToX = changeToIndex % width;
      const absY = (changeToY - radius) + y;
      const absX = (changeToX - radius) + x;
      const absI = absY * widthCells + absX;

      let sourceParticle;
      if (inBounds(absI, 0, grid.length)) {
        sourceParticle = grid[absI];
      } else {
        console.error("Changer is referencing an out of bounds location: " + changeToIndex);
      }

      let real;
      if (inBounds(ri, 0, grid.length)) {
        // console.log("Swapping type " + sourceParticle + " from " + absI + " to " + ri + "(" + grid[ri] + ")");
        results.push(ri);
        results.push(sourceParticle);
        changeGrid[ri] = 1;
      } else {
        console.error("Changer is trying to change an out of bounds location: " + ix + ", " + iy);
      }

    }
    }

    for (let i = 0; i < results.length; i += 2) {
      // console.log("applySwapChanger: grid[" + results[i] + "]=" + results[i+1]);
      grid[results[i]] = results[i+1];
    }
  }

  /**
   * Counts the leading zeros for a BigInt value interpreted as a 64-bit unsigned integer.
   * @param {bigint} n - The 64-bit BigInt value.
   * @returns {number} The count of leading zeros (0 to 64).
   */
  function clz64(n) {
    // 1. Check the high 32 bits (shift right by 32)
    const high32 = Number(n >> 32n);

    if (high32 !== 0) {
      // The first '1' is in the high 32 bits.
      // Math.clz32() counts leading zeros in the high 32 bits.
      return Math.clz32(high32);
    } else {
      // The high 32 bits are all zero.
      // We have 32 zeros from the high part, plus the leading zeros in the low part.
      const low32 = Number(n & 0xFFFFFFFFn);
      return 32 + Math.clz32(low32);
    }
  }

  function applySetChanger(changer, x, y, changeGrid, width) {
    const radius = Math.trunc((width - 1) / 2);

    for (let iy = 0; iy < width; iy++) {
    for (let ix = 0; ix < width; ix++) {

      const array_index = iy * width + ix;
      const changeToField = changer[array_index];

      if (changeToField == SKIP) {
        continue;
      }

      const changeToParticle = 63 - clz64(changeToField);
      // console.log("changeToField: " + changeToField + "  changeToParticle: " + changeToParticle);
      const mx = ix - radius;
      const my = iy - radius;
      const rx = mx + x;
      const ry = my + y;
      const ri = ry * widthCells + rx;

      let real;
      if (inBounds(ri, 0, grid.length)) {
        // console.log("applySetChanger: grid[" + ri + "]=" + changeToParticle);
        grid[ri] = changeToParticle;
        changeGrid[ri] = 1;
      } else {
        console.error("Changer is trying to change an out of bounds location: " + ix + ", " + iy);
      }

    }
    }
  }

  function updateParticlesInner(x, y, changeGrid) {
    for (let group of transformers) {
      let transformer = group[0];
      if (group.length > 1) {
        transformer = group[randInt(group.length)];
      }

      const [transform_name, probability, matcher, change_type, changer] = transformer;

      const width = Math.sqrt(matcher.length);

      if (width != 1 && width != 3 && width != 5) {
        console.error("Invalid matcher matrix width: " + width);
        return;
      }

      if (probability == 1 || Math.random() < probability) {
        if (matcher_matches(matcher, x, y)) {
          // console.log("Matched for " + transform_name);
          switch (change_type) {
            case CHANGE_TYPE_SET: {
              applySetChanger(changer, x, y, changeGrid, width);
              break;
            }
            case CHANGE_TYPE_SWAP: {
              applySwapChanger(changer, x, y, changeGrid, width);
              break;
            }
            default: {
              console.error("Invalid change type: " + change_type);
              break;
            }
          }
          break;
        }
      }
    }
  }

  // -----------------------------------------------------------
  // PARTICLE SIMULATION (big switch)
  // -----------------------------------------------------------
  function updateParticles() {
    let xs = Array.from({ length: widthCells }, (v, i) => i);
    xs.sort(() => Math.random() - 0.5);
    let ys = Array.from({ length: heightCells }, (v, i) => i);
    ys.sort(() => Math.random() - 0.5);

    let changeGrid = new Uint8Array(heightCells * widthCells);
    for (let y of ys) {
      for (let x of xs) {
        const index = y * widthCells + x;
        if (changeGrid[index] == 0 && grid[index] != EMPTY_VAL) {
          updateParticlesInner(x, y, changeGrid);
        }
      }
    }

    if (paintDelay > 0) paintDelay--;

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
        // if (type != 0 && type != 1) {
        //   console.log("PALETTE[" + type + "]");
        // }
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

  let targetFPS = 30;
  let lastFrameTime = 0;

  // -----------------------------------------------------------
  // MAIN LOOP
  // -----------------------------------------------------------
  function tick(timestamp) {
    let frameInterval = 1000 / targetFPS;
    const elapsed = timestamp - lastFrameTime;

    if (elapsed > frameInterval) {
      lastFrameTime = timestamp - (elapsed % frameInterval);

      if (!paused) {
        handleMousePainting();
        updateParticles();
        renderFrame();
        updateFps();
      }
    }
    
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

    grid = new Uint8Array(widthCells * heightCells).fill(EMPTY_VAL);

    // ----- toolbar buttons -----
    tools = document.querySelectorAll('.tool');

    // set default tool (sand) using the new helper
    setActiveTool(SAND_VAL);

    setupTransformers();
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
      if (activeTool == EMPTY_VAL) {
        paintAt(e.offsetX, e.offsetY, EMPTY_VAL);
        mouseDown = true;
      } else {
        if (paintOn) {
          paintOn = false;
        } else {
          mouseDown = true;
          paintOn = true;
          mousePos = { x: e.offsetX, y: e.offsetY };
        }
      }
    });

    canvas.addEventListener('mousemove', e => {
      if (mouseDown) {
        if (activeTool == EMPTY_VAL) {
          paintAt(e.offsetX, e.offsetY, EMPTY_VAL);
        } else {
          paintOn = true;
          mousePos = { x: e.offsetX, y: e.offsetY };
        }
      }
    });

    window.addEventListener('mouseup', () => (mouseDown = false));
    window.addEventListener('mouseleave', () => (mouseDown = false));

    // ----- resize -----
    window.addEventListener('resize', resizeCanvas);

    // ----- keyboard shortcuts -----
    window.addEventListener('keydown', e => {
      switch (e.key.toLowerCase()) {
        case 's':
          setActiveTool(SAND_VAL);
          break;
        case 'w':
          setActiveTool(WATER_VAL);
          break;
        case 'r':
          setActiveTool(STONE_VAL);
          break;
        case 'f':
          setActiveTool(FIRE_VAL);
          break;
        case 'c':
          setActiveTool(CLOUD1_VAL);
          break;
        case 't':
          setActiveTool(WOOD_VAL);
          break;
        case 'e':
          setActiveTool(EMPTY_VAL);
          break;
        case ' ':
          // space → pause
          paused = !paused;
          pauseBtn.classList.toggle('paused');
          pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
          e.preventDefault();
          break;
        case '!':
          // clear
          clearGrid();
          renderFrame();
          e.preventDefault();
          break;
        case '=':
          // increase brush size
          brushSize++;
          if (brushSize > 3) brushSize = 3;
          break;
        case '-':
          // decrease brush size
          brushSize--;
          if (brushSize < 1) brushSize = 1;
          break;
        case ',':
          // decrease fps
          targetFPS >>= 1;
          if (targetFPS > 120) targetFPS=120;
          break;
        case '.':
          // increase fps
          targetFPS <<= 1;
          if (targetFPS < 1) targetFPS=1;
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
