import Phaser from 'phaser';

export interface Enemy extends Phaser.GameObjects.GameObject {
    x: number;
    y: number;
    takeDamage: (amount: number) => void;
}

export interface Weapon {
    update(time: number, delta: number, owner: Phaser.GameObjects.Image): void;
}

/** Spawns a pooled player projectile. Implemented by the scene. */
export interface ProjectileSpawner {
    fireProjectile(opts: {
        x: number;
        y: number;
        angle: number;
        speed: number;
        radius: number;
        color: number;
        damage: number;
        lifetimeMs?: number;
    }): void;
}

/** Distance between consecutive body segments along the path, in px. */
export const SEGMENT_SPACING = 28;
/** Minimum head travel before a new path point is recorded, in px. */
const PATH_MIN_STEP = 2;
const HEAD_RADIUS = 16;

class RapidBlaster implements Weapon {
    lastFired: number = 0;
    fireRate: number = 300;

    spawner: ProjectileSpawner;

    constructor(spawner: ProjectileSpawner) {
        this.spawner = spawner;
    }

    update(time: number, _delta: number, owner: Phaser.GameObjects.Image) {
        if (time > this.lastFired + this.fireRate) {
            this.spawner.fireProjectile({
                x: owner.x, y: owner.y, angle: owner.rotation,
                speed: 600, radius: 4, color: 0x39ff14, damage: 10,
            });
            this.lastFired = time;
        }
    }
}

class AutoTurret implements Weapon {
    scene: Phaser.Scene;
    lastFired: number = 0;
    fireRate: number = 1000;
    range: number = 250;
    spawner: ProjectileSpawner;

    constructor(scene: Phaser.Scene, spawner: ProjectileSpawner) {
        this.scene = scene;
        this.spawner = spawner;
    }

    update(time: number, _delta: number, owner: Phaser.GameObjects.Image) {
        if (time > this.lastFired + this.fireRate) {
            const target = this.findClosestEnemy(owner);
            if (target) {
                this.spawner.fireProjectile({
                    x: owner.x, y: owner.y,
                    angle: Phaser.Math.Angle.Between(owner.x, owner.y, target.x, target.y),
                    speed: 400, radius: 6, color: 0x00ccff, damage: 25,
                });
                this.lastFired = time;
            }
        }
    }

    private findClosestEnemy(owner: Phaser.GameObjects.Image): Enemy | null {
        const enemies = (this.scene as any).enemies as Phaser.GameObjects.Group;
        if (!enemies) return null;
        let closest: Enemy | null = null;
        let minDist = this.range;
        enemies.getChildren().forEach((child) => {
            const enemy = child as unknown as Enemy;
            const dist = Phaser.Math.Distance.Between(owner.x, owner.y, enemy.x, enemy.y);
            if (dist < minDist) {
                minDist = dist;
                closest = enemy;
            }
        });
        return closest;
    }
}

class OrbitingBlade implements Weapon {
    scene: Phaser.Scene;
    blade: Phaser.GameObjects.Rectangle;
    angle: number = 0;
    orbitRadius: number = 40;
    rotationSpeed: number = 0.005;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.blade = this.scene.add.rectangle(0, 0, 30, 8, 0xff00ff);
        this.scene.physics.add.existing(this.blade);
        (this.blade.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (this.blade.body as Phaser.Physics.Arcade.Body).setImmovable(true);
        this.scene.events.emit('blade_created', this.blade, 5);
    }

    update(_time: number, delta: number, owner: Phaser.GameObjects.Image) {
        this.angle += this.rotationSpeed * delta;
        this.blade.x = owner.x + Math.cos(this.angle) * this.orbitRadius;
        this.blade.y = owner.y + Math.sin(this.angle) * this.orbitRadius;
        this.blade.rotation = this.angle + Math.PI / 2;
    }
}

