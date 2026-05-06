import type { Container, Graphics } from 'pixi.js';

export type GraphicsCtor = new (options?: { roundPixels?: boolean }) => Graphics;

export type MarioHillVariant = 'green' | 'teal' | 'brown';

/** Нижняя часть экрана — трава/земля (одно число для Pixi, levelGen и мобов). */
export const GROUND_STRIP_FRAC = 0.18;
/** На сколько пикселей стопа выше линии травы (прозрачный край спрайта). */
const FEET_LIFT_PX = 5;

const LINE = 0x101010;

/** Верх травы в Pixi Y (ту же величину передают в `createGroundStripGraphics` как `grassY`). */
export function grassStripTopPixiY(viewH: number): number {
   return Math.round(viewH * (1 - GROUND_STRIP_FRAC));
}

/** Стопа на земле: px от низа вьюпорта вверх. */
export function groundWalkSurfaceYFromBottomPx(viewH: number): number {
   return Math.round(viewH - grassStripTopPixiY(viewH) + FEET_LIFT_PX);
}

export function createGroundStripGraphics(
   Gfx: GraphicsCtor,
   ox: number,
   grassY: number,
   segW: number,
   canvasH: number,
   cell: number,
): Graphics {
   const g = new Gfx({ roundPixels: true });
   const soilTop = grassY + cell;
   const soilH = Math.max(cell * 3, canvasH - soilTop + 160);
   g.rect(ox, soilTop, segW, soilH).fill({ color: 0xc84c0c });
   const brickH = 14;
   const brickW = 36;
   for (let row = 0; row * brickH < soilH + 80; row++) {
      const yy = soilTop + row * brickH;
      const off = row % 2 ? brickW * 0.5 : 0;
      for (let col = -1; col * brickW < segW + brickW; col++) {
         const xx = ox + col * brickW + off;
         g.rect(xx + 2, yy + 2, brickW - 4, brickH - 4).fill({ color: 0xa83808 });
         g.rect(xx + 2, yy + 2, brickW - 4, 3).fill({ color: 0xe07828, alpha: 0.55 });
         g.rect(xx + 2, yy + brickH - 7, brickW - 4, 3).fill({ color: 0x682008, alpha: 0.45 });
      }
      g.moveTo(ox, yy)
         .lineTo(ox + segW, yy)
         .stroke({ width: 2, color: LINE });
   }

   const turfH = cell + 18;
   g.roundRect(ox - 2, grassY - 6, segW + 4, turfH + 8, 10)
      .fill({ color: 0x40c848 })
      .stroke({ width: 3, color: LINE });

   g.rect(ox + 4, grassY + 5, segW - 8, 5).fill({ color: 0x68f070, alpha: 0.85 });
   g.moveTo(ox, grassY + 3)
      .lineTo(ox + segW, grassY + 3)
      .stroke({ width: 2, color: LINE });

   const blades = Math.max(5, Math.floor(segW / 28));
   for (let i = 0; i < blades; i++) {
      const bx = ox + 14 + (i * segW) / blades + ((i * 13) % 19);
      g.roundRect(bx, grassY - 1, 6, 15, 2)
         .fill({ color: 0x30a838 })
         .stroke({ width: 2, color: LINE });
   }

   return g;
}

export function createPlatformGraphics(Gfx: GraphicsCtor, x: number, y: number, w: number, h: number): Graphics {
   const g = new Gfx({ roundPixels: true });
   const rad = Math.min(14, h * 0.38);
   const lipH = Math.min(16, Math.max(10, Math.round(h * 0.28)));

   g.roundRect(x + 4, y + 8, w - 4, h + 2, rad).fill({ color: 0x000000, alpha: 0.22 });
   g.roundRect(x, y, w, h, rad).fill({ color: 0x48d058 }).stroke({ width: 3, color: LINE });

   g.roundRect(x + 4, y + 2, w - 8, lipH, 8)
      .fill({ color: 0xb8f868 })
      .stroke({ width: 2, color: LINE });

   g.rect(x + 3, y + lipH + 1, 8, h - lipH - 4).fill({ color: 0x000000, alpha: 0.12 });
   g.rect(x + w - 11, y + lipH + 1, 8, h - lipH - 4).fill({ color: 0xffffff, alpha: 0.08 });

   return g;
}

