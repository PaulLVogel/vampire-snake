import Phaser from 'phaser';

export const ENEMY_RADIUS = 12;
export const ENEMY_SPEED = 110;
export const ENEMY_MAX_HP = 30;
export const ENEMY_CONTACT_DAMAGE = 8;

export class Enemy extends Phaser.GameObjects.Container {
  hp = ENEMY_MAX_HP;
  readonly radius = ENEMY_RADIUS;
  private readonly bodyCircle: Phaser.GameObjects.Arc;
  private readonly core: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.bodyCircle = scene.add.circle(0, 0, ENEMY_RADIUS, 0x6b2d86);
    this.bodyCircle.setStrokeStyle(2, 0xc77dff, 0.7);
    this.core = scene.add.circle(0, 0, 4, 0xe0aaff);
    this.add([this.bodyCircle, this.core]);
    this.setDepth(8);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(ENEMY_RADIUS, -ENEMY_RADIUS, -ENEMY_RADIUS);
    body.setAllowGravity(false);
    body.setBounce(0);
  }

  chase(tx: number, ty: number) {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body || !this.active) return;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    body.setVelocity(Math.cos(angle) * ENEMY_SPEED, Math.sin(angle) * ENEMY_SPEED);
    this.rotation = angle;
  }

  takeDamage(amount: number): boolean {
    if (!this.active) return false;
    this.hp -= amount;
    this.bodyCircle.setFillStyle(0xff77aa);
    this.scene.time.delayedCall(60, () => {
      if (this.active) this.bodyCircle.setFillStyle(0x6b2d86);
    });
    if (this.hp <= 0) {
      this.kill();
      return true;
    }
    return false;
  }

  kill() {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.stop();
    this.destroy();
  }
}
