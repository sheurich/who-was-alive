import { random, type Game } from "./game-catalog";

/** Small, original procedural illustrations; no remote images or repeated animation. */
export function paintCover(canvas: HTMLCanvasElement, game: Game): void {
  canvas.width = 600;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rng = random(game.seed);
  const w = game.weirdness;
  const hue = game.hue;
  const color = (offset: number, light: number) =>
    "hsl(" + ((hue + offset) % 360) + " 70% " + light + "%)";
  const circle = (x: number, y: number, r: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const star = (x: number, y: number, radius: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 ? radius * 0.45 : radius;
      const px = x + Math.cos(a) * r,
        py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };
  const gradient = ctx.createLinearGradient(0, 0, 600, 400);
  gradient.addColorStop(0, color(0, game.kind === "dodge" ? 20 : 72));
  gradient.addColorStop(1, color(55, game.kind === "dodge" ? 38 : 90));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 600, 400);
  ctx.save();
  ctx.translate(300, 200);
  ctx.transform(1, w * (rng() - 0.5), w * (rng() - 0.5), 1, 0, 0);
  ctx.rotate((rng() - 0.5) * w * 1.2);
  ctx.translate(-300, -200);
  if (game.kind === "dodge") {
    for (let i = 0; i < 65; i++)
      circle(rng() * 600, rng() * 400, 1 + rng() * 2, "#fffce7");
    circle(490, 110, 88, color(60, 72));
    ctx.strokeStyle = color(110, 88);
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.ellipse(490, 110, 132, 27, -0.4, 0, 7);
    ctx.stroke();
    ctx.save();
    ctx.translate(260, 230);
    ctx.rotate(0.5 + rng() * 0.4);
    ctx.fillStyle = "#ffc971";
    ctx.beginPath();
    ctx.moveTo(-23, 65);
    ctx.lineTo(0, 145);
    ctx.lineTo(23, 65);
    ctx.fill();
    ctx.fillStyle = "#f17882";
    ctx.beginPath();
    ctx.moveTo(-25, 5);
    ctx.lineTo(-70, 85);
    ctx.lineTo(0, 62);
    ctx.lineTo(70, 85);
    ctx.lineTo(25, 5);
    ctx.fill();
    ctx.fillStyle = "#fffdf5";
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 85, 0, 0, 7);
    ctx.fill();
    circle(0, -12, 19, color(0, 24));
    circle(-5, -17, 5, "#b2ffea");
    ctx.restore();
    for (let i = 0; i < 4; i++) {
      const x = 45 + rng() * 500,
        y = rng() * 350;
      circle(x, y, 18 + rng() * 15, color(190, 68));
      circle(x - 5, y - 4, 6, color(190, 51));
    }
  } else if (game.kind === "hunt") {
    ctx.fillStyle = color(90, 64);
    ctx.fillRect(0, 210, 600, 190);
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = color(100, 83);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(rng() * 600, 240 + rng() * 160, 50, 6, 0, 0, 7);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffdfa1";
    ctx.beginPath();
    ctx.ellipse(300, 288, 210, 70, 0, 0, 7);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const x = 140 + i * 150;
      ctx.strokeStyle = "#85504b";
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(x, 276);
      ctx.quadraticCurveTo(x + 18, 205, x, 157);
      ctx.stroke();
      for (let j = 0; j < 5; j++) {
        ctx.save();
        ctx.translate(x, 158);
        ctx.rotate(j * 1.1);
        ctx.fillStyle = color(30, 33);
        ctx.beginPath();
        ctx.ellipse(26, 0, 56, 14, 0, 0, 7);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = "#975735";
    ctx.fillRect(246, 225, 108, 75);
    ctx.fillStyle = "#ffc447";
    ctx.fillRect(246, 239, 108, 10);
    ctx.fillRect(291, 227, 17, 73);
    star(300, 196, 42, "#fff5ae");
    circle(75, 70, 34, "#fff8d1");
  } else {
    for (let i = 0; i < 7; i++)
      circle(rng() * 600, rng() * 400, 15 + rng() * 45, color(30, 82));
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(145 + (i % 3) * 150, 110 + Math.floor(i / 3) * 180);
      ctx.rotate((i % 2 ? -1 : 1) * 0.12);
      ctx.fillStyle = color(0, 38);
      ctx.fillRect(-59, -59, 126, 145);
      ctx.fillStyle = "#fffdf5";
      ctx.fillRect(-65, -68, 126, 145);
      const fill = color(i * 45, 60);
      if (i % 3 === 0) star(0, -4, 40, fill);
      else {
        circle(0, -5, 42, fill);
        circle(-13, -12, 6, "#32214e");
        circle(13, -12, 6, "#32214e");
        ctx.strokeStyle = "#32214e";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 3, 14, 0, Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();
  // Repeated strips, impossible geometry and pixel blocks increase with depth.
  for (let i = 0; i < Math.floor(w * 30); i++) {
    const y = Math.floor(rng() * 380),
      h = 3 + Math.floor(rng() * 22);
    ctx.drawImage(canvas, 0, y, 600, h, (rng() - 0.5) * w * 160, y, 600, h);
  }
  for (let i = 0; i < Math.floor(w * w * 65); i++) {
    ctx.globalAlpha = 0.3 + rng() * 0.55;
    ctx.fillStyle = color(rng() * 360, 45 + rng() * 45);
    ctx.fillRect(
      rng() * 600,
      rng() * 400,
      4 + rng() * 75 * w,
      4 + rng() * 50 * w,
    );
  }
  ctx.globalAlpha = 1;
  if (w > 0.45) {
    for (let i = 0; i < Math.floor(w * 6); i++) {
      const x = rng() * 600,
        y = rng() * 400;
      circle(x, y, 17 + w * 14, "#fffbe6");
      circle(x + 3, y, 7, "#32214e");
    }
  }
}
