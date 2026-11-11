# Gameplay recordings (optional)

Every game gets a 20-second gameplay video. By default it is made from the game's
real screenshots on shoukugames.org (slow pan and zoom with cross-fades).

To use a real screen recording instead, put it here named after the game's slug:

```
videos/math-fighter.mp4
videos/key-rush.webm
```

`.mp4`, `.webm`, `.mkv` and `.mov` all work. The recording is trimmed to the first
20 seconds and scaled to 1280×720. Then rebuild the videos:

```sh
npm run videos -- math-fighter      # one game
npm run videos -- --force           # all games
```

Slugs are the last part of the game's URL, e.g. `https://shoukugames.org/games/math-fighter/`.
