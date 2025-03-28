// --- Game Configuration ---
const GROUND_LEVEL_PERCENT = 0.85; // How far down the screen the ground is
const LAUNCHER_X_PERCENT = 0.1; // Horizontal position of the launcher
const LAUNCHER_Y_PERCENT = 0.8; // Vertical position of the launcher base

const MIN_ANGLE = -85; // Min launch angle (degrees upwards)
const MAX_ANGLE = -5; // Max launch angle (degrees upwards)
const MIN_POWER = 10;
const MAX_POWER = 50; // Max initial velocity magnitude
const POWER_SCALE = 0.15; // How much mouse drag affects power

const GRAVITY = 0.35;
const AIR_RESISTANCE = 0.995; // Factor to multiply velocity by each frame
const GROUND_FRICTION = 0.9; // Factor to multiply horizontal velocity on ground bounce
const BOUNCE_FACTOR = 0.6; // Factor to multiply vertical velocity on ground bounce

const OBSTACLE_DENSITY = 0.0025; // Chance per pixel traveled to spawn an obstacle
const OBSTACLE_MIN_DIST = 200; // Min distance between obstacles
const OBSTACLE_WIDTH = 50;
const OBSTACLE_HEIGHT_MIN = 30;
const OBSTACLE_HEIGHT_MAX = 100;
const BOOST_POWER_Y = 25; // Upward velocity impulse from boost
const BOOST_POWER_X = 10; // Forward velocity impulse from boost

const CLOUD_COUNT = 15;
const STAR_COUNT = 50;

// --- Game State Variables ---
let gameState = "instructions"; // instructions, aiming, flying, gameOver
let cat;
let obstacles;
let cameraX;
let score;
let highScore = 0;
let lastObstacleX;

// --- Aiming Variables ---
let isAiming = false;
let aimStartX, aimStartY;
let currentAngle = -45;
let currentPower = MIN_POWER;

// --- Graphics Variables ---
let groundLevel;
let launcherX, launcherY;
let clouds = [];
let stars = [];

// --- p5.js Functions ---

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1); // Ensure sharper pixels if using high-density displays
  noSmooth(); // PIXELATED LOOK!
  rectMode(CENTER);
  textAlign(CENTER, CENTER);
  angleMode(DEGREES); // Use degrees for easier angle handling

  // Calculate dynamic positions
  groundLevel = height * GROUND_LEVEL_PERCENT;
  launcherX = width * LAUNCHER_X_PERCENT;
  launcherY = groundLevel; // Cat starts on the ground at the launcher

  // Generate static background elements
  for (let i = 0; i < CLOUD_COUNT; i++) {
    clouds.push({
      x: random(-width * 2, width * 2),
      y: random(height * 0.1, height * 0.5),
      w: random(50, 150),
      h: random(20, 40),
      speed: random(0.1, 0.5), // Different parallax speeds
    });
  }
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: random(-width * 2, width * 2),
      y: random(0, groundLevel - 100), // Only in the sky
      size: random(1, 3),
    });
  }

  resetGame();
}

function draw() {
  // --- Background ---
  background(20, 30, 50); // Dark blue night sky

  // --- Stars (Parallax) ---
  push();
  translate(-cameraX * 0.1, 0); // Slow parallax for distant stars
  fill(255, 255, 200, 200);
  noStroke();
  for (const star of stars) {
    ellipse(star.x, star.y, star.size, star.size);
  }
  pop();

  // --- Clouds (Parallax) ---
  push();
  translate(-cameraX * 0.3, 0); // Slower parallax for clouds
  fill(220, 220, 240, 180);
  noStroke();
  for (const cloud of clouds) {
    // Simple blocky clouds
    rect(cloud.x, cloud.y, cloud.w, cloud.h);
    rect(
      cloud.x - cloud.w / 4,
      cloud.y + cloud.h / 3,
      cloud.w * 0.8,
      cloud.h * 0.8
    );
    rect(
      cloud.x + cloud.w / 4,
      cloud.y + cloud.h / 3,
      cloud.w * 0.8,
      cloud.h * 0.8
    );
  }
  pop();

  // --- Scrolling World Elements ---
  push();
  translate(-cameraX, 0); // Apply camera offset

  // --- Ground ---
  fill(80, 120, 50); // Greenish ground
  noStroke();
  rect(
    width / 2 + cameraX,
    groundLevel + (height - groundLevel) / 2,
    width + 4,
    height - groundLevel + 2
  ); // Draw ground relative to screen center for infinite feel

  // --- Launcher ---
  drawLauncher();

  // --- Obstacles ---
  drawObstacles();

  // --- Cat ---
  if (gameState !== "instructions") {
    drawCat();
  }

  pop(); // Restore transform matrix (removes camera offset)

  // --- UI Elements (drawn on top, not affected by camera) ---
  drawUI();

  // --- Game Logic Updates ---
  if (gameState === "aiming") {
    handleAiming();
  } else if (gameState === "flying") {
    updateFlying();
    generateObstacles();
    checkCollisions();
    // Update camera to follow cat, keeping it roughly on the left
    cameraX = cat.x - width * 0.2;
  } else if (gameState === "gameOver") {
    // Nothing actively happens, waiting for input
  } else if (gameState === "instructions") {
    // Waiting for input
  }
}

