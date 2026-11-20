// Neon Bay — story data: seven sequential jobs carrying Riko from ferry arrival to a made Tidewater seat.
export const STORY = [
  {
    id: 'welcome', name: 'Welcome to the Bay', type: 'talk', reward: 150,
    giver: { name: 'Dex Ortega', x: 7.5, z: 20 },
    objective: 'Talk to Dex Ortega by the Coral Court lot',
    dialog: [
      'Fresh off the ferry? Neon Bay eats newcomers for breakfast.',
      "I'm Dex — I fix things for the Tidewater Crew. Do right by us and you'll eat too.",
      'Stick around. The bay lights look better when you own a piece of them.',
    ],
  },
  {
    id: 'errand', name: 'Sidewalk Errand', type: 'goto', reward: 250,
    giver: { name: 'Dex Ortega', x: 7.5, z: 20 },
    objective: 'Deliver the sealed package to Coral Plaza',
    target: { x: -20, z: -12.5, r: 4 },
    dialog: [
      'A sealed package. No questions, no opening it, no losing it.',
      'Drop it by the Coral Plaza fountain. Walk fast, smile at the cameras.',
    ],
  },
  {
    id: 'pinkslip', name: 'Pink Slip', type: 'steal', reward: 400,
    giver: { name: 'Dex Ortega', x: 7.5, z: 20 },
    objective: 'Steal the pink Comet sport car',
    car: { type: 'sport', color: 0xff2f92, x: 43, z: 57 },
    drop: { x: -60, z: -60, r: 7 },
    dialog: [
      'A collector parked his pink Comet on the east curb. The Crew wants it.',
      'Bring it to the Harbor Court lot. Scratches cost you, Riko.',
    ],
  },
  {
    id: 'tailspin', name: 'Tail Spin', type: 'chase', reward: 600,
    giver: { name: 'Dex Ortega', x: 7.5, z: 20 },
    objective: 'Corner the snitch in the violet van — stay close or wreck it',
    van: { x: -30, z: -77, road: -80 },
    dialog: [
      'Our bookkeeper sold routes to the Saltline Kings. He runs in a violet van.',
      'Box him in for two seconds or total the van — your call.',
    ],
  },
  {
    id: 'heatwave', name: 'Heat Wave', type: 'escape', reward: 700,
    giver: { name: 'Dex Ortega', x: 7.5, z: 20 },
    objective: 'Shake the Neon Bay PD — survive until every star clears',
    stars: 2,
    dialog: [
      'PD flagged your plates after that van stunt. Two stars, maybe more.',
      'Break their line of sight and keep it broken. The Crew watches how you cool off.',
    ],
  },
  {
    id: 'sprint', name: 'Bayfront Sprint', type: 'race', reward: 900,
    giver: { name: 'Marea Vega', x: 20, z: 47.5 },
    objective: 'Drive the Bayfront Sprint — hit every checkpoint before time runs out',
    cps: [[123, 90], [123, 10], [123, -70], [80, -80], [40, -40], [40, 20]],
    time: 100,
    dialog: [
      "Marea Vega. I run the Crew's wheels — and Dex says you're quick.",
      'Six checkpoints down the coast road, hundred seconds. Bring a car and nerve.',
      'The Kings bet against you — make them pay.',
    ],
  },
  {
    id: 'rising', name: 'Tidewater Rising', type: 'shootout', reward: 1200,
    giver: { name: 'Marea Vega', x: 20, z: 47.5 },
    objective: 'Clear the Saltline Kings off the pier',
    spots: [[165, 0], [172, 2], [172, -2], [180, 0]],
    dialog: [
      'The Saltline Kings took the pier tonight. That is Crew water.',
      'Four of them, armed. Take it back and the Tidewater seat is yours.',
      'Make it loud, Riko. The whole bay should hear who owns the tide.',
    ],
  },
];
export const STORY_END = 'Riko is made — the Tidewater Crew runs Neon Bay. Free roam unlocked.';