export function createHillGraphics(
   Gfx: GraphicsCtor,
   x: number,
   y: number,
   w: number,
   h: number,
   variant: MarioHillVariant,
): Graphics {
   const g = new Gfx({ roundPixels: true });
   const palette =
      variant === 'teal'
         ? { fill: 0x58c8d8, stroke: LINE }
         : variant === 'brown'
           ? { fill: 0xc89858, stroke: LINE }
           : { fill: 0x40d830, stroke: LINE };

   const lift = h * 0.22;
   g.roundRect(x, y - lift, w, h + lift + 6, h * 0.42)
      .fill({ color: palette.fill })
      .stroke({ width: 3, color: palette.stroke });

   g.roundRect(x + w * 0.12, y + h * 0.35 - lift, w * 0.76, h * 0.35, h * 0.18).fill({
      color: 0xffffff,
      alpha: variant === 'teal' ? 0.18 : 0.14,
   });

   return g;
}

export function createBushTreeGraphics(
   Gfx: GraphicsCtor,
   cx: number,
   baseY: number,
   cell: number,
   variant: number,
): Graphics {
   const g = new Gfx({ roundPixels: true });
   const trunkW = Math.max(12, cell * 0.28);
   const trunkH = cell * 0.36;
   const bottom = baseY + cell;
   const trunkTop = Math.round(bottom - trunkH);

   g.roundRect(cx - trunkW * 0.5, trunkTop, trunkW, trunkH + 4, 5)
      .fill({ color: 0xa1887f })
      .stroke({ width: 2, color: 0x4e342e });

   const greens = [0x00c020, 0x38e038, 0x10a818] as const;
   const main = greens[variant % greens.length]!;
   const bumpR = cell * 0.34;
   const bumpBaseY = trunkTop + 2;

   const bumps: [number, number][] = [
      [-bumpR * 0.92, 0.88],
      [0, 1],
      [bumpR * 0.92, 0.88],
   ];
   for (const [dx, sc] of bumps) {
      g.circle(cx + dx, bumpBaseY + bumpR * 0.42, bumpR * sc)
         .fill({ color: main })
         .stroke({ width: 3, color: LINE });
   }

   g.circle(cx, bumpBaseY + bumpR * 0.18, bumpR * 0.42).fill({
      color: 0xb8f878,
      alpha: 0.55,
   });

   return g;
}

/** Высота зелёной крышки трубы (как в Kenney / сцене). */
export const PIPE_CAP_SCREEN_PX = 64;

export function createPipeGraphics(
   Gfx: GraphicsCtor,
   x: number,
   topY: number,
   tw: number,
   capH: number,
   totalH: number,
): Graphics {
   const g = new Gfx({ roundPixels: true });
   const shaftTop = Math.round(topY + capH - 8);
   const pipeBottom = Math.round(topY + totalH);
   const shaftX = x + 3;
   const shaftW = tw - 6;
   const shaftBodyH = Math.max(0, pipeBottom - shaftTop);

   if (shaftBodyH > 0) {
      g.rect(shaftX, shaftTop, shaftW, shaftBodyH).fill({ color: 0x38d058 }).stroke({ width: 3, color: LINE });
      g.rect(x + 9, shaftTop, 5, shaftBodyH).fill({ color: 0xffffff, alpha: 0.22 });
   }

   g.roundRect(x - 6, topY - 2, tw + 12, capH + 10, 16)
      .fill({ color: 0x58f078 })
      .stroke({ width: 3, color: LINE });

   g.rect(x - 2, topY + capH - 6, tw + 4, 10).fill({ color: 0xa8ffc8, alpha: 0.65 });

   return g;
}

