import { publicPath } from "./assets";

const RAW_PRELOAD_IMAGE_PATHS = [
  "assets/sprites/characters/wizard-green/idle-1.png",
  "assets/sprites/characters/wizard-green/idle-2.png",
  "assets/sprites/characters/wizard-green/idle-3.png",
  "assets/sprites/characters/wizard-green/idle-4.png",
  "assets/sprites/characters/wizard-green/idle-5.png",
  "assets/sprites/characters/wizard-green/idle-6.png",
  "assets/sprites/characters/wizard-green/jump-1.png",
  "assets/sprites/characters/wizard-green/jump-2.png",
  "assets/sprites/characters/wizard-green/jump-3.png",
  "assets/sprites/characters/wizard-green/jump-4.png",
  "assets/sprites/characters/wizard-green/jump-5.png",
  "assets/sprites/characters/wizard-green/jump-6.png",
  "assets/sprites/characters/wizard-face/idle_blue.png",
  "assets/sprites/characters/wizard-face/idle_green.png",
  "assets/sprites/characters/wizard-face/idle_orange.png",
  "assets/sprites/characters/wizard-face/idle_red.png",
  "assets/sprites/characters/wizard-idle.png",
  "assets/sprites/characters/wizard-orange/idle-1.png",
  "assets/sprites/characters/wizard-orange/idle-2.png",
  "assets/sprites/characters/wizard-orange/idle-3.png",
  "assets/sprites/characters/wizard-orange/idle-4.png",
  "assets/sprites/characters/wizard-orange/idle-5.png",
  "assets/sprites/characters/wizard-orange/idle-6.png",
  "assets/sprites/characters/wizard-orange/jump-1.png",
  "assets/sprites/characters/wizard-orange/jump-2.png",
  "assets/sprites/characters/wizard-orange/jump-3.png",
  "assets/sprites/characters/wizard-orange/jump-4.png",
  "assets/sprites/characters/wizard-orange/jump-5.png",
  "assets/sprites/characters/wizard-orange/jump-6.png",
  "assets/sprites/characters/wizard-red/idle-1.png",
  "assets/sprites/characters/wizard-red/idle-2.png",
  "assets/sprites/characters/wizard-red/idle-3.png",
  "assets/sprites/characters/wizard-red/idle-4.png",
  "assets/sprites/characters/wizard-red/idle-5.png",
  "assets/sprites/characters/wizard-red/idle-6.png",
  "assets/sprites/characters/wizard-red/jump-1.png",
  "assets/sprites/characters/wizard-red/jump-2.png",
  "assets/sprites/characters/wizard-red/jump-3.png",
  "assets/sprites/characters/wizard-red/jump-4.png",
  "assets/sprites/characters/wizard-red/jump-5.png",
  "assets/sprites/characters/wizard-red/jump-6.png",
  "assets/sprites/characters/wizard-run-1.png",
  "assets/sprites/characters/wizard-run-2.png",
  "assets/sprites/characters/wizard-run-3.png",
  "assets/sprites/characters/wizard-run-4.png",
  "assets/sprites/characters/wizard-shadow.png",
  "assets/sprites/characters/wizard/idle-1.png",
  "assets/sprites/characters/wizard/idle-2.png",
  "assets/sprites/characters/wizard/idle-3.png",
  "assets/sprites/characters/wizard/idle-4.png",
  "assets/sprites/characters/wizard/idle-5.png",
  "assets/sprites/characters/wizard/idle-6.png",
  "assets/sprites/characters/wizard/jump-1.png",
  "assets/sprites/characters/wizard/jump-2.png",
  "assets/sprites/characters/wizard/jump-3.png",
  "assets/sprites/characters/wizard/jump-4.png",
  "assets/sprites/characters/wizard/jump-5.png",
  "assets/sprites/characters/wizard/jump-6.png",
  "assets/sprites/effects/sparkle/frame-1.png",
  "assets/sprites/effects/sparkle/frame-2.png",
  "assets/sprites/effects/sparkle/frame-3.png",
  "assets/sprites/effects/sparkle/frame-4.png",
  "assets/sprites/effects/cloud.png",
  "assets/sprites/items/book-close/frame-1.png",
  "assets/sprites/items/book-close/frame-2.png",
  "assets/sprites/items/book-close/frame-3.png",
  "assets/sprites/items/book-open/frame-1.png",
  "assets/sprites/items/book-open/frame-2.png",
  "assets/sprites/items/book-open/frame-3.png",
  "assets/sprites/items/book-open/frame-4.png",
  "assets/sprites/items/book-open/frame-5.png",
  "assets/sprites/items/book-open/frame-6.png",
  "assets/sprites/items/book-open/frame-7.png",
  "assets/sprites/items/book-open/frame-8.png",
  "assets/sprites/items/blank-page.png",
  "assets/sprites/items/bubble.png",
  "assets/sprites/items/forbidden-card.png",
  "assets/sprites/items/forbidden-icon.png",
  "assets/sprites/items/lantern.png",
  "assets/sprites/items/scroll.png",
  "assets/sprites/items/potion-blue.png",
  "assets/sprites/items/cauldron.png",
  "assets/sprites/items/cauldron-ring.png",
  "assets/sprites/items/potion-empty.png",
  "assets/sprites/items/potion-orange.png",
  "assets/sprites/items/potion-red.png",
  "assets/sprites/items/raven.png",
  "assets/sprites/items/spoon.png",
  "assets/sprites/items/spell-book-icon.png",
  "assets/sprites/items/tower-icon.png",
  "assets/sprites/items/wizard-icon.png",
  "assets/sprites/cauldron/1.png",
  "assets/sprites/map/map.png",
  "assets/sprites/terrain/grass1.png",
  "assets/sprites/terrain/grass2.png",
  "assets/sprites/terrain/grass3.png",
  "assets/sprites/terrain/sand1.png",
  "assets/sprites/terrain/sand2.png",
  "assets/sprites/terrain/sand3.png",
  "assets/sprites/terrain/snow1.png",
  "assets/sprites/terrain/snow2.png",
  "assets/sprites/terrain/snow3.png",
  "assets/sprites/terrain/water.png",
  "assets/sprites/terrain/water2.png",
  "assets/sprites/terrain/water3.png",
  "assets/sprites/tiles/crab.png",
  "assets/sprites/tiles/deep-water.png",
  "assets/sprites/tiles/dock.png",
  "assets/sprites/tiles/grass.png",
  "assets/sprites/tiles/road.png",
  "assets/sprites/tiles/rock.png",
  "assets/sprites/tiles/sand.png",
  "assets/sprites/tiles/shore.png",
  "assets/sprites/tiles/stone-road.png",
  "assets/sprites/tiles/water.png",
  "assets/sprites/towers/ravenskeep-fly-2.png",
  "assets/sprites/towers/ravenskeep.png",
  "assets/sprites/towers/tower-shadow.png",
  "assets/sprites/towers/tower.png"
];

export const PRELOAD_IMAGE_PATHS = RAW_PRELOAD_IMAGE_PATHS.map(publicPath);

export function preloadImages(paths, onProgress) {
  let loaded = 0;
  const total = paths.length;
  onProgress?.({ loaded, total });

  return Promise.all(paths.map((path) => preloadImage(path).finally(() => {
    loaded += 1;
    onProgress?.({ loaded, total });
  })));
}

function preloadImage(path) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      if (image.decode) {
        image.decode().then(resolve).catch(resolve);
        return;
      }
      resolve();
    };
    image.onerror = resolve;
    image.src = path;
  });
}
