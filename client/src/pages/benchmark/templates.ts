// ─────────────────────────────────────────────────────────────────────────────
// Subject templates — pre-written subjects covering all 80 subcategories.
//
// Prompts describe ONLY what the object is. View, background, style, aspect
// and material are injected server-side via the UI controls — do NOT include
// them here (no "isolated on neutral background", "front view", etc.)
// ─────────────────────────────────────────────────────────────────────────────

export interface SubjectTemplate {
  name: string;
  categoryId: string;
  generationPrompt: string;
}

const C = {
  // Characters & Avatars
  HERO:          '40000000-0000-0000-0000-000000000001',
  VILLAIN:       '40000000-0000-0000-0000-000000000002',
  NPC:           '40000000-0000-0000-0000-000000000003',
  AVATAR:        '40000000-0000-0000-0000-000000000004',
  FANTASY_CHAR:  '40000000-0000-0000-0000-000000000005',
  SCIFI_CHAR:    '40000000-0000-0000-0000-000000000006',
  ANIME:         '40000000-0000-0000-0000-000000000007',
  HISTORICAL:    '40000000-0000-0000-0000-000000000008',
  // Creatures & Animals
  FANTASY_CREAT: '40000000-0000-0000-0000-000000000011',
  ALIEN:         '40000000-0000-0000-0000-000000000012',
  WILDLIFE:      '40000000-0000-0000-0000-000000000013',
  UNDEAD:        '40000000-0000-0000-0000-000000000014',
  MYTHOLOGICAL:  '40000000-0000-0000-0000-000000000015',
  FAMILIAR:      '40000000-0000-0000-0000-000000000016',
  BOSS:          '40000000-0000-0000-0000-000000000017',
  INSECT:        '40000000-0000-0000-0000-000000000018',
  // Vehicles & Mechs
  CAR:           '40000000-0000-0000-0000-000000000021',
  TANK:          '40000000-0000-0000-0000-000000000022',
  AIRCRAFT:      '40000000-0000-0000-0000-000000000023',
  SPACESHIP:     '40000000-0000-0000-0000-000000000024',
  BOAT:          '40000000-0000-0000-0000-000000000025',
  MECH:          '40000000-0000-0000-0000-000000000026',
  MOTORCYCLE:    '40000000-0000-0000-0000-000000000027',
  FANTASY_VEH:   '40000000-0000-0000-0000-000000000028',
  // Architecture & Environments
  BUILDING:      '40000000-0000-0000-0000-000000000031',
  CASTLE:        '40000000-0000-0000-0000-000000000032',
  INTERIOR:      '40000000-0000-0000-0000-000000000033',
  RUINS:         '40000000-0000-0000-0000-000000000034',
  DUNGEON:       '40000000-0000-0000-0000-000000000035',
  SCIFI_STRUCT:  '40000000-0000-0000-0000-000000000036',
  MODULAR:       '40000000-0000-0000-0000-000000000037',
  BRIDGE:        '40000000-0000-0000-0000-000000000038',
  // Weapons & Armor
  SWORD:         '40000000-0000-0000-0000-000000000041',
  AXE:           '40000000-0000-0000-0000-000000000042',
  BOW:           '40000000-0000-0000-0000-000000000043',
  GUN:           '40000000-0000-0000-0000-000000000044',
  POLEARM:       '40000000-0000-0000-0000-000000000045',
  SHIELD:        '40000000-0000-0000-0000-000000000046',
  ARMOR:         '40000000-0000-0000-0000-000000000047',
  THROWABLE:     '40000000-0000-0000-0000-000000000048',
  // Props & Items
  FURNITURE:     '40000000-0000-0000-0000-000000000051',
  HOUSEHOLD:     '40000000-0000-0000-0000-000000000052',
  ELECTRONICS:   '40000000-0000-0000-0000-000000000053',
  FOOD:          '40000000-0000-0000-0000-000000000054',
  CLOTHING:      '40000000-0000-0000-0000-000000000055',
  CONTAINER:     '40000000-0000-0000-0000-000000000056',
  TOOL:          '40000000-0000-0000-0000-000000000057',
  COLLECTIBLE:   '40000000-0000-0000-0000-000000000058',
  // Nature & Terrain
  TREE:          '40000000-0000-0000-0000-000000000061',
  BUSH:          '40000000-0000-0000-0000-000000000062',
  FLOWER:        '40000000-0000-0000-0000-000000000063',
  ROCK:          '40000000-0000-0000-0000-000000000064',
  TERRAIN:       '40000000-0000-0000-0000-000000000065',
  MUSHROOM:      '40000000-0000-0000-0000-000000000066',
  WATER:         '40000000-0000-0000-0000-000000000067',
  CRYSTAL:       '40000000-0000-0000-0000-000000000068',
  // Sci-Fi & Futuristic
  ROBOT:         '40000000-0000-0000-0000-000000000071',
  CYBERPUNK:     '40000000-0000-0000-0000-000000000072',
  SPACE_STATION: '40000000-0000-0000-0000-000000000073',
  DRONE:         '40000000-0000-0000-0000-000000000074',
  ALIEN_ART:     '40000000-0000-0000-0000-000000000075',
  ENERGY_WPN:    '40000000-0000-0000-0000-000000000076',
  HOLOGRAM:      '40000000-0000-0000-0000-000000000077',
  POWER_ARMOR:   '40000000-0000-0000-0000-000000000078',
  // Fantasy & Magic
  MAGIC_WPN:     '40000000-0000-0000-0000-000000000081',
  POTION:        '40000000-0000-0000-0000-000000000082',
  SPELL:         '40000000-0000-0000-0000-000000000083',
  ARTIFACT:      '40000000-0000-0000-0000-000000000084',
  TREASURE:      '40000000-0000-0000-0000-000000000085',
  GEM:           '40000000-0000-0000-0000-000000000086',
  SUMMON:        '40000000-0000-0000-0000-000000000087',
  SCROLL:        '40000000-0000-0000-0000-000000000088',
  // Cartoon & Animation
  CARTOON_CHAR:  '40000000-0000-0000-0000-000000000091',
  CHIBI:         '40000000-0000-0000-0000-000000000092',
  ANIME_CHAR:    '40000000-0000-0000-0000-000000000093',
  LOWPOLY:       '40000000-0000-0000-0000-000000000094',
  TOON_PROP:     '40000000-0000-0000-0000-000000000095',
  MASCOT:        '40000000-0000-0000-0000-000000000096',
  STORYBOOK:     '40000000-0000-0000-0000-000000000097',
  GAME_ICON:     '40000000-0000-0000-0000-000000000098',
};

