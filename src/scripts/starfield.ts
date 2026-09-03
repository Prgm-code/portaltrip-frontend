// Campo de estrellas en canvas con efecto "warp" mientras se cruza un portal.
interface Star {
  x: number;
  y: number;
  z: number;
  tint: 'white' | 'green' | 'cyan';
}

const STAR_COUNT = 260;
const CRUISE_SPEED = 0.0009;
const WARP_SPEED = 0.085;

function spawnStar(depth: number): Star {
  const roll = Math.random();
  return {
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: depth,
    tint: roll < 0.14 ? 'green' : roll < 0.3 ? 'cyan' : 'white',
  };
}

function starColor(star: Star, alpha: number): string {
  if (star.tint === 'green') return `rgba(169, 245, 44, ${alpha})`;
  if (star.tint === 'cyan') return `rgba(121, 216, 230, ${alpha})`;
  return `rgba(235, 244, 236, ${alpha})`;
}

function startStarfield(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stars = Array.from({ length: STAR_COUNT }, () => spawnStar(Math.random()));
  let width = 0;
  let height = 0;
  let warp = 0;
  let warpTarget = 0;
  let frame = 0;

  function resize(): void {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function paint(): void {
    if (!context) return;
    warp += (warpTarget - warp) * (warpTarget > warp ? 0.14 : 0.06);
    const speed = CRUISE_SPEED + warp * WARP_SPEED;
    const centerX = width / 2;
    const centerY = height / 2;
    const focal = Math.min(width, height) * 0.9;
    context.clearRect(0, 0, width, height);

    for (const star of stars) {
      const previousDepth = star.z;
      star.z -= speed;
      if (star.z <= 0.02) {
        Object.assign(star, spawnStar(1));
        continue;
      }
      const x = centerX + (star.x / star.z) * focal;
      const y = centerY + (star.y / star.z) * focal;
      if (x < -60 || x > width + 60 || y < -60 || y > height + 60) {
        Object.assign(star, spawnStar(1));
        continue;
      }
      const depth = 1 - star.z;
      const size = 0.4 + depth * 1.7 + warp * 0.6;
      const color = starColor(star, Math.min(1, 0.22 + depth * 0.7 + warp * 0.25));

      if (warp > 0.05) {
        context.strokeStyle = color;
        context.lineWidth = size;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(
          centerX + (star.x / previousDepth) * focal,
          centerY + (star.y / previousDepth) * focal,
        );
        context.lineTo(x, y);
        context.stroke();
      } else {
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function loop(): void {
    paint();
    if (!reduceMotion.matches && !document.hidden) frame = requestAnimationFrame(loop);
  }

  function restart(): void {
    cancelAnimationFrame(frame);
    loop();
  }

  resize();
  loop();
  window.addEventListener('resize', () => {
    resize();
    if (reduceMotion.matches) paint();
  });
  reduceMotion.addEventListener('change', restart);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) restart();
  });
  // Un salto interdimensional acelera las estrellas mientras las tarjetas se desvanecen
  // y hasta que la nueva página terminó de abrirse desde el portal.
  document.addEventListener('astro:before-preparation', () => {
    warpTarget = 1;
  });
  document.addEventListener('astro:page-load', () => {
    window.setTimeout(() => {
      warpTarget = 0;
    }, 350);
  });
}

const canvas = document.getElementById('starfield');
if (canvas instanceof HTMLCanvasElement) startStarfield(canvas);
