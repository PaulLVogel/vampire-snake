import Phaser from 'phaser';
import { SnakePlayer } from './SnakePlayer.ts';

export class MainScene extends Phaser.Scene {
    player!: SnakePlayer;

    constructor() {
        super({ key: 'MainScene' });
    }

    preload() {
        // No assets to preload as all graphics/textures are generated programmatically
    }

    create() {
        // 1. Create a large, high-fidelity grid background so movement is easily perceivable
        this.createGridBackground();

        // 2. Generate programmatically colored circle graphics for head and body sprites
        // Snake Head: Vibrant green with a subtle dark core/border
        const headGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        headGraphics.fillStyle(0x39ff14, 1); // Neon/lime green
        headGraphics.fillCircle(16, 16, 16);
        headGraphics.lineStyle(2, 0x1d8a0b, 1); // Darker green border
        headGraphics.strokeCircle(16, 16, 15);
        headGraphics.generateTexture('snake-head', 32, 32);

        // Snake Body: Cool fiery orange/red
        const bodyGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        bodyGraphics.fillStyle(0xff5722, 1); // Neon Orange
        bodyGraphics.fillCircle(12, 12, 12);
        bodyGraphics.lineStyle(1.5, 0xbf360c, 1); // Darker orange border
        bodyGraphics.strokeCircle(12, 12, 11);
        bodyGraphics.generateTexture('snake-body', 24, 24);

        // 3. Instantiate the SnakePlayer at the center of the grid world (1000, 1000)
        this.player = new SnakePlayer(this, 1000, 1000);

        // 4. Set the main camera to follow the Snake Player's head smoothly
        // lerpX and lerpY are set to 0.1 for smooth, slightly delayed trailing camera follow
        this.cameras.main.setBounds(0, 0, 2000, 2000);
        this.cameras.main.startFollow(this.player.head, true, 0.1, 0.1);

        // 5. Add overlay UI instructions
        const instructions = this.add.text(20, 20, 
            'CONTROLS:\n' +
            '• Move: WASD (Smooth 8-directional)\n\n' +
            'DESIGN DETAILS:\n' +
            '• Frame-history tail follow: keeps segments perfectly aligned on the trail\n' +
            '• Anti-clump logic: body segments freeze in place when stopped', 
            {
                fontFamily: 'Courier New, monospace',
                fontSize: '16px',
                color: '#39ff14',
                backgroundColor: '#0c0c0ced',
                padding: { x: 15, y: 15 },
            }
        );
        instructions.setScrollFactor(0); // Lock to screen
        instructions.setDepth(100);      // Render above everything
    }

    update(time: number, delta: number) {
        if (this.player) {
            this.player.update(time, delta);
        }
    }

    /**
     * Programmatically builds a tiled checkered-grid background to render the arena.
     */
    private createGridBackground() {
        const cellSize = 64;
        const gridGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        
        // Draw checkered dark gray pattern
        gridGraphics.fillStyle(0x181818, 1);
        gridGraphics.fillRect(0, 0, cellSize, cellSize);
        
        // Draw borders
        gridGraphics.lineStyle(1, 0x242424, 1);
        gridGraphics.strokeRect(0, 0, cellSize, cellSize);

        // Generate texture for TileSprite
        gridGraphics.generateTexture('grid-cell', cellSize, cellSize);

        // Create a large 2000x2000 checkered floor
        const bg = this.add.tileSprite(1000, 1000, 2000, 2000, 'grid-cell');
        bg.setDepth(-10); // Put background all the way at the back
    }
}
