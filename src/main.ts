import Phaser from 'phaser';
import { MainScene } from './MainScene.ts';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'app',
    scene: [MainScene],
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    // We disable physics config since player movement is direct coordinate updates based on delta time
};

new Phaser.Game(config);
