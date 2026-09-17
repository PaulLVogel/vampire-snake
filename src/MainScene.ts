import Phaser from 'phaser';
import { SnakePlayer } from './SnakePlayer.ts';
import { Enemy, ENEMY_CONTACT_DAMAGE, ENEMY_RADIUS } from './Enemy.ts';

const WORLD = 2000;
const MAX_ENEMIES = 28;
const SPAWN_INTERVAL_MS = 900;
const PLAYER_MAX_HP = 100;
const I_FRAME_MS = 450;

export class MainScene extends Phaser.Scene {
  player!: SnakePlayer;
  enemies!: Phaser.GameObjects.Group;
  private spawnAcc = 0;
  private playerHp = PLAYER_MAX_HP;
  private iFrameUntil = 0;
  private kills = 0;
  private hpText!: Phaser.GameObjects.Text;
  private swarmText!: Phaser.GameObjects.Text;
  private dead = false;

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {}

  create() {
    this.createGridBackground();
    this.makeSnakeTextures();

    this.player = new SnakePlayer(this, WORLD / 2, WORLD / 2);

    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.startFollow(this.player.head, true, 0.1, 0.1);

    this.enemies = this.add.group();

    this.events.on('player_projectile_fired', this.onProjectileFired, this);
    this.events.on('blade_created', this.onBladeCreated, this);

    this.hpText = this.add
      .text(20, 20, '', {
        fontFamily: 'Courier New, monospace',
        fontSize: '16px',
        color: '#ece8e4',
        backgroundColor: '#0c0c0ced',
        padding: { x: 12, y: 10 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.swarmText = this.add
      .text(20, 88, '', {
        fontFamily: 'Courier New, monospace',
        fontSize: '14px',
        color: '#c77dff',
        backgroundColor: '#0c0c0ced',
        padding: { x: 12, y: 8 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.refreshHud();
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    if (this.player) this.player.update(time, delta);

    this.spawnAcc += delta;
    if (this.spawnAcc >= SPAWN_INTERVAL_MS && this.enemies.getLength() < MAX_ENEMIES) {
      this.spawnAcc = 0;
      this.spawnEnemyOutsideView();
    }

    const hx = this.player.head.x;
    const hy = this.player.head.y;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (enemy.active) enemy.chase(hx, hy);
    }

    this.checkPlayerContact(time);
    this.refreshHud();
  }

  private spawnEnemyOutsideView() {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const pad = 48;
    let x = 0;
    let y = 0;
    let tries = 0;
    do {
      const edge = Phaser.Math.Between(0, 3);
      if (edge === 0) {
        x = view.x - pad - ENEMY_RADIUS;
        y = Phaser.Math.Between(view.y, view.y + view.height);
      } else if (edge === 1) {
        x = view.x + view.width + pad + ENEMY_RADIUS;
        y = Phaser.Math.Between(view.y, view.y + view.height);
      } else if (edge === 2) {
        x = Phaser.Math.Between(view.x, view.x + view.width);
        y = view.y - pad - ENEMY_RADIUS;
      } else {
        x = Phaser.Math.Between(view.x, view.x + view.width);
        y = view.y + view.height + pad + ENEMY_RADIUS;
      }
      x = Phaser.Math.Clamp(x, ENEMY_RADIUS + 8, WORLD - ENEMY_RADIUS - 8);
      y = Phaser.Math.Clamp(y, ENEMY_RADIUS + 8, WORLD - ENEMY_RADIUS - 8);
      tries += 1;
    } while (view.contains(x, y) && tries < 8);

    const enemy = new Enemy(this, x, y);
    this.enemies.add(enemy);
  }

  private onProjectileFired(projectile: Phaser.GameObjects.Arc, damage: number) {
    this.physics.add.overlap(projectile, this.enemies, (_p, enemyObj) => {
      const enemy = enemyObj as Enemy;
      if (!enemy.active) return;
      projectile.destroy();
      if (enemy.takeDamage(damage)) this.kills += 1;
    });
  }

  private onBladeCreated(blade: Phaser.GameObjects.Rectangle, damage: number) {
    this.physics.add.overlap(blade, this.enemies, (_b, enemyObj) => {
      const enemy = enemyObj as Enemy;
      if (!enemy.active) return;
      if (enemy.takeDamage(damage)) this.kills += 1;
    });
  }

  private checkPlayerContact(time: number) {
    if (time < this.iFrameUntil) return;
    const parts = this.player.getHurtboxes();
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active) continue;
      for (const part of parts) {
        const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, part.x, part.y);
        if (d < enemy.radius + part.r) {
          this.hurtPlayer(ENEMY_CONTACT_DAMAGE, time);
          return;
        }
      }
    }
  }

  private hurtPlayer(amount: number, time: number) {
    this.playerHp = Math.max(0, this.playerHp - amount);
    this.iFrameUntil = time + I_FRAME_MS;
    this.cameras.main.flash(80, 180, 40, 50, false);
    if (this.playerHp <= 0) this.onPlayerDead();
  }

  private onPlayerDead() {
    this.dead = true;
    this.enemies.clear(true, true);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'DOWN\nRefresh to run again', {
        fontFamily: 'Courier New, monospace',
        fontSize: '22px',
        color: '#f3ebe6',
        align: 'center',
        backgroundColor: '#0c0c0ced',
        padding: { x: 18, y: 16 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120);
  }

  private refreshHud() {
    this.hpText.setText(
      `VAMPIRE SNAKE  ·  PHASE 3\nHP  ${this.playerHp}/${PLAYER_MAX_HP}   KILLS  ${this.kills}`,
    );
    this.swarmText.setText(
      `SWARM  ${this.enemies.getLength()}/${MAX_ENEMIES}   WASD  ·  body contact hurts`,
    );
  }

  private makeSnakeTextures() {
    const headGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    headGraphics.fillStyle(0x39ff14, 1);
    headGraphics.fillCircle(16, 16, 16);
    headGraphics.lineStyle(2, 0x1d8a0b, 1);
    headGraphics.strokeCircle(16, 16, 15);
    headGraphics.generateTexture('snake-head', 32, 32);

    const bodyGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    bodyGraphics.fillStyle(0xff5722, 1);
    bodyGraphics.fillCircle(12, 12, 12);
    bodyGraphics.lineStyle(1.5, 0xbf360c, 1);
    bodyGraphics.strokeCircle(12, 12, 11);
    bodyGraphics.generateTexture('snake-body', 24, 24);
  }

  private createGridBackground() {
    const cellSize = 64;
    const gridGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    gridGraphics.fillStyle(0x181818, 1);
    gridGraphics.fillRect(0, 0, cellSize, cellSize);
    gridGraphics.lineStyle(1, 0x242424, 1);
    gridGraphics.strokeRect(0, 0, cellSize, cellSize);
    gridGraphics.generateTexture('grid-cell', cellSize, cellSize);
    const bg = this.add.tileSprite(WORLD / 2, WORLD / 2, WORLD, WORLD, 'grid-cell');
    bg.setDepth(-10);
  }
}