// --- Game State Functions ---

function resetGame() {
  cat = {
    x: launcherX,
    y: launcherY - 15, // Start slightly above ground
    vx: 0,
    vy: 0,
    size: 20,
    rotation: 0,
    onGround: true, // Start on the ground
  };
  obstacles = [];
  cameraX = 0;
  score = 0;
  lastObstacleX = width * 0.8; // Start spawning obstacles a bit ahead
  currentAngle = -45;
  currentPower = MIN_POWER;
  isAiming = false;
  // Don't reset highScore
  // gameState will be set by the caller (e.g., 'aiming' after click)
}

function startGame() {
  resetGame();
  gameState = "aiming";
}

function launchCat() {
  if (gameState === "aiming") {
    cat.vx = cos(currentAngle) * currentPower;
    cat.vy = sin(currentAngle) * currentPower;
    cat.onGround = false;
    gameState = "flying";
  }
}

function updateFlying() {
  // Apply gravity
  cat.vy += GRAVITY;

  // Apply air resistance
  cat.vx *= AIR_RESISTANCE;
  cat.vy *= AIR_RESISTANCE;

  // Update position
  cat.x += cat.vx;
  cat.y += cat.vy;

  // Update rotation based on velocity direction (only if moving significantly)
  if (abs(cat.vx) > 0.1 || abs(cat.vy) > 0.1) {
    cat.rotation = atan2(cat.vy, cat.vx);
  }

  // Check ground collision
  if (cat.y + cat.size / 2 >= groundLevel) {
    cat.y = groundLevel - cat.size / 2;

    // Bounce effect
    cat.vy *= -BOUNCE_FACTOR;
    // Apply friction only if bouncing vertically significantly
    if (abs(cat.vy) > 1) {
      // Check if there's a noticeable bounce
      cat.vx *= GROUND_FRICTION;
    } else {
      // If bounce is tiny, treat it as landing/sliding
      cat.vy = 0;
      cat.vx *= GROUND_FRICTION * 0.9; // Extra friction when sliding
      cat.onGround = true;
    }

    // Stop condition: check if velocity is very low after bounce/slide
    if (abs(cat.vx) < 0.1 && abs(cat.vy) < 0.1) {
      cat.vx = 0;
      cat.vy = 0;
      cat.onGround = true;
      gameOver();
    }
  } else {
    cat.onGround = false;
  }

  // Update score (based on horizontal distance traveled)
  score = floor(max(0, cat.x - launcherX));
}

function gameOver() {
  gameState = "gameOver";
  if (score > highScore) {
    highScore = score;
  }
}

// --- Drawing Functions ---

function drawLauncher() {
  push();
  translate(launcherX, launcherY); // Move origin to launcher base
  stroke(100);
  strokeWeight(4);

  // Barrel
  push();
  rotate(currentAngle);
  fill(80);
  rect(30, 0, 60, 15); // Barrel shape
  pop();

  // Base
  fill(120);
  rect(0, 5, 30, 20); // Simple base

  // Power Indicator (only during aiming)
  if (gameState === "aiming") {
    noStroke();
    fill(255, 0, 0, 150);
    let powerWidth = map(currentPower, MIN_POWER, MAX_POWER, 5, 50);
    rect(powerWidth / 2, 25, powerWidth, 10); // Bar below launcher
  }

  pop();
}

function drawCat() {
  push();
  translate(cat.x, cat.y);
  rotate(cat.rotation); // Rotate the cat based on its flight angle
  fill(200, 100, 50); // Orange cat color
  noStroke();

  // Simple pixelated cat body (adjust shape as desired)
  let s = cat.size;
  rect(0, 0, s, s * 0.8); // Body
  rect(s * 0.4, -s * 0.4, s * 0.3, s * 0.3); // Head-ish part
  // Ears
  triangle(-s * 0.4, -s * 0.5, -s * 0.2, -s * 0.7, 0, -s * 0.5);
  triangle(s * 0.4, -s * 0.5, s * 0.2, -s * 0.7, 0, -s * 0.5);
  // Tail (only when not on ground)
  if (!cat.onGround) {
    fill(180, 90, 40);
    rect(-s * 0.7, s * 0.1, s * 0.6, s * 0.2);
  }

  pop();
}