export type PillarVariantDraw = 'grass' | 'stone' | 'wood' | 'brick' | 'gold';

export function createPillarGraphics(
   Gfx: GraphicsCtor,
   bx: number,
   topY: number,
   cell: number,
   variant: PillarVariantDraw,
): Graphics {
   const g = new Gfx({ roundPixels: true });

   if (variant === 'gold') {
      g.roundRect(bx, topY, cell, cell, 10).fill({ color: 0xffd54f }).stroke({ width: 3, color: 0xe65100 });
      g.circle(bx + cell * 0.34, topY + cell * 0.34, cell * 0.16).fill({
         color: 0xfff8e1,
         alpha: 0.9,
      });
   } else if (variant === 'brick') {
      g.roundRect(bx, topY, cell, cell, 6).fill({ color: 0xd85828 }).stroke({ width: 3, color: LINE });
      g.rect(bx + 4, topY + cell * 0.5 - 1, cell - 8, 2).fill({ color: 0x481808, alpha: 0.65 });
      g.rect(bx + cell * 0.5 - 1, topY + 5, 2, cell - 10).fill({ color: 0x481808, alpha: 0.58 });
   } else if (variant === 'stone') {
      g.roundRect(bx, topY, cell, cell, 9).fill({ color: 0x90a4ae }).stroke({ width: 2, color: 0x455a64 });
      g.roundRect(bx + 7, topY + 8, cell - 14, cell - 16, 5).fill({
         color: 0xb0bec5,
         alpha: 0.4,
      });
   } else if (variant === 'wood') {
      g.roundRect(bx, topY, cell, cell, 7).fill({ color: 0xc19a6b }).stroke({ width: 2, color: 0x5d4037 });
      for (let i = 1; i <= 3; i++) {
         const ly = topY + (cell * i) / 4;
         g.moveTo(bx + 4, ly)
            .lineTo(bx + cell - 4, ly)
            .stroke({ width: 1.5, color: 0x795548, alpha: 0.55 });
      }
   } else {
      g.roundRect(bx, topY, cell, cell, 9).fill({ color: 0x73bf69 }).stroke({ width: 2, color: 0x33691e });
      g.rect(bx + 8, topY + cell * 0.55, cell - 16, 4).fill({ color: 0xaed581, alpha: 0.55 });
   }

   return g;
}

export function createCollectibleCoinContainer(
   Gfx: GraphicsCtor,
   ContainerCtor: typeof Container,
   worldCX: number,
   worldCY: number,
   cell: number,
): Container {
   const wrap = new ContainerCtor();
   wrap.position.set(Math.round(worldCX), Math.round(worldCY));

   const coin = new Gfx({ roundPixels: true });
   const rx = cell * 0.34;
   const ry = cell * 0.46;
   coin.ellipse(0, 0, rx, ry).fill({ color: 0xffea00 }).stroke({ width: 4, color: LINE });
   coin.ellipse(-rx * 0.12, -ry * 0.08, rx * 0.38, ry * 0.62).fill({ color: 0xfffde7, alpha: 0.55 });
   coin.ellipse(rx * 0.08, ry * 0.06, rx * 0.22, ry * 0.38).fill({ color: 0xffd600, alpha: 0.35 });

   wrap.addChild(coin);
   return wrap;
}

export function drawHudCoinIcon(g: Graphics, cx: number, cy: number, size: number): void {
   const rx = size * 0.34;
   const ry = size * 0.42;
   g.clear();
   g.ellipse(cx, cy, rx, ry).fill({ color: 0xffea00 }).stroke({ width: 3, color: LINE });
   g.ellipse(cx - rx * 0.12, cy - ry * 0.08, rx * 0.34, ry * 0.56).fill({
      color: 0xfffde7,
      alpha: 0.58,
   });
}
