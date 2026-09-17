import Phaser from 'phaser';

export interface Enemy extends Phaser.GameObjects.GameObject {
    x: number;
    y: number;
    takeDamage: (amount: number) => void;
}

export interface Weapon {
    update(time: number, delta: number, owner: Phaser.GameObjects.Image): void;
}

/**
 * Rapid Blaster: Fires straight in the direction the segment is facing.
 */
class RapidBlaster implements Weapon {
    scene: Phaser.Scene;
    lastFired: number = 0;
    fireRate: number = 300; // ms

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    update(time: number, _delta: number, owner: Phaser.GameObjects.Image) {
        if (time > this.lastFired + this.fireRate) {
            this.fire(owner);
            this.lastFired = time;
        }
    }

    private fire(owner: Phaser.GameObjects.Image) {
        // Use segment rotation for direction
        const angle = owner.rotation;
        const projectile = this.scene.add.circle(owner.x, owner.y, 4, 0x39ff14);
        this.scene.physics.add.existing(projectile);
        const body = projectile.body as Phaser.Physics.Arcade.Body;
        
        const speed = 600;
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        // Cleanup after life
        this.scene.time.delayedCall(2000, () => projectile.destroy());

        // Emit event for collision detection in scene
        this.scene.events.emit('player_projectile_fired', projectile, 10);
    }
}

/**
 * Auto-Turret: Targets the closest enemy within range.
 */
class AutoTurret implements Weapon {
    scene: Phaser.Scene;
    lastFired: number = 0;
    fireRate: number = 1000; // ms
    range: number = 250;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    update(time: number, _delta: number, owner: Phaser.GameObjects.Image) {
        if (time > this.lastFired + this.fireRate) {
            const target = this.findClosestEnemy(owner);
            if (target) {
                this.fire(owner, target);
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

    private fire(owner: Phaser.GameObjects.Image, target: Enemy) {
        const angle = Phaser.Math.Angle.Between(owner.x, owner.y, target.x, target.y);
        const projectile = this.scene.add.circle(owner.x, owner.y, 6, 0x00ccff);
        this.scene.physics.add.existing(projectile);
        const body = projectile.body as Phaser.Physics.Arcade.Body;
        
        const speed = 400;
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

        this.scene.time.delayedCall(2000, () => projectile.destroy());
        this.scene.events.emit('player_projectile_fired', projectile, 25);
    }
}

/**
 * Orbiting Blade: Spins continuously around the segment.
 */
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
        
        // Blade damage is handled by overlap in Scene
        this.scene.events.emit('blade_created', this.blade, 5);
    }

    update(time: number, delta: number, owner: Phaser.GameObjects.Image) {
        this.angle += this.rotationSpeed * delta;
        
        const offsetX = Math.cos(this.angle) * this.orbitRadius;
        const offsetY = Math.sin(this.angle) * this.orbitRadius;
        
        this.blade.x = owner.x + offsetX;
        this.blade.y = owner.y + offsetY;
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
    positionHistory: { x: number; y: number; angle: number }[] = [];
    maxHistoryLength: number = 200;
    segmentDelay: number = 15;

    private lastX: number = 0;
    private lastY: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.head = this.scene.add.image(x, y, 'snake-head');
        this.head.setDepth(10);
        this.lastX = x;
        this.lastY = y;

        if (this.scene.input && this.scene.input.keyboard) {
            this.keys = this.scene.input.keyboard.addKeys('W,A,S,D') as any;
        }

        this.initSegments();
    }

    initSegments() {
        const numSegments = 4;
        const totalDelay = numSegments * this.segmentDelay;
        this.segments.forEach(seg => seg.destroy());
        this.segments = [];
        this.weapons = [];

        this.positionHistory = [];
        const pixelsPerFrame = 5;

        for (let i = 0; i <= totalDelay + 10; i++) {
            this.positionHistory.push({
                x: this.head.x - (i * pixelsPerFrame),
                y: this.head.y,
                angle: 0
            });
        }

        this.maxHistoryLength = totalDelay + 20;

        for (let i = 0; i < numSegments; i++) {
            const historyIndex = (i + 1) * this.segmentDelay;
            const pos = this.positionHistory[historyIndex];

            const segment = this.scene.add.image(pos.x, pos.y, 'snake-body');
            segment.setDepth(10 - (i + 1));
            this.segments.push(segment);

            // Attach Weapons to specific segments
            if (i === 0) this.weapons.push(new RapidBlaster(this.scene));
            else if (i === 1) this.weapons.push(new AutoTurret(this.scene));
            else if (i === 2) this.weapons.push(new OrbitingBlade(this.scene));
            else this.weapons.push(null);
        }
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
            this.head.x += vx * this.speed * dt;
            this.head.y += vy * this.speed * dt;
        }

        const headMoved = this.head.x !== this.lastX || this.head.y !== this.lastY;
        if (headMoved) {
            this.positionHistory.unshift({ x: this.head.x, y: this.head.y, angle: this.head.rotation });
            if (this.positionHistory.length > this.maxHistoryLength) this.positionHistory.pop();
            this.lastX = this.head.x;
            this.lastY = this.head.y;
        }

        for (let i = 0; i < this.segments.length; i++) {
            const delayOffset = (i + 1) * this.segmentDelay;
            const index = Math.min(delayOffset, this.positionHistory.length - 1);
            const historicalPos = this.positionHistory[index];
            
            if (historicalPos) {
                this.segments[i].x = historicalPos.x;
                this.segments[i].y = historicalPos.y;
                this.segments[i].rotation = historicalPos.angle;
            }

            // Update weapon attached to this segment
            const weapon = this.weapons[i];
            if (weapon) {
                weapon.update(time, delta, this.segments[i]);
            }
        }
    }
}