function drawObstacles() {
  let catLeft = cat.x - cat.size / 2;
  let catRight = cat.x + cat.size / 2;
  let catTop = cat.y - cat.size / 2;
  let catBottom = cat.y + cat.size / 2;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    let obs = obstacles[i];

    // Basic culling: Only draw if potentially on screen
    if (
      obs.x + obs.w / 2 > cameraX - 50 &&
      obs.x - obs.w / 2 < cameraX + width + 50
    ) {
      push();
      translate(obs.x, obs.y);
      stroke(0);
      strokeWeight(2);

      if (obs.type === "boost") {
        fill(0, 200, 255); // Cyan for boost (trampoline-like)
        // Simple trampoline shape
        rect(0, 0, obs.w, obs.h * 0.2); // Top surface
        rect(-obs.w * 0.4, obs.h * 0.4, obs.w * 0.1, obs.h * 0.6); // Leg 1
        rect(obs.w * 0.4, obs.h * 0.4, obs.w * 0.1, obs.h * 0.6); // Leg 2
      } else if (obs.type === "stop") {
        fill(150, 75, 0); // Brown for stop (wall/mud)
        // Simple wall/block shape
        rect(0, 0, obs.w, obs.h);
        // Add some texture lines
        stroke(100, 50, 0);
        line(-obs.w / 2, -obs.h / 4, obs.w / 2, -obs.h / 4);
        line(-obs.w / 2, obs.h / 4, obs.w / 2, obs.h / 4);
        line(-obs.w / 4, -obs.h / 2, -obs.w / 4, obs.h / 2);
        line(obs.w / 4, -obs.h / 2, obs.w / 4, obs.h / 2);
      } else {
        // Default obstacle (maybe add more types later)
        fill(100);
        rect(0, 0, obs.w, obs.h);
      }
      pop();
    }

    // --- Remove obstacles far behind the camera ---
    if (obs.x < cameraX - width * 0.5) {
      // Remove if half a screen behind left edge
      obstacles.splice(i, 1);
    }
  }
}

function drawUI() {
  fill(255);
  textSize(20);
  textAlign(LEFT, TOP);
  text(`Score: ${score}`, 10, 10);
  textAlign(RIGHT, TOP);
  text(`High Score: ${highScore}`, width - 10, 10);

  // --- State-Specific Instructions ---
  textAlign(CENTER, CENTER);
  textSize(24);

  if (gameState === "instructions") {
    fill(255, 255, 255, 200);
    rect(width / 2, height / 2, width * 0.7, height * 0.6, 10);
    fill(0);
    textSize(32);
    text("Pixel Cat Launcher!", width / 2, height * 0.3);
    textSize(20);
    text("Instructions:", width / 2, height * 0.4);
    text(
      "1. Click and HOLD the mouse near the launcher.",
      width / 2,
      height * 0.48
    );
    text(
      "2. Drag AWAY from the launcher to set Angle and Power.",
      width / 2,
      height * 0.53
    );
    text("3. Release the mouse to LAUNCH!", width / 2, height * 0.58);
    text("Cyan Trampolines give you a BOOST!", width / 2, height * 0.65);
    text("Brown Walls will STOP you!", width / 2, height * 0.7);
    textSize(28);
    fill(0, 150, 0);
    text("Click anywhere to Start!", width / 2, height * 0.78);
  } else if (gameState === "aiming") {
    textSize(18);
    fill(255);
    text(
      "Click and Drag mouse to Aim & Power Up. Release to Launch!",
      width / 2,
      30
    );
  } else if (gameState === "gameOver") {
    fill(255, 255, 255, 200); // Semi-transparent white background
    rect(width / 2, height / 2, 400, 250, 10); // Rounded rectangle

    fill(0);
    textSize(40);
    text("Game Over!", width / 2, height / 2 - 60);
    textSize(24);
    text(`Final Score: ${score}`, width / 2, height / 2);
    text(`High Score: ${highScore}`, width / 2, height / 2 + 40);
    textSize(20);
    fill(0, 150, 0);
    text("Click to Play Again", width / 2, height / 2 + 90);
  }
}

// --- Obstacle Generation & Collision ---

