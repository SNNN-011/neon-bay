// Neon Bay — single tuning sheet for the whole game.
// World geometry, movement feel, AI budgets and the golden-hour render setup
// all live here so balancing never means hunting through system code.

export const CONFIG = {
  city: {
    blockPitch: 40,        // road centerline spacing
    roadWidth: 12,         // asphalt span of a single road
    sidewalkWidth: 3,      // raised walkway ringing every block
    gridHalf: 3,           // 7 roads per axis: -120 .. 120
    cityEdge: 132,         // outer limit of the street grid
    beachStart: 126,       // sand strip begins east of the grid
    oceanStart: 190,       // waterline
    worldMinX: -150,
    worldMaxX: 246,        // far enough to include the pier tip
    worldMinZ: -150,
    worldMaxZ: 150,
    pier: { x0: 150, x1: 242, halfWidth: 4, deckY: 0.5, z: 0 },
  },
  player: {
    walkSpeed: 6.0,
    sprintSpeed: 10.5,
    jumpSpeed: 7.6,
    gravity: 22,
    radius: 0.45,
    eyeHeight: 1.5,
    spawn: { x: 2, z: 14 },
  },
  camera: {
    distance: 6.5,
    shoulder: 0.0,
    lookHeight: 1.5,
    sensitivity: 0.0026,
    minPitch: -0.32,
    maxPitch: 1.15,
    followDamp: 10,
    chaseDistance: 7.5,    // base orbit behind a car; stretches with speed
    chaseHeight: 0.24,     // chase orbit pitch
  },
  vehicle: {
    enterDist: 3.6,        // E works within this range of a car
  },
  traffic: {
    count: 16,             // AI cars kept alive around the focus point
    spawnMin: 55,
    spawnMax: 110,
    despawn: 150,
    cruiseMin: 9,
    cruiseMax: 13,
    greenPeriod: 7,        // seconds per NS/EW signal phase
  },
  peds: {
    count: 20,
    spawnRadius: 90,
    despawn: 130,
    walkMin: 1.3,
    walkMax: 2.1,
    fleeSpeed: 5.2,
  },
  police: {
    maxCars: 5,
    maxFoot: 5,
    spawnMin: 48,
    spawnMax: 78,
    carTop: 29,            // +1.5 per star; sport cars can still escape
    losRange: 62,
    shootRange: 26,
    shootEvery: 1.5,
    shotDamage: 6,
    captureDist: 2.3,
    captureTime: 2.2,
    bustFine: 150,
  },
  combat: {
    pistolDamage: 22,
    punchDamage: 14,
    punchRange: 2.4,
    fireEvery: 0.3,
    range: 60,
    startAmmo: 24,
    pedHp: 40,
    copHp: 45,
    carHp: 70,
    pickupRadius: 1.8,
    pickupRespawn: 45,
    wastedFine: 60,
  },
  wanted: {
    thresholds: [8, 24, 44, 68, 92], // heat required for stars 1..5
    escapeTime: 7,         // +1s per current star outside police sight
    hotWindow: 9,          // post-crime window where police reinforce
  },
  render: {
    pixelRatioCap: 1.5,
    shadowMapSize: 2048,
    shadowRadius: 70,      // half-size of the sun's ortho shadow box
    fogNear: 70,
    fogFar: 430,
    fogColor: 0xffb27a,
    skyTop: 0x6fc3e8,
    skyHorizon: 0xffa25e,
    sunColor: 0xffd9a6,
    sunIntensity: 2.6,
    hemiSky: 0xbfe3ff,
    hemiGround: 0xffcf9e,
    hemiIntensity: 1.05,
  },
  palette: {
    // pastel art-deco bodies
    buildings: [0xf7c8d8, 0xbfe8d9, 0xfde9c8, 0xcfd8f7, 0xf6d3b3, 0xe8c8ef, 0xbfe0ef, 0xffe3a8],
    trims: [0xff5f9e, 0x35e0d2, 0xffc36b, 0x8f7bff, 0xff8a5c, 0x6bd5ff],
    neon: [0xff2f92, 0x22e6d6, 0xffb02e, 0x9a6bff, 0xff5c39, 0x3dff8f],
    cars: [0xff8fb3, 0x7fd8c9, 0xffd98a, 0x9fb4ff, 0xff9e6b, 0xe8e4da, 0x6bd5ff],
    asphalt: 0x3a3644,
    sidewalk: 0xd9c8b4,
    sand: 0xf2dcae,
    ocean: 0x2f9db4,
    grass: 0x8fc978,
    lane: 0xf5d76e,
    crosswalk: 0xe8e0d0,
  },
};