export const SUBJECT_TEMPLATES: SubjectTemplate[] = [

  // ── Characters & Avatars ──────────────────────────────────────────────────
  { name: 'Male Warrior Hero',        categoryId: C.HERO,         generationPrompt: 'muscular male warrior in polished fantasy plate armor, heroic stance, short cape, sword at hip' },
  { name: 'Female Ranger Hero',       categoryId: C.HERO,         generationPrompt: 'slender female ranger in leather armor with a hood, holding a bow, quiver on back, determined expression' },
  { name: 'Paladin',                  categoryId: C.HERO,         generationPrompt: 'heavily armored paladin in gleaming golden plate armor with a glowing holy symbol on chest, wielding a two-handed hammer' },

  { name: 'Dark Lord',                categoryId: C.VILLAIN,      generationPrompt: 'menacing dark lord in black spiked armor, horned helmet, glowing red eyes, long tattered cape, corrupted sword' },
  { name: 'Evil Sorceress',           categoryId: C.VILLAIN,      generationPrompt: 'sinister female sorceress in dark flowing robes, long silver hair, crackling dark energy around one raised hand' },
  { name: 'Scarred Bounty Hunter',    categoryId: C.VILLAIN,      generationPrompt: 'scarred bounty hunter in worn battle armor loaded with gadgets and holstered weapons, menacing posture' },

  { name: 'Village Merchant',         categoryId: C.NPC,          generationPrompt: 'friendly middle-aged merchant in a simple brown tunic and apron, round belly, carrying a small satchel, warm smile' },
  { name: 'Blacksmith',               categoryId: C.NPC,          generationPrompt: 'stocky blacksmith in a leather apron, muscular arms, holding a hammer, soot-stained face' },
  { name: 'Old Wizard',               categoryId: C.NPC,          generationPrompt: 'wise old wizard with a long white beard, pointed hat covered in arcane symbols, leaning on a gnarled wooden staff' },

  { name: 'RPG Player Avatar',        categoryId: C.AVATAR,       generationPrompt: 'neutral adventurer avatar in simple leather armor, medium build, T-pose' },
  { name: 'Battle Royale Soldier',    categoryId: C.AVATAR,       generationPrompt: 'battle royale player character in tactical military gear, backpack, holstered weapons, standing upright' },
  { name: 'Cyber Avatar',             categoryId: C.AVATAR,       generationPrompt: 'futuristic player avatar in a slim bodysuit with glowing circuit patterns and a visor helmet' },

  { name: 'Wood Elf Archer',          categoryId: C.FANTASY_CHAR, generationPrompt: 'graceful wood elf archer in green and brown forest armor, long pointed ears, longbow in hand, leaf-patterned cloak' },
  { name: 'Dwarf Warrior',            categoryId: C.FANTASY_CHAR, generationPrompt: 'stocky dwarf with a braided red beard, heavy dwarven battle armor, large war axe over shoulder, wide stance' },
  { name: 'Dark Elf Rogue',           categoryId: C.FANTASY_CHAR, generationPrompt: 'lithe dark elf rogue in dark leather armor, dual daggers at hips, silvery hair, glowing amber eyes' },

  { name: 'Space Marine',             categoryId: C.SCIFI_CHAR,   generationPrompt: 'bulky space marine in futuristic power armor with helmet, shoulder pad markings, assault rifle held across chest' },
  { name: 'Cyberpunk Hacker',         categoryId: C.SCIFI_CHAR,   generationPrompt: 'slim cyberpunk hacker in a hooded jacket with glowing circuit lines, cybernetic arm implants' },
  { name: 'Alien Commander',          categoryId: C.SCIFI_CHAR,   generationPrompt: 'tall alien commander in sleek bio-mechanical armor, elongated head, four-fingered hands, glowing body markings' },

  { name: 'Anime Samurai',            categoryId: C.ANIME,        generationPrompt: 'anime-style samurai with spiky dark hair, traditional kimono-inspired armor, katana at hip, determined expression' },
  { name: 'Magical Girl',             categoryId: C.ANIME,        generationPrompt: 'anime magical girl in a colorful frilly dress, twin pigtails, holding a glowing magical wand, large expressive eyes' },
  { name: 'Anime Mecha Pilot',        categoryId: C.ANIME,        generationPrompt: 'anime mecha pilot in a form-fitting flight suit with a visor helmet, sleek futuristic design' },

  { name: 'Roman Legionnaire',        categoryId: C.HISTORICAL,   generationPrompt: 'Roman legionnaire soldier in lorica segmentata armor, crested helmet, rectangular scutum shield and gladius sword' },
  { name: 'Medieval Knight',          categoryId: C.HISTORICAL,   generationPrompt: 'medieval knight in full plate armor with a great helm, heraldic tabard, broadsword and kite shield' },
  { name: 'Feudal Samurai',           categoryId: C.HISTORICAL,   generationPrompt: 'feudal Japanese samurai in traditional o-yoroi lamellar armor, kabuto helmet, katana in guard stance' },

  // ── Creatures & Animals ──────────────────────────────────────────────────
  { name: 'Small Dragon',             categoryId: C.FANTASY_CREAT, generationPrompt: 'small compact dragon with folded wings, four legs, horned head, iridescent green and gold scales, crouching pose' },
  { name: 'Griffin',                  categoryId: C.FANTASY_CREAT, generationPrompt: 'noble griffin with the body of a lion and the wings and head of an eagle, standing proud, wings partially spread' },
  { name: 'Forest Troll',             categoryId: C.FANTASY_CREAT, generationPrompt: 'hunched forest troll with mossy green skin, large flat nose, long clawed fingers, bark-like skin texture' },

  { name: 'Grey Alien',               categoryId: C.ALIEN,         generationPrompt: 'classic grey alien with an oversized smooth head, large black almond-shaped eyes, slender frail body, three-fingered hands' },
  { name: 'Insectoid Alien',          categoryId: C.ALIEN,         generationPrompt: 'bipedal insectoid alien with a chitinous exoskeleton, compound eyes, four arms, antennae' },
  { name: 'Reptilian Alien Warrior',  categoryId: C.ALIEN,         generationPrompt: 'muscular reptilian alien warrior with scales, slit pupils, holding a plasma weapon' },

  { name: 'Grey Wolf',                categoryId: C.WILDLIFE,      generationPrompt: 'large grey wolf in a natural standing pose, detailed fur, alert ears, bushy tail' },
  { name: 'Brown Bear',               categoryId: C.WILDLIFE,      generationPrompt: 'large brown bear on all fours, thick fur, powerful build' },
  { name: 'Golden Eagle',             categoryId: C.WILDLIFE,      generationPrompt: 'golden eagle with wings fully spread in a soaring pose, detailed feathers, sharp talons' },

  { name: 'Skeleton Warrior',         categoryId: C.UNDEAD,        generationPrompt: 'animated skeleton warrior holding a rusty sword and rotting shield, eye sockets with faint blue glow, tattered cloth remnants' },
  { name: 'Zombie',                   categoryId: C.UNDEAD,        generationPrompt: 'shambling zombie with rotting grey skin, torn clothing, one outstretched arm, vacant expression' },
  { name: 'Ancient Lich',             categoryId: C.UNDEAD,        generationPrompt: 'ancient lich in tattered royal robes, skeletal face partially visible under hood, holding a glowing phylactery orb' },

  { name: 'Minotaur',                 categoryId: C.MYTHOLOGICAL,  generationPrompt: 'powerful minotaur with bull head and muscular humanoid body, massive horns, wielding a double-headed axe' },
  { name: 'Medusa',                   categoryId: C.MYTHOLOGICAL,  generationPrompt: 'Medusa with serpents for hair, partially human face, scaled lower body' },
  { name: 'Cerberus',                 categoryId: C.MYTHOLOGICAL,  generationPrompt: 'Cerberus the three-headed hellhound, each head snarling with bared teeth, muscular black dog body' },

  { name: 'Fairy Familiar',           categoryId: C.FAMILIAR,      generationPrompt: 'tiny fairy familiar with gossamer wings, glowing softly, delicate features, holding a small lantern' },
  { name: 'Baby Dragon',              categoryId: C.FAMILIAR,      generationPrompt: 'cute baby dragon familiar with stubby wings, big expressive eyes, sitting pose' },
  { name: 'Spirit Fox',               categoryId: C.FAMILIAR,      generationPrompt: 'spirit fox with a translucent ethereal body, multiple tails, soft glowing eyes' },

  { name: 'Stone Golem Boss',         categoryId: C.BOSS,          generationPrompt: 'massive stone golem with rough hewn rock body, glowing rune cracks, enormous fists raised' },
  { name: 'Kraken',                   categoryId: C.BOSS,          generationPrompt: 'kraken sea monster with a massive round body and multiple long tentacles spreading outward, glowing yellow eyes' },
  { name: 'Fire Dragon Boss',         categoryId: C.BOSS,          generationPrompt: 'massive fire dragon rearing up on hind legs, wings spread wide, mouth open with flames' },

  { name: 'Giant Scorpion',           categoryId: C.INSECT,        generationPrompt: 'giant scorpion with armored exoskeleton, large claws raised, segmented tail with venomous stinger' },
  { name: 'Giant Spider',             categoryId: C.INSECT,        generationPrompt: 'large hairy spider with multiple eyes, detailed arachnid body, eight legs spread' },
  { name: 'Rhinoceros Beetle',        categoryId: C.INSECT,        generationPrompt: 'large rhinoceros beetle with a prominent horn on its head, iridescent shell' },

  // ── Vehicles & Mechs ─────────────────────────────────────────────────────
  { name: 'Sports Car',               categoryId: C.CAR,           generationPrompt: 'sleek sports car with low aerodynamic body, wide fenders, large alloy wheels' },
  { name: 'Monster Truck',            categoryId: C.CAR,           generationPrompt: 'massive monster truck with enormous oversized wheels, lifted suspension, aggressive body kit' },
  { name: 'Off-Road Buggy',           categoryId: C.CAR,           generationPrompt: 'compact off-road buggy with exposed roll cage, large all-terrain tires, open cockpit' },

  { name: 'Battle Tank',              categoryId: C.TANK,          generationPrompt: 'heavy battle tank with a long cannon barrel, reactive armor panels, tank tracks' },
  { name: 'Armored APC',              categoryId: C.TANK,          generationPrompt: 'armored personnel carrier with a top-mounted machine gun, boxy armored body, thick tracks' },
  { name: 'Anti-Aircraft Vehicle',    categoryId: C.TANK,          generationPrompt: 'wheeled anti-aircraft vehicle with twin rotating barrels pointing upward, radar dish on back' },

  { name: 'Fighter Jet',              categoryId: C.AIRCRAFT,      generationPrompt: 'sleek fighter jet with swept wings, twin engines, cockpit canopy, missiles under wings' },
  { name: 'Propeller Biplane',        categoryId: C.AIRCRAFT,      generationPrompt: 'vintage propeller biplane with two stacked wings, open cockpit, round engine cowling' },
  { name: 'Attack Helicopter',        categoryId: C.AIRCRAFT,      generationPrompt: 'attack helicopter with tandem cockpit, stub wings with missiles, chin-mounted gun turret, tail rotor' },

  { name: 'Scout Spaceship',          categoryId: C.SPACESHIP,     generationPrompt: 'small nimble scout spaceship with swept wings, single cockpit, smooth hull' },
  { name: 'Heavy Cruiser',            categoryId: C.SPACESHIP,     generationPrompt: 'massive heavy cruiser battleship with multiple gun turrets, engine pods, elongated hull' },
  { name: 'Flying Saucer',            categoryId: C.SPACESHIP,     generationPrompt: 'classic disc-shaped flying saucer with a dome on top, smooth metallic surface, landing gear extended' },

  { name: 'Pirate Ship',              categoryId: C.BOAT,          generationPrompt: 'wooden pirate sailing ship with three masts, tattered sails, cannon ports along the hull' },
  { name: 'Speed Boat',               categoryId: C.BOAT,          generationPrompt: 'sleek modern speed boat with a pointed bow, outboard engine, low profile' },
  { name: 'Viking Longship',          categoryId: C.BOAT,          generationPrompt: 'Viking longship with a carved dragon prow, rows of oars, striped sail' },

  { name: 'Biped Combat Mech',        categoryId: C.MECH,          generationPrompt: 'bipedal combat mech with heavy shoulder cannons, thick armor plating, reverse-joint legs' },
  { name: 'Spider Mech Walker',       categoryId: C.MECH,          generationPrompt: 'spider-like mech walker with six articulated legs, central armored body, mounted weapons on top' },
  { name: 'Industrial Loader Mech',   categoryId: C.MECH,          generationPrompt: 'industrial loader exo-frame mech with open cockpit, pilot seat, large claw manipulators, yellow and grey colors' },

  { name: 'Sport Motorcycle',         categoryId: C.MOTORCYCLE,    generationPrompt: 'sleek sport motorcycle with full aerodynamic fairing, low handlebars, large disc brakes' },
  { name: 'Chopper Bike',             categoryId: C.MOTORCYCLE,    generationPrompt: 'classic chopper motorcycle with extended front forks, low seat, custom exhaust pipes' },
  { name: 'Hover Bike',               categoryId: C.MOTORCYCLE,    generationPrompt: 'futuristic hover bike with no wheels, sleek angular body, glowing thrusters underneath' },

  { name: 'Fantasy Carriage',         categoryId: C.FANTASY_VEH,   generationPrompt: 'ornate fantasy horse-drawn carriage with gilded trim, lanterns, large wooden wheels with iron rims, no horses' },
  { name: 'Steampunk Airship',        categoryId: C.FANTASY_VEH,   generationPrompt: 'steampunk fantasy airship with a large balloon envelope, wooden gondola below, multiple propellers, rigging ropes' },
  { name: 'War Chariot',              categoryId: C.FANTASY_VEH,   generationPrompt: 'fantasy war chariot with ornate design, blade wheels, carved dragon head on front' },

  // ── Architecture & Environments ──────────────────────────────────────────
  { name: 'Fantasy Cottage',          categoryId: C.BUILDING,      generationPrompt: 'cozy fantasy cottage with a thatched roof, stone walls, wooden shutters, flowers around the entrance' },
  { name: 'Sci-Fi Office Tower',      categoryId: C.BUILDING,      generationPrompt: 'sleek sci-fi office tower with glass and metal facade, clean geometric lines, antenna on top' },
  { name: 'Japanese Pagoda',          categoryId: C.BUILDING,      generationPrompt: 'three-tiered Japanese pagoda with curved eaves, red lacquered columns, stone base' },

  { name: 'Medieval Castle',          categoryId: C.CASTLE,        generationPrompt: 'compact medieval castle with a central keep, corner towers, crenellated battlements, portcullis gate' },
  { name: 'Dark Gothic Citadel',      categoryId: C.CASTLE,        generationPrompt: 'dark gothic citadel with twisted spires, gargoyles on the walls, jagged battlements' },
  { name: 'Dwarven Fortress Gate',    categoryId: C.CASTLE,        generationPrompt: 'massive dwarven fortress gate carved into a mountainside, heavy stone doors with rune carvings' },

  { name: 'Dungeon Cell',             categoryId: C.INTERIOR,      generationPrompt: 'dark dungeon prison cell with stone walls, iron-barred door, straw on floor, torch sconce on wall' },
  { name: 'Medieval Tavern',          categoryId: C.INTERIOR,      generationPrompt: 'cozy medieval tavern interior with wooden tables, fireplace, barrel in corner, mounted deer head on wall' },
  { name: 'Sci-Fi Command Bridge',    categoryId: C.INTERIOR,      generationPrompt: 'sci-fi spacecraft command bridge with holographic displays, captain chair in center, control panels' },

  { name: 'Ancient Greek Ruins',      categoryId: C.RUINS,         generationPrompt: 'crumbling ancient Greek temple ruins with broken marble columns, overgrown with ivy' },
  { name: 'Mayan Pyramid',            categoryId: C.RUINS,         generationPrompt: 'stepped Mayan pyramid with intricate stone carvings, partially covered in vegetation' },
  { name: 'Sunken Ruin Fragment',     categoryId: C.RUINS,         generationPrompt: 'sunken underwater ruin wall fragment with barnacle-encrusted stone, coral growing on it, seaweed' },

  { name: 'Cave Entrance',            categoryId: C.DUNGEON,       generationPrompt: 'dark cave entrance set into a rocky cliff face, stalactites visible inside, eerie glow from within' },
  { name: 'Crystal Cave Chamber',     categoryId: C.DUNGEON,       generationPrompt: 'cave chamber with large glowing crystal formations jutting from walls and floor, bioluminescent light' },
  { name: 'Stone Dungeon Corridor',   categoryId: C.DUNGEON,       generationPrompt: 'stone dungeon corridor with torches on the wall, iron-banded door at the end, worn stone floor' },

  { name: 'Space Station Module',     categoryId: C.SCIFI_STRUCT,  generationPrompt: 'cylindrical space station module with solar panels, docking ports, and antenna arrays' },
  { name: 'Sci-Fi Research Lab',      categoryId: C.SCIFI_STRUCT,  generationPrompt: 'compact sci-fi research lab building with large windows, antenna arrays, heavy blast doors' },
  { name: 'Energy Generator Tower',   categoryId: C.SCIFI_STRUCT,  generationPrompt: 'tall sci-fi energy generator tower with glowing plasma coils, exhaust vents, caution markings' },

  { name: 'Stone Wall Segment',       categoryId: C.MODULAR,       generationPrompt: 'single modular stone wall segment with crenellations on top, dressed stone surface' },
  { name: 'Sci-Fi Corridor Panel',    categoryId: C.MODULAR,       generationPrompt: 'sci-fi corridor wall panel with integrated pipe details, lighting strips, and ventilation grilles' },
  { name: 'Wooden Platform',          categoryId: C.MODULAR,       generationPrompt: 'square wooden platform with rope railings and a ladder on one side' },

  { name: 'Medieval Stone Bridge',    categoryId: C.BRIDGE,        generationPrompt: 'medieval stone arch bridge with mossy stones and parapet walls on both sides' },
  { name: 'Rope Bridge',              categoryId: C.BRIDGE,        generationPrompt: 'rickety rope bridge with wooden planks and frayed rope handrails' },
  { name: 'Sci-Fi Force Bridge',      categoryId: C.BRIDGE,        generationPrompt: 'sci-fi bridge with glowing blue force field panels as walkway, supported by metal pylons' },

  // ── Weapons & Armor ──────────────────────────────────────────────────────
  { name: 'Medieval Broadsword',      categoryId: C.SWORD,         generationPrompt: 'medieval broadsword with a straight double-edged blade, cross-guard, leather-wrapped grip, round pommel' },
  { name: 'Fantasy Greatsword',       categoryId: C.SWORD,         generationPrompt: 'massive fantasy two-handed greatsword with runes etched in the blade, ornate guard with gemstones' },
  { name: 'Japanese Katana',          categoryId: C.SWORD,         generationPrompt: 'Japanese katana with a curved single-edged blade, round tsuba guard, wrapped tsuka handle' },

  { name: 'War Axe',                  categoryId: C.AXE,           generationPrompt: 'single-bladed war axe with a wide crescent blade, rough iron finish, wooden shaft' },
  { name: 'Dwarven War Hammer',       categoryId: C.AXE,           generationPrompt: 'massive dwarven war hammer with a square head, carved runes, short thick shaft' },
  { name: 'Double-Headed Axe',        categoryId: C.AXE,           generationPrompt: 'double-headed fantasy axe with ornate crescent blades on both sides, long central haft' },

  { name: 'Longbow',                  categoryId: C.BOW,           generationPrompt: 'tall wooden longbow with a nocked arrow and bowstring' },
  { name: 'Medieval Crossbow',        categoryId: C.BOW,           generationPrompt: 'medieval crossbow with a wooden stock, metal prod, and a bolt loaded in the track' },
  { name: 'Elven Recurve Bow',        categoryId: C.BOW,           generationPrompt: 'elven recurve bow with elegant curved tips and leaf motif decorations carved into the limbs' },

  { name: 'Revolver Pistol',          categoryId: C.GUN,           generationPrompt: 'classic six-shooter revolver with a wooden grip and visible cylinder' },
  { name: 'Assault Rifle',            categoryId: C.GUN,           generationPrompt: 'modern assault rifle with a suppressor, scope, and folding stock' },
  { name: 'Plasma Pistol',            categoryId: C.GUN,           generationPrompt: 'sleek sci-fi plasma pistol with a glowing energy cell, angular futuristic design' },

  { name: 'Medieval Spear',           categoryId: C.POLEARM,       generationPrompt: 'medieval spear with a leaf-shaped iron tip and long wooden shaft' },
  { name: 'Fantasy Halberd',          categoryId: C.POLEARM,       generationPrompt: 'fantasy halberd with a large axe blade, spike on top, hook on back, long pole shaft' },
  { name: 'Wizard Staff',             categoryId: C.POLEARM,       generationPrompt: 'gnarled wizard staff with a glowing crystal orb at the top and carved magical symbols along the shaft' },

  { name: 'Kite Shield',              categoryId: C.SHIELD,        generationPrompt: 'medieval kite shield with a painted heraldic crest, metal boss at center, worn leather edging' },
  { name: 'Viking Round Shield',      categoryId: C.SHIELD,        generationPrompt: 'circular Viking shield with an iron boss at center, wooden planks with painted pattern' },
  { name: 'Energy Shield',            categoryId: C.SHIELD,        generationPrompt: 'futuristic arm-mounted energy shield with a transparent blue force field emanating from it' },

  { name: 'Knight Great Helm',        categoryId: C.ARMOR,         generationPrompt: 'full-face medieval knight great helm with a T-shaped visor and detailed metalwork' },
  { name: 'Fantasy Pauldron',         categoryId: C.ARMOR,         generationPrompt: 'fantasy shoulder pauldron with layered armor plates and decorative spikes' },
  { name: 'Viking Helmet',            categoryId: C.ARMOR,         generationPrompt: 'Viking helmet with a rounded iron cap and nose guard, no horns' },

  { name: 'Fantasy Fire Bomb',        categoryId: C.THROWABLE,     generationPrompt: 'small clay pot filled with glowing orange fire oil, wrapped in a cloth wick' },
  { name: 'Frag Grenade',             categoryId: C.THROWABLE,     generationPrompt: 'classic pineapple-style fragmentation grenade with pull pin and safety lever' },
  { name: 'Shuriken',                 categoryId: C.THROWABLE,     generationPrompt: 'metal four-pointed ninja throwing star with sharp blades' },

  // ── Props & Items ─────────────────────────────────────────────────────────
  { name: 'Wooden Chair',             categoryId: C.FURNITURE,     generationPrompt: 'simple wooden chair with four legs and a ladder-back' },
  { name: 'Fantasy Throne',           categoryId: C.FURNITURE,     generationPrompt: 'ornate fantasy throne with carved stone armrests, padded velvet seat, elaborate crown-shaped back' },
  { name: 'Bookshelf',                categoryId: C.FURNITURE,     generationPrompt: 'tall wooden bookshelf filled with books of various sizes and colors' },

  { name: 'Iron Cooking Cauldron',    categoryId: C.HOUSEHOLD,     generationPrompt: 'large iron cooking cauldron with a handle and lid' },
  { name: 'Oak Barrel',               categoryId: C.HOUSEHOLD,     generationPrompt: 'classic oak wooden barrel with iron hoops and a bung hole on the side' },
  { name: 'Oil Lantern',              categoryId: C.HOUSEHOLD,     generationPrompt: 'old oil lantern with a glass chimney, metal frame, burning flame inside, handle on top' },

  { name: 'Laptop Computer',          categoryId: C.ELECTRONICS,   generationPrompt: 'modern laptop computer with screen open showing a glowing display' },
  { name: 'Sci-Fi Data Pad',          categoryId: C.ELECTRONICS,   generationPrompt: 'futuristic data pad with a holographic glowing screen and sleek metallic casing' },
  { name: 'Military Walkie Talkie',   categoryId: C.ELECTRONICS,   generationPrompt: 'chunky military walkie-talkie radio with antenna, buttons, and small screen' },

  { name: 'Roast Chicken',            categoryId: C.FOOD,          generationPrompt: 'golden-brown roasted whole chicken on a wooden platter with herbs' },
  { name: 'Medieval Feast Tray',      categoryId: C.FOOD,          generationPrompt: 'medieval wooden tray with a bread loaf, goblet of wine, cheese wedge, and a red apple' },
  { name: 'Health Potion Drink',      categoryId: C.FOOD,          generationPrompt: 'small bottle of glowing red health potion with a cork stopper and label' },

  { name: 'Fantasy Cape',             categoryId: C.CLOTHING,      generationPrompt: 'long flowing fantasy cloak with hood and clasp at neck, displayed on an invisible mannequin' },
  { name: 'Combat Boots',             categoryId: C.CLOTHING,      generationPrompt: 'pair of heavy military combat boots, laced up, worn leather texture' },
  { name: 'Wizard Hat',               categoryId: C.CLOTHING,      generationPrompt: 'tall pointed wizard hat with stars and moon patterns, slightly bent tip' },

  { name: 'Treasure Chest',           categoryId: C.CONTAINER,     generationPrompt: 'classic wooden treasure chest with iron fittings, padlock, slightly open lid showing coins inside' },
  { name: 'Magic Crate',              categoryId: C.CONTAINER,     generationPrompt: 'wooden crate with glowing arcane symbols branded onto the wood and metal corner brackets' },
  { name: 'Adventurer Backpack',      categoryId: C.CONTAINER,     generationPrompt: 'well-worn leather adventurer backpack with multiple buckled pouches and a bedroll strapped on top' },

  { name: 'Blacksmith Hammer',        categoryId: C.TOOL,          generationPrompt: 'heavy blacksmith hammer with a flat striking face and wooden handle' },
  { name: 'Mining Pickaxe',           categoryId: C.TOOL,          generationPrompt: 'mining pickaxe with a metal double head and worn wooden handle' },
  { name: 'Shovel',                   categoryId: C.TOOL,          generationPrompt: 'sturdy round-point shovel with metal blade and wooden shaft' },

  { name: 'Golden Trophy Cup',        categoryId: C.COLLECTIBLE,   generationPrompt: 'shiny gold trophy cup with two handles, mounted on a base with a star emblem' },
  { name: 'Crystal Skull',            categoryId: C.COLLECTIBLE,   generationPrompt: 'life-sized crystal skull made of clear quartz with detailed teeth and eye sockets' },
  { name: 'Ancient Gold Coin',        categoryId: C.COLLECTIBLE,   generationPrompt: 'large ancient gold coin with a king profile embossed on one face and raised edge detail' },

  // ── Nature & Terrain ─────────────────────────────────────────────────────
  { name: 'Oak Tree',                 categoryId: C.TREE,          generationPrompt: 'large mature oak tree with a wide gnarled trunk, spreading branches, full green canopy' },
  { name: 'Dead Twisted Tree',        categoryId: C.TREE,          generationPrompt: 'bare dead tree with gnarled twisted branches, no leaves, cracked grey bark' },
  { name: 'Fantasy Magic Tree',       categoryId: C.TREE,          generationPrompt: 'fantasy magic tree with a glowing trunk, luminous floating leaves, roots slightly lifted' },

  { name: 'Round Hedge Bush',         categoryId: C.BUSH,          generationPrompt: 'neatly rounded garden hedge bush with dense green foliage' },
  { name: 'Wild Thorny Bush',         categoryId: C.BUSH,          generationPrompt: 'wild thorny bush with sharp spines and sparse green leaves' },
  { name: 'Saguaro Cactus',           categoryId: C.BUSH,          generationPrompt: 'tall saguaro cactus with two raised arms and visible spines' },

  { name: 'Sunflower',                categoryId: C.FLOWER,        generationPrompt: 'tall sunflower with a large yellow bloom and green stalk with leaves' },
  { name: 'Red Rose Cluster',         categoryId: C.FLOWER,        generationPrompt: 'cluster of red roses with leaves and thorns on stems' },
  { name: 'Glowing Magic Flower',     categoryId: C.FLOWER,        generationPrompt: 'magical blue flower with luminescent petals and floating sparkle particles around it' },

  { name: 'Mossy Rock Cluster',       categoryId: C.ROCK,          generationPrompt: 'cluster of three mossy rocks of varying sizes with rough granite texture' },
  { name: 'Giant Boulder',            categoryId: C.ROCK,          generationPrompt: 'massive single boulder with visible cracks and lichen growing on its surface' },
  { name: 'Volcanic Rock',            categoryId: C.ROCK,          generationPrompt: 'jagged dark volcanic rock with visible gas pockets and rough porous texture' },

  { name: 'Grassy Hill',              categoryId: C.TERRAIN,       generationPrompt: 'small grassy hill with rocky outcroppings on one side' },
  { name: 'Cliff Edge',               categoryId: C.TERRAIN,       generationPrompt: 'flat-topped cliff edge with a sheer vertical face showing rock strata layers' },
  { name: 'Sand Dune',                categoryId: C.TERRAIN,       generationPrompt: 'smooth crescent-shaped sand dune with wind ripple patterns on the surface' },

  { name: 'Giant Red Mushroom',       categoryId: C.MUSHROOM,      generationPrompt: 'large oversized red mushroom with white spots and a fat stalk' },
  { name: 'Mushroom Cluster',         categoryId: C.MUSHROOM,      generationPrompt: 'cluster of five small brown mushrooms growing from a mossy log base' },
  { name: 'Bioluminescent Mushroom',  categoryId: C.MUSHROOM,      generationPrompt: 'glowing bioluminescent fantasy mushroom with turquoise light emanating from its gills' },

  { name: 'Tiered Fountain',          categoryId: C.WATER,         generationPrompt: 'tiered stone fountain with water flowing between bowls' },
  { name: 'Waterfall',                categoryId: C.WATER,         generationPrompt: 'compact waterfall flowing over mossy rocks into a small pool' },
  { name: 'Wishing Well',             categoryId: C.WATER,         generationPrompt: 'classic stone and wood wishing well with a rope and bucket, wooden roof overhang' },

  { name: 'Amethyst Crystal Cluster', categoryId: C.CRYSTAL,       generationPrompt: 'cluster of large amethyst purple crystals with sharp faceted faces' },
  { name: 'Quartz Formation',         categoryId: C.CRYSTAL,       generationPrompt: 'white quartz crystal formation with multiple pointed spires growing from a rock base' },
  { name: 'Energy Crystal',           categoryId: C.CRYSTAL,       generationPrompt: 'tall glowing blue energy crystal, slightly translucent with inner light' },

  // ── Sci-Fi & Futuristic ──────────────────────────────────────────────────
  { name: 'Service Android',          categoryId: C.ROBOT,         generationPrompt: 'humanoid service android with a smooth white chassis and expressionless face with LED eyes' },
  { name: 'Combat Quad-Bot',          categoryId: C.ROBOT,         generationPrompt: 'four-legged combat robot with weapon mounts and armored chassis' },
  { name: 'Retro Tin Robot',          categoryId: C.ROBOT,         generationPrompt: 'retro 1950s-style tin robot with rivets, antenna, simple rectangular body, friendly face' },

  { name: 'Neon Street Sign',         categoryId: C.CYBERPUNK,     generationPrompt: 'glowing neon Japanese street sign with bright pink and blue neon tubes mounted on a pole' },
  { name: 'Cyberpunk Vending Machine', categoryId: C.CYBERPUNK,    generationPrompt: 'futuristic cyberpunk vending machine with holographic display, glowing product slots, neon trim' },
  { name: 'AR Visor',                 categoryId: C.CYBERPUNK,     generationPrompt: 'sleek augmented reality visor with HUD display visible and thin wraparound frame' },

  { name: 'Docking Clamp',            categoryId: C.SPACE_STATION, generationPrompt: 'large mechanical space station docking clamp mechanism with hydraulic arms' },
  { name: 'Solar Panel Array',        categoryId: C.SPACE_STATION, generationPrompt: 'space station solar panel array with blue photovoltaic cells on a folding arm' },
  { name: 'Airlock Door',             categoryId: C.SPACE_STATION, generationPrompt: 'heavy space station airlock door with wheel handle, warning stripes, pressure gauge' },

  { name: 'Quadcopter Drone',         categoryId: C.DRONE,         generationPrompt: 'consumer quadcopter drone with four propellers, camera pod underneath, compact body' },
  { name: 'Space Probe',              categoryId: C.DRONE,         generationPrompt: 'NASA-style space probe with solar panels, large dish antenna, scientific instruments on booms' },
  { name: 'Military Recon Drone',     categoryId: C.DRONE,         generationPrompt: 'military reconnaissance drone with swept wings and a camera pod underneath, no cockpit' },

  { name: 'Alien Monolith',           categoryId: C.ALIEN_ART,     generationPrompt: 'smooth featureless black alien monolith obelisk with faint glowing hieroglyphs on its surface' },
  { name: 'Alien Power Orb',          categoryId: C.ALIEN_ART,     generationPrompt: 'floating alien orb with a metallic shell, alien script etched on the surface, faint blue inner glow' },
  { name: 'Xenotech Device',          categoryId: C.ALIEN_ART,     generationPrompt: 'unknown alien technology device with crystalline protrusions, organic-looking connectors, bioluminescent glow' },

  { name: 'Laser Rifle',              categoryId: C.ENERGY_WPN,    generationPrompt: 'sci-fi laser rifle with a long barrel, energy cell magazine, glowing emitter at the muzzle' },
  { name: 'Plasma Cannon',            categoryId: C.ENERGY_WPN,    generationPrompt: 'heavy plasma cannon with a wide barrel and glowing coils, shoulder-mounted design' },
  { name: 'Energy Sword',             categoryId: C.ENERGY_WPN,    generationPrompt: 'sci-fi energy sword with a glowing plasma blade and metal hilt with activation button' },

  { name: 'Holographic Display',      categoryId: C.HOLOGRAM,      generationPrompt: 'floating holographic display screen with a translucent blue UI and minimal stand at the base' },
  { name: 'Data Sphere',              categoryId: C.HOLOGRAM,      generationPrompt: 'sphere of interconnected holographic data nodes floating in mid-air, glowing blue' },
  { name: 'Command Terminal',         categoryId: C.HOLOGRAM,      generationPrompt: 'futuristic command terminal with a curved holographic display and physical keyboard' },

  { name: 'Heavy Power Armor',        categoryId: C.POWER_ARMOR,   generationPrompt: 'massive power armor exo-suit with heavy plating, hydraulic limbs, glowing chest reactor' },
  { name: 'Light Exo-Skeleton',       categoryId: C.POWER_ARMOR,   generationPrompt: 'lightweight sci-fi exo-skeleton suit with exposed mechanical joints and smooth white panels' },
  { name: 'Hazmat Power Suit',        categoryId: C.POWER_ARMOR,   generationPrompt: 'futuristic hazmat power suit with sealed helmet, radiation symbols, heavy gloves' },

  // ── Fantasy & Magic ──────────────────────────────────────────────────────
  { name: 'Crystal Wizard Staff',     categoryId: C.MAGIC_WPN,     generationPrompt: 'twisted wizard staff with a large glowing crystal sphere at the top and carved runes along the shaft' },
  { name: 'Enchanted Sword',          categoryId: C.MAGIC_WPN,     generationPrompt: 'broadsword with glowing runes etched along the blade, ethereal energy wisps surrounding it, ornate hilt' },
  { name: 'Druidic Nature Staff',     categoryId: C.MAGIC_WPN,     generationPrompt: 'staff made from intertwined living wood branches with glowing green leaves growing from it' },

  { name: 'Health Potion',            categoryId: C.POTION,        generationPrompt: 'small round glass bottle glowing bright red with a cork stopper and wax seal' },
  { name: 'Mana Potion',              categoryId: C.POTION,        generationPrompt: 'teardrop-shaped glass flask glowing deep blue with swirling mana essence visible inside' },
  { name: 'Poison Vial',              categoryId: C.POTION,        generationPrompt: 'small dark green glass vial with a skull label and bubbling poisonous liquid inside' },

  { name: 'Magic Portal Ring',        categoryId: C.SPELL,         generationPrompt: 'circular magical portal ring floating in air, swirling purple and blue energy inside, stone frame with rune carvings' },
  { name: 'Fire Spell Orb',           categoryId: C.SPELL,         generationPrompt: 'swirling ball of magical fire energy with red and orange flames and arcane sparks' },
  { name: 'Lightning Rune Stone',     categoryId: C.SPELL,         generationPrompt: 'flat rune stone with a glowing lightning bolt symbol etched into it, crackling energy emanating from the rune' },

  { name: 'Ancient Amulet',           categoryId: C.ARTIFACT,      generationPrompt: 'ancient golden amulet with a large gemstone at center, intricate filigree work, on a chain' },
  { name: 'Crystal Orb',              categoryId: C.ARTIFACT,      generationPrompt: 'polished crystal orb on an ornate stand with clawed feet, swirling magical mist inside' },
  { name: 'Cursed Idol',              categoryId: C.ARTIFACT,      generationPrompt: 'carved stone idol of an ancient god, faintly glowing with dark magic, hieroglyphs on its base' },

  { name: 'Treasure Chest',           categoryId: C.TREASURE,      generationPrompt: 'pirate treasure chest overflowing with gold coins, gems and jewels, wooden with iron banding, open lid' },
  { name: 'Royal Gold Crown',         categoryId: C.TREASURE,      generationPrompt: 'ornate king\'s crown made of gold with large inset rubies and diamonds' },
  { name: 'Pile of Gold Coins',       categoryId: C.TREASURE,      generationPrompt: 'neat pile of shining gold coins with embossed crowns visible on each face' },

  { name: 'Cut Ruby',                 categoryId: C.GEM,           generationPrompt: 'large faceted ruby gemstone, deep red color, multiple cut faces catching the light' },
  { name: 'Brilliant Diamond',        categoryId: C.GEM,           generationPrompt: 'brilliant-cut diamond with perfect facets and sparkling light reflections' },
  { name: 'Raw Emerald',              categoryId: C.GEM,           generationPrompt: 'rough-cut emerald with natural hexagonal crystal form and vivid green color' },

  { name: 'Demon Summoning Circle',   categoryId: C.SUMMON,        generationPrompt: 'dark ritual summoning circle with glowing runes in dark fire, pentagram at center, etched in stone' },
  { name: 'Divine Angel Glyph',       categoryId: C.SUMMON,        generationPrompt: 'divine summoning glyph with golden glowing runes and rays of light emanating from the center' },

  { name: 'Magic Scroll',             categoryId: C.SCROLL,        generationPrompt: 'old rolled-up magic scroll with visible rune text on yellowed parchment, tied with a red ribbon' },
  { name: 'Spellbook Tome',           categoryId: C.SCROLL,        generationPrompt: 'large leather-bound spellbook with a glowing cover emblem and metal clasp, open to show glowing illustrated pages' },
  { name: 'Fantasy Map',              categoryId: C.SCROLL,        generationPrompt: 'unrolled fantasy treasure map with glowing location markers, aged parchment texture, coastlines and terrain' },

  // ── Cartoon & Animation ──────────────────────────────────────────────────
  { name: 'Cartoon Pirate',           categoryId: C.CARTOON_CHAR,  generationPrompt: 'cartoon pirate with an exaggerated big head, hook hand, eye patch, striped shirt' },
  { name: 'Cartoon Wizard',           categoryId: C.CARTOON_CHAR,  generationPrompt: 'cute cartoon wizard with a big round head, oversized starry hat, tiny body, waving a wand' },
  { name: 'Friendly Cartoon Robot',   categoryId: C.CARTOON_CHAR,  generationPrompt: 'friendly cartoon robot with a boxy body, round head with visor eyes, big cheery smile' },

  { name: 'Chibi Warrior',            categoryId: C.CHIBI,         generationPrompt: 'chibi warrior character with a huge head and tiny body, holding an oversized sword, adorable expression' },
  { name: 'Chibi Cat Girl',           categoryId: C.CHIBI,         generationPrompt: 'chibi catgirl with cat ears, large sparkling eyes, tiny cute body, paw-mittens' },
  { name: 'Chibi Baby Dragon',        categoryId: C.CHIBI,         generationPrompt: 'chibi baby dragon with stubby wings, huge eyes, round body, sitting cutely' },

  { name: 'Anime School Hero',        categoryId: C.ANIME_CHAR,    generationPrompt: 'anime high school hero in a school uniform with a cape, spiky hair, determined pose' },
  { name: 'Anime Ninja',              categoryId: C.ANIME_CHAR,    generationPrompt: 'anime female ninja in dark bodysuit, kunai in hand, headband, intense expression' },
  { name: 'Anime Demon Slayer',       categoryId: C.ANIME_CHAR,    generationPrompt: 'anime demon slayer in a patterned haori, holding a katana with flame effects' },

  { name: 'Low-Poly Tree',            categoryId: C.LOWPOLY,       generationPrompt: 'geometric low-poly tree with flat triangular faces, distinct polygon shapes, bright green and brown colors' },
  { name: 'Low-Poly Fox',             categoryId: C.LOWPOLY,       generationPrompt: 'geometric low-poly fox with angular faceted surfaces, orange and white colors' },
  { name: 'Voxel Knight',             categoryId: C.LOWPOLY,       generationPrompt: 'blocky voxel-art knight made of cubic voxels, simplified pixel-art style, sword and shield' },

  { name: 'Cartoon Bomb',             categoryId: C.TOON_PROP,     generationPrompt: 'classic cartoon round black bomb with a lit fuse and googly eyes' },
  { name: 'Toon Treasure Chest',      categoryId: C.TOON_PROP,     generationPrompt: 'cartoon exaggerated treasure chest with a big shiny padlock, overflowing with gold, plump round design' },
  { name: 'Bubble Cartoon Car',       categoryId: C.TOON_PROP,     generationPrompt: 'cartoony round bubble-shaped car with exaggerated proportions, big round wheels, headlights styled as eyes' },

  { name: 'Game Studio Mascot Robot', categoryId: C.MASCOT,        generationPrompt: 'friendly game studio mascot robot holding a game controller, small cute design' },
  { name: 'Sports Bear Mascot',       categoryId: C.MASCOT,        generationPrompt: 'sports team mascot bear in a jersey, fist pumped, exaggerated athletic build' },
  { name: 'Dragon Company Mascot',    categoryId: C.MASCOT,        generationPrompt: 'cute dragon company mascot with big eyes, holding a logo shield, friendly pose' },

  { name: 'Gingerbread House',        categoryId: C.STORYBOOK,     generationPrompt: 'whimsical gingerbread house with candy decorations, frosting trim, chocolate door, sugar window panes' },
  { name: 'Fairy Tale Castle',        categoryId: C.STORYBOOK,     generationPrompt: 'storybook fairy tale castle with pastel colors, round turrets, rainbow bridge, fluffy clouds around towers' },
  { name: 'Pumpkin Carriage',         categoryId: C.STORYBOOK,     generationPrompt: 'magical Cinderella pumpkin carriage glowing orange with golden filigree trim, fairy dust sparkles, no horses' },

  { name: 'Achievement Badge',        categoryId: C.GAME_ICON,     generationPrompt: 'game achievement badge in a shield shape with a star emblem at center, gold and silver colors' },
  { name: 'Rank Diamond Icon',        categoryId: C.GAME_ICON,     generationPrompt: 'game rank icon shaped like a diamond with a lightning bolt inside, purple gradient' },
  { name: 'Power-Up Coin',            categoryId: C.GAME_ICON,     generationPrompt: 'game power-up coin with a star embossed on its face, shiny gold color, slightly tilted' },
];