export class SnakePlayer {
    scene: Phaser.Scene;
    head: Phaser.GameObjects.Image;
    segments: Phaser.GameObjects.Image[] = [];
    weapons: (Weapon | null)[] = [];
    keys!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };
    speed: number = 300;
    /** Head positions, newest first. path[0] is always the current head position. */
    path: { x: number; y: number }[] = [];
    private spawner: ProjectileSpawner;
    private worldBounds: Phaser.Geom.Rectangle;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        spawner: ProjectileSpawner,
        worldBounds: Phaser.Geom.Rectangle,
    ) {
        this.scene = scene;
        this.spawner = spawner;
        this.worldBounds = worldBounds;
        this.head = this.scene.add.image(x, y, 'snake-head');
        this.head.setDepth(10);
        if (this.scene.input && this.scene.input.keyboard) {
            this.keys = this.scene.input.keyboard.addKeys('W,A,S,D') as any;
        }
        this.initSegments();
    }

    getHurtboxes(): { x: number; y: number; r: number }[] {
        const parts = [{ x: this.head.x, y: this.head.y, r: HEAD_RADIUS }];
        for (const seg of this.segments) {
            parts.push({ x: seg.x, y: seg.y, r: 12 });
        }
        return parts;
    }

    /** Arc length of path needed to place every segment. */
    private get bodyLength(): number {
        return (this.segments.length + 1) * SEGMENT_SPACING;
    }

    initSegments() {
        const numSegments = 4;
        this.segments.forEach(seg => seg.destroy());
        this.segments = [];
        this.weapons = [];

        // Straight line behind the head (head faces +x at start).
        this.path = [];
        for (let d = 0; d <= (numSegments + 1) * SEGMENT_SPACING; d += SEGMENT_SPACING) {
            this.path.push({ x: this.head.x - d, y: this.head.y });
        }

        for (let i = 0; i < numSegments; i++) {
            const segment = this.scene.add.image(this.head.x - (i + 1) * SEGMENT_SPACING, this.head.y, 'snake-body');
            segment.setDepth(10 - (i + 1));
            this.segments.push(segment);
            if (i === 0) this.weapons.push(new RapidBlaster(this.spawner));
            else if (i === 1) this.weapons.push(new AutoTurret(this.scene, this.spawner));
            else if (i === 2) this.weapons.push(new OrbitingBlade(this.scene));
            else this.weapons.push(null);
        }
        this.layoutSegments();
    }

    update(time: number, delta: number) {
        if (!this.keys) return;
        let vx = 0;
        let vy = 0;
        if (this.keys.W.isDown) vy = -1;
        if (this.keys.S.isDown) vy = 1;
        if (this.keys.A.isDown) vx = -1;
        if (this.keys.D.isDown) vx = 1;
        if (vx !== 0 || vy !== 0) {
            const angle = Math.atan2(vy, vx);
            this.head.rotation = angle;
            const length = Math.sqrt(vx * vx + vy * vy);
            vx /= length;
            vy /= length;
            const dt = delta / 1000;
            const b = this.worldBounds;
            this.head.x = Phaser.Math.Clamp(this.head.x + vx * this.speed * dt, b.left + HEAD_RADIUS, b.right - HEAD_RADIUS);
            this.head.y = Phaser.Math.Clamp(this.head.y + vy * this.speed * dt, b.top + HEAD_RADIUS, b.bottom - HEAD_RADIUS);
        }

        this.recordHeadPosition();
        this.layoutSegments();

        for (let i = 0; i < this.segments.length; i++) {
            const weapon = this.weapons[i];
            if (weapon) weapon.update(time, delta, this.segments[i]);
        }
    }

    /** Keep path[0] at the head; commit a new point once the head has moved far enough. */
    private recordHeadPosition() {
        const hx = this.head.x;
        const hy = this.head.y;
        const last = this.path[1];
        if (last && Phaser.Math.Distance.Between(hx, hy, last.x, last.y) < PATH_MIN_STEP) {
            // Small move: slide the head point instead of adding a new one.
            this.path[0].x = hx;
            this.path[0].y = hy;
        } else {
            this.path[0] = { x: hx, y: hy };
            this.path.unshift({ x: hx, y: hy });
        }
    }

    /**
     * Place segment i at arc length (i+1) * SEGMENT_SPACING back along the path,
     * interpolating between recorded points, then trim the unused tail of the path.
     */
    private layoutSegments() {
        const path = this.path;
        let segIdx = 0;
        let walked = 0; // arc length from head to path[p]
        let p = 0;
        while (segIdx < this.segments.length && p < path.length - 1) {
            const a = path[p];
            const b = path[p + 1];
            const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
            const target = (segIdx + 1) * SEGMENT_SPACING;
            if (len > 0 && walked + len >= target) {
                const t = (target - walked) / len;
                const seg = this.segments[segIdx];
                seg.x = a.x + (b.x - a.x) * t;
                seg.y = a.y + (b.y - a.y) * t;
                seg.rotation = Math.atan2(a.y - b.y, a.x - b.x);
                segIdx++;
                continue; // next segment may land on the same path piece
            }
            walked += len;
            p++;
        }
        // Path too short (shouldn't happen): stack leftovers on the last point.
        const end = path[path.length - 1];
        for (; segIdx < this.segments.length; segIdx++) {
            this.segments[segIdx].setPosition(end.x, end.y);
        }

        // Trim points beyond the body length (keep one extra piece for interpolation).
        let acc = 0;
        for (let i = 0; i < path.length - 1; i++) {
            acc += Phaser.Math.Distance.Between(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
            if (acc > this.bodyLength + SEGMENT_SPACING) {
                path.length = i + 2;
                break;
            }
        }
    }
}
