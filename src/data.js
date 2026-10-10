// Duskhollow content data. All names and dialogue are original.
// Dialogue: "greeting" plays on the first talk; after that, a random line from "gossip" is used.
window.NPCS = [
  {
    id: 'smith', sheet: 'npc_smith', name: 'Brannoc Ashby', role: 'Blacksmith',
    x: 25, y: 15, face: 6, tint: 0xffffff,
    greeting: [
      "You've got the look of someone about to do something foolish. Good. Fools buy steel.",
      "The forge hasn't gone cold in nine nights. Every blade I make, someone takes below and never brings back."
    ],
    gossip: [
      ["Bring me iron from the old crypts and I'll make you something worth dying in.", "Not today, though. The bellows are cracked, and so is my patience."],
      ["Mother Maelis patches up what's left of the brave ones. I just sharpen what they carry in."],
      ["Ezra says the abbey bells rang on their own the night the crypt opened. I didn't hear them.", "...I don't sleep much anymore."]
    ]
  },
  {
    id: 'healer', sheet: 'npc_healer', name: 'Mother Maelis', role: 'Healer',
    x: 15, y: 24, face: 4, tint: 0xffffff,
    greeting: [
      "Peace, child. You still have color in your cheeks. That is rarer here than you'd think.",
      "Come to me when the dark has bitten you. I ask no coin for mending. Only that you come back to be mended."
    ],
    gossip: [
      ["The well-water has turned bitter. I boil it with sage and say the old words over it. It helps... a little."],
      ["The young Harrow boy sleepwalks to the abbey gate every night. Every night, we carry him home.", "He says someone below is calling his name."],
      ["Wren pours a gentle cup, but she listens more than she lets on. Ask her what the hunters whisper."]
    ]
  },
  {
    id: 'innkeeper', sheet: 'npc_innkeeper', name: 'Old Tobin', role: 'Keeper of the Lantern Inn',
    x: 13, y: 15, face: 6, tint: 0xf0e0c8,
    greeting: [
      "Ah! A new face, and still breathing. Welcome to the Lantern, friend. Last inn before the end of the world.",
      "We used to be a waystation for pilgrims. Now we're a waystation for the brave and the soon-forgotten."
    ],
    gossip: [
      ["Keep the lantern over my door lit, I tell Wren. As long as it burns, folk know Duskhollow still stands."],
      ["Three hunters went into the crypts at harvest moon. Only their dog came back. It won't stop howling at the abbey."],
      ["The fellow by the cart? Silas. Showed up the day the dead first walked. Funny timing, that."]
    ]
  },
  {
    id: 'sage', sheet: 'npc_sage', name: 'Ezra Vane', role: 'Elder & Keeper of Lore',
    x: 22, y: 18, face: 7, tint: 0xd8d8ff,
    greeting: [
      "Sit, if you have a moment. Few do anymore. They rush past the fire to the abbey and its hungry stairs.",
      "Beneath the abbey lie older halls, and beneath those, older still. The Order sealed something there. The seal is breaking."
    ],
    gossip: [
      ["Bring me anything strange you find below. Rings that hum, blades that weep. I can name what they are... for a price, in time."],
      ["The fire in the square was lit by the founders. It has never gone out. I mean to keep it so."],
      ["The stones in the old graveyard lean toward the abbey now. A month ago, they stood straight.", "Mark that. The earth knows before we do."]
    ]
  },
  {
    id: 'barmaid', sheet: 'npc_barmaid', name: 'Wren', role: 'Barmaid at the Lantern',
    x: 16, y: 15, face: 6, tint: 0xffe8e0,
    greeting: [
      "Oh! Sorry, you startled me. Everyone's jumpy since the bells.",
      "If you're hungry, Tobin's stew is mostly turnip. If you're brave, it's mostly something else."
    ],
    gossip: [
      ["My grandmother says the abbey was a holy place once. She says the brothers sang so sweetly the birds went quiet to listen."],
      ["Brannoc pretends he's made of iron, but I've seen him leave candles at the graveyard gate."],
      ["I dream of the city sometimes. Bright streets, no fog.", "Then I wake up and the fog is still here. So am I."]
    ]
  },
  {
    id: 'trader', sheet: 'npc_trader', name: 'Silas Crowe', role: 'Peddler of Curiosities',
    x: 31, y: 23, face: 2, tint: 0xc8c8c8,
    greeting: [
      "Psst. Over here, by the cart. No, don't look at the abbey, look at me.",
      "I've got things the smith can't forge and the old man can't name. Only one at a time, mind. Good things are shy."
    ],
    gossip: [
      ["A look costs coin, friend. Information always does. Come back when your purse is heavier.", "(His shop is not open yet.)"],
      ["Where do I get my wares? Here and there. Mostly there.", "Don't ask where 'there' is."],
      ["The innkeeper doesn't trust me. Smart man. I wouldn't trust me either. But I'm the only one here selling hope."]
    ]
  }
];

window.SIGNS = {
  crypt: { name: 'The Abbey Stairs', role: 'Sealed', lines: [
    "Iron bands and wax seals bar the old stairs beneath the abbey. Something scratches, very faintly, on the other side.",
    "Not yet. (The dungeon comes in the next build.)"
  ]},
  signpost: { name: 'Weathered Signpost', role: '', lines: [
    "DUSKHOLLOW. Pilgrims, keep to the road. Do not answer voices from the fog."
  ]},
  tower: { name: 'Ruined Bell Tower', role: '', lines: [
    "The old bell tower fell the winter the brothers vanished. Its stair still climbs, broken, into nothing."
  ]}
};
