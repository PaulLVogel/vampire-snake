import Phaser from 'phaser';
import { SnakePlayer, type ProjectileSpawner } from './SnakePlayer.ts';
import { Enemy, ENEMY_CONTACT_DAMAGE, ENEMY_RADIUS } from './Enemy.ts';

const WORLD = 2000;
const MAX_ENEMIES = 28;
const SPAWN_INTERVAL_MS = 900;
const PLAYER_MAX_HP = 100;
const I_FRAME_MS = 450;
const BLADE_HIT_COOLDOWN_MS = 250;
const PROJECTILE_LIFETIME_MS = 2000;

export class MainScene extends Phaser.Scene implements ProjectileSpawner {
  player!: SnakePlayer;
  enemies!: Phaser.GameObjects.Group;
  projectiles!: Phaser.Physics.Arcade.Group;
  private spawnAcc = 0;
  private playerHp = PLAYER_MAX_HP;
  private iFrameUntil = 0;
  private kills = 0;
  private hpText!: Phaser.GameObjects.Text;
  private swarmText!: Phaser.GameObjects.Text;
  private dead = false;
  /** Last HUD values drawn, so text is only rebuilt when something changes. */
  private hudKey = '';

  constructor() {
    super({ key: 'MainScene' });
  }

  /** Runs on first start and on every restart (the scene instance is reused). */
  init() {
    this.spawnAcc = 0;
    this.playerHp = PLAYER_MAX_HP;
    this.iFrameUntil = 0;
    this.kills = 0;
    this.dead = false;
    this.hudKey = '';
  }

  preload() {}

  create() {
    this.createGridBackground();
    this.makeSnakeTextures();

    // Enemies, projectile pool and listeners must exist before the player,
    // because weapons are built (and emit 'blade_created') in its constructor.
    this.enemies = this.add.group();
    this.projectiles = this.physics.add.group({ allowGravity: false });
    this.physics.add.overlap(this.projectiles, this.enemies, this.onProjectileHit, undefined, this);
    // Enemies push each other apart instead of stacking into one blob.
    this.physics.add.collider(this.enemies, this.enemies);
    this.events.on('blade_created', this.onBladeCreated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off('blade_created', this.onBladeCreated, this);
    });

    this.player = new SnakePlayer(
      this,
      WORLD / 2,
      WORLD / 2,
      this,
      this.enemies,
      new Phaser.Geom.Rectangle(0, 0, WORLD, WORLD),
    );

    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.startFollow(this.player.head, true, 0.1, 0.1);

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
    this.expireProjectiles(time);

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

  /** ProjectileSpawner: reuse a pooled projectile, or create one if the pool is empty. */
  fireProjectile(opts: {
    x: number;
    y: number;
    angle: number;
    speed: number;
    radius: number;
    color: number;
    damage: number;
    lifetimeMs?: number;
  }) {
    let p = this.projectiles.getFirstDead(false) as Phaser.GameObjects.Arc | null;
    if (!p) {
      p = this.add.circle(opts.x, opts.y, opts.radius, opts.color);
      this.projectiles.add(p);
    }
    p.setActive(true).setVisible(true);
    p.setRadius(opts.radius);
    p.setFillStyle(opts.color);
    p.setData('damage', opts.damage);
    p.setData('expiresAt', this.time.now + (opts.lifetimeMs ?? PROJECTILE_LIFETIME_MS));

    const body = p.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setCircle(opts.radius);
    body.reset(opts.x, opts.y);
    body.setVelocity(Math.cos(opts.angle) * opts.speed, Math.sin(opts.angle) * opts.speed);
  }

  private releaseProjectile(p: Phaser.GameObjects.Arc) {
    const body = p.body as Phaser.Physics.Arcade.Body;
    body.stop();
    body.enable = false;
    p.setActive(false).setVisible(false);
  }