// Group templates by top-level category name (for display in the import modal)
export const TOP_CATEGORY_NAMES: Record<string, string> = {
  '30000000-0000-0000-0000-000000000001': 'Characters & Avatars',
  '30000000-0000-0000-0000-000000000002': 'Creatures & Animals',
  '30000000-0000-0000-0000-000000000003': 'Vehicles & Mechs',
  '30000000-0000-0000-0000-000000000004': 'Architecture & Environments',
  '30000000-0000-0000-0000-000000000005': 'Weapons & Armor',
  '30000000-0000-0000-0000-000000000006': 'Props & Items',
  '30000000-0000-0000-0000-000000000007': 'Nature & Terrain',
  '30000000-0000-0000-0000-000000000008': 'Sci-Fi & Futuristic',
  '30000000-0000-0000-0000-000000000009': 'Fantasy & Magic',
  '30000000-0000-0000-0000-00000000000a': 'Cartoon & Animation',
};

// Maps sub-category ID → top-level category ID
export const SUB_TO_TOP: Record<string, string> = {
  [C.HERO]: '30000000-0000-0000-0000-000000000001',
  [C.VILLAIN]: '30000000-0000-0000-0000-000000000001',
  [C.NPC]: '30000000-0000-0000-0000-000000000001',
  [C.AVATAR]: '30000000-0000-0000-0000-000000000001',
  [C.FANTASY_CHAR]: '30000000-0000-0000-0000-000000000001',
  [C.SCIFI_CHAR]: '30000000-0000-0000-0000-000000000001',
  [C.ANIME]: '30000000-0000-0000-0000-000000000001',
  [C.HISTORICAL]: '30000000-0000-0000-0000-000000000001',

  [C.FANTASY_CREAT]: '30000000-0000-0000-0000-000000000002',
  [C.ALIEN]: '30000000-0000-0000-0000-000000000002',
  [C.WILDLIFE]: '30000000-0000-0000-0000-000000000002',
  [C.UNDEAD]: '30000000-0000-0000-0000-000000000002',
  [C.MYTHOLOGICAL]: '30000000-0000-0000-0000-000000000002',
  [C.FAMILIAR]: '30000000-0000-0000-0000-000000000002',
  [C.BOSS]: '30000000-0000-0000-0000-000000000002',
  [C.INSECT]: '30000000-0000-0000-0000-000000000002',

  [C.CAR]: '30000000-0000-0000-0000-000000000003',
  [C.TANK]: '30000000-0000-0000-0000-000000000003',
  [C.AIRCRAFT]: '30000000-0000-0000-0000-000000000003',
  [C.SPACESHIP]: '30000000-0000-0000-0000-000000000003',
  [C.BOAT]: '30000000-0000-0000-0000-000000000003',
  [C.MECH]: '30000000-0000-0000-0000-000000000003',
  [C.MOTORCYCLE]: '30000000-0000-0000-0000-000000000003',
  [C.FANTASY_VEH]: '30000000-0000-0000-0000-000000000003',

  [C.BUILDING]: '30000000-0000-0000-0000-000000000004',
  [C.CASTLE]: '30000000-0000-0000-0000-000000000004',
  [C.INTERIOR]: '30000000-0000-0000-0000-000000000004',
  [C.RUINS]: '30000000-0000-0000-0000-000000000004',
  [C.DUNGEON]: '30000000-0000-0000-0000-000000000004',
  [C.SCIFI_STRUCT]: '30000000-0000-0000-0000-000000000004',
  [C.MODULAR]: '30000000-0000-0000-0000-000000000004',
  [C.BRIDGE]: '30000000-0000-0000-0000-000000000004',

  [C.SWORD]: '30000000-0000-0000-0000-000000000005',
  [C.AXE]: '30000000-0000-0000-0000-000000000005',
  [C.BOW]: '30000000-0000-0000-0000-000000000005',
  [C.GUN]: '30000000-0000-0000-0000-000000000005',
  [C.POLEARM]: '30000000-0000-0000-0000-000000000005',
  [C.SHIELD]: '30000000-0000-0000-0000-000000000005',
  [C.ARMOR]: '30000000-0000-0000-0000-000000000005',
  [C.THROWABLE]: '30000000-0000-0000-0000-000000000005',

  [C.FURNITURE]: '30000000-0000-0000-0000-000000000006',
  [C.HOUSEHOLD]: '30000000-0000-0000-0000-000000000006',
  [C.ELECTRONICS]: '30000000-0000-0000-0000-000000000006',
  [C.FOOD]: '30000000-0000-0000-0000-000000000006',
  [C.CLOTHING]: '30000000-0000-0000-0000-000000000006',
  [C.CONTAINER]: '30000000-0000-0000-0000-000000000006',
  [C.TOOL]: '30000000-0000-0000-0000-000000000006',
  [C.COLLECTIBLE]: '30000000-0000-0000-0000-000000000006',

  [C.TREE]: '30000000-0000-0000-0000-000000000007',
  [C.BUSH]: '30000000-0000-0000-0000-000000000007',
  [C.FLOWER]: '30000000-0000-0000-0000-000000000007',
  [C.ROCK]: '30000000-0000-0000-0000-000000000007',
  [C.TERRAIN]: '30000000-0000-0000-0000-000000000007',
  [C.MUSHROOM]: '30000000-0000-0000-0000-000000000007',
  [C.WATER]: '30000000-0000-0000-0000-000000000007',
  [C.CRYSTAL]: '30000000-0000-0000-0000-000000000007',

  [C.ROBOT]: '30000000-0000-0000-0000-000000000008',
  [C.CYBERPUNK]: '30000000-0000-0000-0000-000000000008',
  [C.SPACE_STATION]: '30000000-0000-0000-0000-000000000008',
  [C.DRONE]: '30000000-0000-0000-0000-000000000008',
  [C.ALIEN_ART]: '30000000-0000-0000-0000-000000000008',
  [C.ENERGY_WPN]: '30000000-0000-0000-0000-000000000008',
  [C.HOLOGRAM]: '30000000-0000-0000-0000-000000000008',
  [C.POWER_ARMOR]: '30000000-0000-0000-0000-000000000008',

  [C.MAGIC_WPN]: '30000000-0000-0000-0000-000000000009',
  [C.POTION]: '30000000-0000-0000-0000-000000000009',
  [C.SPELL]: '30000000-0000-0000-0000-000000000009',
  [C.ARTIFACT]: '30000000-0000-0000-0000-000000000009',
  [C.TREASURE]: '30000000-0000-0000-0000-000000000009',
  [C.GEM]: '30000000-0000-0000-0000-000000000009',
  [C.SUMMON]: '30000000-0000-0000-0000-000000000009',
  [C.SCROLL]: '30000000-0000-0000-0000-000000000009',

  [C.CARTOON_CHAR]: '30000000-0000-0000-0000-00000000000a',
  [C.CHIBI]: '30000000-0000-0000-0000-00000000000a',
  [C.ANIME_CHAR]: '30000000-0000-0000-0000-00000000000a',
  [C.LOWPOLY]: '30000000-0000-0000-0000-00000000000a',
  [C.TOON_PROP]: '30000000-0000-0000-0000-00000000000a',
  [C.MASCOT]: '30000000-0000-0000-0000-00000000000a',
  [C.STORYBOOK]: '30000000-0000-0000-0000-00000000000a',
  [C.GAME_ICON]: '30000000-0000-0000-0000-00000000000a',
};
