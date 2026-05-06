import type { MonsterKind } from '~/data/marioScreens';

/** Kenney.nl spritesheet-enemies-default.png (TextureAtlas), CC0 */
const ENEMY_SHEET = '/sprites/spritesheet-enemies-default.png';
const ENEMY_SHEET_W = 519;
const ENEMY_SHEET_H = 519;
const ENEMY_CELL = 64;

/** Позиции SubTexture x,y — без масштаба */
const XY = (x: number, y: number) => ({ x, y });

export type MobAnimDef =
   | {
        kind: 'strip-h';
        sheet: string;
        frameW: number;
        frameH: number;
        frames: number;
        fps: number;
        scale: number;
     }
   | {
        kind: 'grid';
        sheet: string;
        sheetPxW: number;
        sheetPxH: number;
        frameW: number;
        frameH: number;
        cols: number;
        sequence: number[];
        fps: number;
        scale: number;
     }
   | {
        kind: 'static';
        sheet: string;
        frameW: number;
        frameH: number;
        scale: number;
        fx?: 'float';
     }
   | {
        kind: 'static-spin';
        sheet: string;
        frameW: number;
        frameH: number;
        scale: number;
        spinSec?: number;
     }
   | {
        kind: 'atlas';
        sheet: string;
        sheetPxW: number;
        sheetPxH: number;
        frameW: number;
        frameH: number;
        frames: readonly { x: number; y: number }[];
        fps: number;
        scale: number;
        fx?: 'float';
     }
   | {
        kind: 'atlas-spin';
        sheet: string;
        sheetPxW: number;
        sheetPxH: number;
        frameW: number;
        frameH: number;
        frame: { x: number; y: number };
        scale: number;
        spinSec?: number;
     };

export const MOB_ANIM: Record<MonsterKind, MobAnimDef> = {
   goomba: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [XY(195, 325), XY(260, 325), XY(325, 325), XY(260, 325)],
      fps: 9,
      scale: 1.02,
   },
   koopa: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(130, 390),
         XY(260, 390),
         XY(325, 390),
         XY(260, 390),
      ],
      fps: 8,
      scale: 1.02,
   },
   piranha: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [XY(0, 0), XY(65, 0), XY(130, 0), XY(65, 0)],
      fps: 11,
      scale: 1.08,
   },
   boo: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [XY(260, 130), XY(130, 130), XY(195, 130), XY(130, 130)],
      fps: 7,
      scale: 1.02,
      fx: 'float',
   },
   bullet: {
      kind: 'atlas-spin',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frame: XY(65, 260),
      scale: 1.05,
      spinSec: 2.2,
   },
   slime_fire: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(455, 260),
         XY(0, 325),
         XY(65, 325),
         XY(0, 325),
      ],
      fps: 9,
      scale: 1.02,
   },
   slime_spike: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(455, 325),
         XY(0, 390),
         XY(65, 390),
         XY(0, 390),
      ],
      fps: 9,
      scale: 1.02,
   },
   ladybug: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(65, 195),
         XY(130, 195),
         XY(195, 195),
         XY(130, 195),
      ],
      fps: 10,
      scale: 1.02,
   },
   mouse: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(260, 195),
         XY(325, 195),
         XY(390, 195),
         XY(325, 195),
      ],
      fps: 10,
      scale: 1.02,
   },
   frog: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(455, 130),
         XY(325, 130),
         XY(390, 130),
         XY(325, 130),
      ],
      fps: 8,
      scale: 1.02,
   },
   worm: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(0, 455),
         XY(390, 390),
         XY(455, 390),
         XY(390, 390),
      ],
      fps: 9,
      scale: 1.02,
   },
   worm_ring: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(195, 455),
         XY(65, 455),
         XY(130, 455),
         XY(65, 455),
      ],
      fps: 9,
      scale: 1.02,
   },
   bee: {
      kind: 'atlas',
      sheet: ENEMY_SHEET,
      sheetPxW: ENEMY_SHEET_W,
      sheetPxH: ENEMY_SHEET_H,
      frameW: ENEMY_CELL,
      frameH: ENEMY_CELL,
      frames: [
         XY(325, 0),
         XY(195, 0),
         XY(260, 0),
         XY(195, 0),
      ],
      fps: 11,
      scale: 1.02,
   },
};
