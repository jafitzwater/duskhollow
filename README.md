# Duskhollow: phase-1 POC
Static PWA. Run `python3 serve.py 8080` and open http://localhost:8080/.
- Engine: Phaser 4.2.1 (vendor/phaser.min.js, MIT); pathfinding: EasyStar.js 0.4.4 (MIT)
- Art: Clint Bellanger's Flare assets from OpenGameArt (see the in-game Credits screen)
- Code: src/main.js (map/grid logic, iso projection, scenes), src/data.js (NPCs and dialogue), src/tiledefs.js (Flare tile rects)
- Build scratch (raw zips, tests, cloudflared binary): /workspace/dh-build

## Controls
- **Touch:** floating joystick (left half of screen) to walk; right-side buttons: Attack (hold to repeat), Skill (fire burst, 12 MP, 3.5 s cooldown), HP / MP potions, Talk (lights up near an NPC or sign). Tap advances dialogue.
- **Keyboard:** WASD / arrows move, Space attack, F skill, E / Enter talk, 1 / 2 potions.
- **Menu (☰):** tap-to-move toggle (off by default), sound, return to title.
