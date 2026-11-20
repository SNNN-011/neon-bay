// Neon Bay — central tuning values. One place for world layout, movement feel and render budget.

export const CONFIG = {
  city: {
    blockPitch: 40,        // distance between road centerlines
    roadWidth: 12,         // asphalt width of one road
    sidewalkWidth: 3,      // raised sidewalk ring around each block
    gridHalf: 3,           // roads at -120, -80, ... 120 on both axes (7 per axis)
    cityEdge: 132,         // outer edge of the road grid
    beachStart: 126,       // sand begins east of the last road
    oceanStart: 190,       // waterline
    worldMinX: -150,
    worldMaxX: 246,        // includes the pier tip
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
    chaseDistance: 7.5,    // behind the car, grows with speed
    chaseHeight: 0.24,     // pitch of the chase orbit
  },
  vehicle: {
    enterDist: 3.6,        // how close Riko must be to press E
  },
  traffic: {
    count: 16,             // active AI cars around the player
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
  render: {
    pixelRatioCap: 1.5,
    shadowMapSize: 2048,
    shadowRadius: 70,      // ortho half-size of the sun shadow frustum around the player
    fogNear: 70,
    fogFar: 430,
    fogColor: 0xffb27a,
    skyTop: 0x6fc3e8,
    skyHorizon: 0xffa25e,
    sunColor: 0xffd9a6,
    sunIntensity: 2.6,
    hemiSky: 0xbfe3ff,
    hemiGround: 0xffcf9e,
    hemiIntensity: 0.85,
  },
  palette: {
    // art-deco pastels for building bodies
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