function generateObstacles() {
  // Generate new obstacles based on distance traveled by camera
  while (lastObstacleX < cameraX + width + OBSTACLE_MIN_DIST) {
    // Check density - only spawn sometimes
    if (random() < OBSTACLE_DENSITY * OBSTACLE_MIN_DIST) {
      // Scale chance by min dist
      let obsX =
        lastObstacleX + random(OBSTACLE_MIN_DIST, OBSTACLE_MIN_DIST * 2.5);
      let obsH = random(OBSTACLE_HEIGHT_MIN, OBSTACLE_HEIGHT_MAX);
      let obsY = groundLevel - obsH / 2 - random(0, height * 0.3); // Place randomly above ground
      let obsType = random() < 0.4 ? "boost" : "stop"; // 40% chance of boost

      // Avoid placing obstacles too high or overlapping launcher area significantly
      if (obsX < launcherX + 100 && obsY < launcherY - 50) {
        // Skip if it's too close to the start and high up
      } else {
        obstacles.push({
          x: obsX,
          y: obsY,
          w: OBSTACLE_WIDTH,
          h: obsH,
          type: obsType,
        });
        lastObstacleX = obsX; // Update position of the last generated obstacle
      }
    } else {
      // If we didn't spawn, still advance the check position
      lastObstacleX += OBSTACLE_MIN_DIST;
    }
  }
}

function checkCollisions() {
  // Simple AABB collision detection (Axis-Aligned Bounding Box)
  let catLeft = cat.x - cat.size / 2;
  let catRight = cat.x + cat.size / 2;
  let catTop = cat.y - cat.size / 2;
  let catBottom = cat.y + cat.size / 2;

  for (let obs of obstacles) {
    let obsLeft = obs.x - obs.w / 2;
    let obsRight = obs.x + obs.w / 2;
    let obsTop = obs.y - obs.h / 2;
    let obsBottom = obs.y + obs.h / 2;

    // Check for overlap
    if (
      catRight > obsLeft &&
      catLeft < obsRight &&
      catBottom > obsTop &&
      catTop < obsBottom
    ) {
      // Collision detected!
      handleObstacleCollision(obs);
      // Optional: remove obstacle after collision? For now, no.
      break; // Handle only one collision per frame for simplicity
    }
  }
}

function handleObstacleCollision(obs) {
  if (obs.type === "boost") {
    cat.vy = -BOOST_POWER_Y; // Strong upward boost
    cat.vx += BOOST_POWER_X; // Slight forward boost
    // Optional: Add a small visual indicator later (e.g., particles)
  } else if (obs.type === "stop") {
    cat.vx = 0; // Stop horizontal movement
    cat.vy = 0; // Stop vertical movement (stick to it)
    // Position the cat exactly on the edge it hit - simplified: just stop velocity
    // cat.x = obs.x - obs.w/2 - cat.size/2; // Example if hitting from left
    gameOver(); // End the game immediately
  }
}

// --- Input Handling ---

function handleAiming() {
  if (isAiming) {
    // --- Angle Calculation (Relative to Launcher) ---
    // Use the fixed launcher position as the reference for angle
    let angleDx = mouseX - launcherX;
    // Use the visual barrel pivot point slightly above the base
    let angleDy = mouseY - (launcherY - 10);

    // Calculate the angle directly pointing from launcher towards mouse
    let rawAngle = atan2(angleDy, angleDx);

    // Constrain the angle to the allowed launch range
    currentAngle = constrain(rawAngle, MIN_ANGLE, MAX_ANGLE);

    // --- Power Calculation (Relative to Drag Start) ---
    let powerDx = mouseX - aimStartX;
    let powerDy = mouseY - aimStartY;
    let dist = sqrt(powerDx * powerDx + powerDy * powerDy);

    // Map the drag distance to power, clamping the value
    currentPower = map(dist, 0, width / 3, MIN_POWER, MAX_POWER, true);
  } else {
    // Optional: You could have the launcher idle animation here if desired
    // e.g., currentAngle = map(sin(frameCount * 1.5), -1, 1, -40, -50);
  }
}

function mousePressed() {
  if (gameState === "instructions") {
    startGame(); // Start the game on first click
  } else if (gameState === "aiming") {
    isAiming = true;
    aimStartX = mouseX;
    aimStartY = mouseY;
  } else if (gameState === "gameOver") {
    resetGame();
    gameState = "aiming"; // Go directly to aiming state
  }
}

function mouseDragged() {
  // The aiming logic is handled in handleAiming() based on the isAiming flag
  return false; // Prevent default browser drag behavior
}

function mouseReleased() {
  if (isAiming && gameState === "aiming") {
    isAiming = false;
    launchCat();
  }
}

// --- Window Resize ---
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // Recalculate positions based on new size
  groundLevel = height * GROUND_LEVEL_PERCENT;
  launcherX = width * LAUNCHER_X_PERCENT;
  launcherY = groundLevel;
  // Could regenerate clouds/stars or adjust their positions if needed
  // For simplicity, current setup might look stretched/squashed on resize,
  // but gameplay elements are repositioned correctly.
}
