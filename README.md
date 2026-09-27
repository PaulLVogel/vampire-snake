# Vampire Snake

A bullet-heaven (Vampire Survivors-style) game where you play a snake. Every body segment carries its own weapon: the longer you grow, the more firepower you have, but the harder you are to keep out of trouble.

**Play it:** https://vampire-snake.vercel.app

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| R | Restart after you go down |

Weapons fire on their own. Enemies hurt you when they touch any part of the snake.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

`npm run build` type-checks with `tsc` and builds to `dist/`.

## Stack

Phaser 4 + Vite + TypeScript. Game code is in `src/`:

- `main.ts`: game config
- `MainScene.ts`: spawning, collisions, HUD, restart
- `SnakePlayer.ts`: snake movement and its weapons
- `Enemy.ts`: basic chaser enemy

Every push to a branch gets a Vercel preview; `main` is the live build.