  private expireProjectiles(time: number) {
    for (const child of this.projectiles.getChildren()) {
      const p = child as Phaser.GameObjects.Arc;
      if (p.active && time >= (p.getData('expiresAt') as number)) this.releaseProjectile(p);
    }
  }

  private onProjectileHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (a, b) => {
    // Arcade doesn't guarantee argument order for group-vs-group overlaps.
    const [enemy, p] = (a instanceof Enemy ? [a, b] : [b, a]) as [Enemy, Phaser.GameObjects.Arc];
    // A projectile can overlap two enemies in the same step; only the first counts.
    if (!p.active || !enemy.active) return;
    this.releaseProjectile(p);
    if (enemy.takeDamage(p.getData('damage') as number)) this.kills += 1;
  };

  private onBladeCreated(blade: Phaser.GameObjects.Rectangle, damage: number) {
    // Arcade overlap fires every frame while touching; limit hits per enemy.
    const lastHit = new WeakMap<Enemy, number>();
    this.physics.add.overlap(blade, this.enemies, (a, b) => {
      const enemy = (a instanceof Enemy ? a : b) as Enemy;
      if (!(enemy instanceof Enemy) || !enemy.active) return;
      const now = this.time.now;
      const prev = lastHit.get(enemy);
      if (prev !== undefined && now - prev < BLADE_HIT_COOLDOWN_MS) return;
      lastHit.set(enemy, now);
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
      .text(this.scale.width / 2, this.scale.height / 2, `DOWN  ·  ${this.kills} kills\nPress R to restart`, {
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
    this.input.keyboard?.once('keydown-R', () => this.scene.restart());
  }

  private refreshHud() {
    const key = `${this.playerHp}|${this.kills}|${this.enemies.getLength()}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    this.hpText.setText(
      `VAMPIRE SNAKE  ·  PHASE 3\nHP  ${this.playerHp}/${PLAYER_MAX_HP}   KILLS  ${this.kills}`,
    );
    this.swarmText.setText(
      `SWARM  ${this.enemies.getLength()}/${MAX_ENEMIES}   WASD  ·  body contact hurts`,
    );
  }

  private makeSnakeTextures() {
    // Textures live in the game-wide texture manager, so they survive restarts.
    if (this.textures.exists('snake-head')) return;
    const headGraphics = this.make.graphics({ x: 0, y: 0 }, false);
    headGraphics.fillStyle(0x39ff14, 1);
    headGraphics.fillCircle(16, 16, 16);
    headGraphics.lineStyle(2, 0x1d8a0b, 1);
    headGraphics.strokeCircle(16, 16, 15);
    headGraphics.generateTexture('snake-head', 32, 32);
    headGraphics.destroy();

    const bodyGraphics = this.make.graphics({ x: 0, y: 0 }, false);
    bodyGraphics.fillStyle(0xff5722, 1);
    bodyGraphics.fillCircle(12, 12, 12);
    bodyGraphics.lineStyle(1.5, 0xbf360c, 1);
    bodyGraphics.strokeCircle(12, 12, 11);
    bodyGraphics.generateTexture('snake-body', 24, 24);
    bodyGraphics.destroy();
  }

  private createGridBackground() {
    const cellSize = 64;
    if (!this.textures.exists('grid-cell')) {
      const gridGraphics = this.make.graphics({ x: 0, y: 0 }, false);
      gridGraphics.fillStyle(0x181818, 1);
      gridGraphics.fillRect(0, 0, cellSize, cellSize);
      gridGraphics.lineStyle(1, 0x242424, 1);
      gridGraphics.strokeRect(0, 0, cellSize, cellSize);
      gridGraphics.generateTexture('grid-cell', cellSize, cellSize);
      gridGraphics.destroy();
    }
    const bg = this.add.tileSprite(WORLD / 2, WORLD / 2, WORLD, WORLD, 'grid-cell');
    bg.setDepth(-10);
  }
}
