// ─────────────────────────────────────────────────────────────────────────────
// Subject templates — pre-written subjects covering all 80 subcategories.
// Each entry has a name, category ID (matching the DB seed), and a generation
// prompt tuned for clay/neutral-style 3D reference images.
//
// Usage: import in the Subjects page for the bulk-import modal.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubjectTemplate {
  name: string;
  categoryId: string;
  generationPrompt: string;
}

// Shorthand aliases for the 40000000... subcategory UUIDs
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
  { name: 'Male Warrior Hero',       categoryId: C.HERO,         generationPrompt: 'A muscular male warrior hero in polished fantasy plate armor, standing upright in a heroic pose, short cape, sword at hip, front view, isolated on neutral background, full body' },
  { name: 'Female Ranger Hero',      categoryId: C.HERO,         generationPrompt: 'A slender female ranger hero wearing leather armor with a hood, holding a bow, quiver on back, determined expression, front view, isolated on neutral background, full body' },
  { name: 'Paladin Hero',            categoryId: C.HERO,         generationPrompt: 'A heavily armored paladin in gleaming golden plate armor with a glowing holy symbol on chest, two-handed hammer in hand, isolated on neutral background, full body' },

  { name: 'Dark Lord Villain',       categoryId: C.VILLAIN,      generationPrompt: 'A menacing dark lord in black spiked armor, horned helmet, glowing red eyes, long tattered cape, holding a corrupted sword, isolated on neutral background, full body front view' },
  { name: 'Evil Sorceress',          categoryId: C.VILLAIN,      generationPrompt: 'A sinister female sorceress in dark flowing robes, long silver hair, one hand raised with crackling dark energy, isolated on neutral background, full body' },
  { name: 'Scarred Bounty Hunter',   categoryId: C.VILLAIN,      generationPrompt: 'A scarred bounty hunter in worn battle armor with various weapons holstered, menacing posture, isolated on neutral background, full body' },

  { name: 'Village Merchant',        categoryId: C.NPC,          generationPrompt: 'A friendly middle-aged village merchant in a simple brown tunic and apron, round belly, carrying a small satchel, warm smile, isolated on neutral background, full body' },
  { name: 'Blacksmith NPC',          categoryId: C.NPC,          generationPrompt: 'A stocky blacksmith in a leather apron, muscular arms, holding a hammer, soot-stained face, isolated on neutral background, full body' },
  { name: 'Old Wizard NPC',          categoryId: C.NPC,          generationPrompt: 'A wise old wizard with a long white beard, pointed hat, robes covered in arcane symbols, leaning on a gnarled wooden staff, isolated on neutral background, full body' },

  { name: 'RPG Player Avatar',       categoryId: C.AVATAR,       generationPrompt: 'A neutral adventurer avatar in simple leather armor, medium build, standing in a T-pose, isolated on neutral background, full body, front view' },
  { name: 'Battle Royale Soldier',   categoryId: C.AVATAR,       generationPrompt: 'A battle royale player character in tactical military gear, backpack, holstered weapons, standing upright, isolated on neutral background, full body' },
  { name: 'Futuristic Cyber Avatar', categoryId: C.AVATAR,       generationPrompt: 'A futuristic player avatar with a slim bodysuit featuring glowing circuit patterns, helmet with visor, isolated on neutral background, full body, front view' },

  { name: 'Wood Elf Archer',         categoryId: C.FANTASY_CHAR, generationPrompt: 'A graceful wood elf archer in green and brown forest armor, long pointed ears, longbow in hand, leaf-patterned cloak, isolated on neutral background, full body' },
  { name: 'Dwarf Warrior',           categoryId: C.FANTASY_CHAR, generationPrompt: 'A stocky dwarf with a braided red beard, heavy dwarven battle armor, large war axe over shoulder, wide stance, isolated on neutral background, full body' },
  { name: 'Dark Elf Rogue',          categoryId: C.FANTASY_CHAR, generationPrompt: 'A lithe dark elf rogue in dark leather armor, dual daggers at hips, silvery hair, glowing amber eyes, isolated on neutral background, full body' },

  { name: 'Space Marine Soldier',    categoryId: C.SCIFI_CHAR,   generationPrompt: 'A bulky space marine in futuristic power armor with helmet, shoulder pads with squad markings, assault rifle held across chest, isolated on neutral background, full body' },
  { name: 'Cyberpunk Hacker',        categoryId: C.SCIFI_CHAR,   generationPrompt: 'A slim cyberpunk hacker in a hooded jacket with glowing circuit lines, cybernetic arm implants, isolated on neutral background, full body, front view' },
  { name: 'Alien Commander',         categoryId: C.SCIFI_CHAR,   generationPrompt: 'A tall alien commander in sleek bio-mechanical armor, elongated head, four-fingered hands, glowing body markings, isolated on neutral background, full body' },

  { name: 'Anime Samurai',           categoryId: C.ANIME,        generationPrompt: 'An anime-style samurai with spiky dark hair, traditional kimono-inspired armor, katana at hip, determined expression, isolated on neutral background, full body front view' },
  { name: 'Magical Girl',            categoryId: C.ANIME,        generationPrompt: 'An anime magical girl in a colorful frilly dress, twin pigtails, holding a glowing magical wand, large expressive eyes, isolated on neutral background, full body' },
  { name: 'Anime Mecha Pilot',       categoryId: C.ANIME,        generationPrompt: 'An anime mecha pilot in a form-fitting flight suit with a visor helmet, sleek futuristic design, isolated on neutral background, full body' },

  { name: 'Roman Legionnaire',       categoryId: C.HISTORICAL,   generationPrompt: 'A Roman legionnaire soldier in authentic lorica segmentata armor, crested helmet, large rectangular shield and gladius sword, isolated on neutral background, full body' },
  { name: 'Medieval Knight',         categoryId: C.HISTORICAL,   generationPrompt: 'A medieval knight in full plate armor, great helm with visor, heraldic tabard, broadsword and kite shield, standing at attention, isolated on neutral background, full body' },
  { name: 'Feudal Samurai',          categoryId: C.HISTORICAL,   generationPrompt: 'A feudal Japanese samurai in traditional o-yoroi lamellar armor, kabuto helmet, holding a katana in guard stance, isolated on neutral background, full body' },

  // ── Creatures & Animals ──────────────────────────────────────────────────
  { name: 'Small Green Dragon',      categoryId: C.FANTASY_CREAT, generationPrompt: 'A small compact dragon with folded wings, four legs, horned head, iridescent green and gold scales, crouching pose, isolated on neutral background' },
  { name: 'Griffin',                 categoryId: C.FANTASY_CREAT, generationPrompt: 'A noble griffin with the body of a lion and the wings and head of an eagle, standing proud, wings partially spread, isolated on neutral background, side view' },
  { name: 'Forest Troll',            categoryId: C.FANTASY_CREAT, generationPrompt: 'A hunched forest troll with mossy green skin, large flat nose, long clawed fingers, bark-like skin texture, isolated on neutral background, full body' },

  { name: 'Grey Alien',              categoryId: C.ALIEN,         generationPrompt: 'A classic grey alien with an oversized smooth head, large black almond-shaped eyes, slender frail body, three-fingered hands, isolated on neutral background, front view' },
  { name: 'Insectoid Alien',         categoryId: C.ALIEN,         generationPrompt: 'A bipedal insectoid alien with a chitinous exoskeleton, compound eyes, four arms, antennae, isolated on neutral background, full body' },
  { name: 'Reptilian Alien Warrior', categoryId: C.ALIEN,         generationPrompt: 'A muscular reptilian alien warrior with scales, slit pupils, holding a plasma weapon, isolated on neutral background, full body' },

  { name: 'Grey Wolf',               categoryId: C.WILDLIFE,      generationPrompt: 'A large grey wolf in a natural standing pose, detailed fur, alert ears, bushy tail, isolated on neutral background, full body side view' },
  { name: 'Brown Bear',              categoryId: C.WILDLIFE,      generationPrompt: 'A large brown bear standing on all fours, thick fur, powerful build, isolated on neutral background, full body three-quarter view' },
  { name: 'Soaring Eagle',           categoryId: C.WILDLIFE,      generationPrompt: 'A golden eagle with wings fully spread in a soaring pose, detailed feathers, sharp talons, isolated on neutral background' },

  { name: 'Skeleton Warrior',        categoryId: C.UNDEAD,        generationPrompt: 'An animated skeleton warrior holding a rusty sword and rotting shield, eye sockets glowing with faint blue light, tattered cloth remnants, isolated on neutral background, full body' },
  { name: 'Zombie',                  categoryId: C.UNDEAD,        generationPrompt: 'A shambling zombie with rotting grey skin, torn clothing, one outstretched arm, vacant expression, isolated on neutral background, full body front view' },
  { name: 'Ancient Lich',            categoryId: C.UNDEAD,        generationPrompt: 'An ancient lich in tattered royal robes, skeletal face partially visible under hood, holding a glowing phylactery orb, isolated on neutral background, full body' },

  { name: 'Minotaur',                categoryId: C.MYTHOLOGICAL,  generationPrompt: 'A powerful minotaur with bull head and humanoid muscular body, massive horns, holding a double-headed axe, isolated on neutral background, full body' },
  { name: 'Medusa',                  categoryId: C.MYTHOLOGICAL,  generationPrompt: 'Medusa with serpents for hair, partially human face, scaled lower body, isolated on neutral background, full body' },
  { name: 'Cerberus',                categoryId: C.MYTHOLOGICAL,  generationPrompt: 'Cerberus the three-headed hellhound, each head snarling with bared teeth, muscular black dog body, isolated on neutral background, front view' },

  { name: 'Fairy Familiar',          categoryId: C.FAMILIAR,      generationPrompt: 'A tiny fairy familiar with gossamer wings, glowing softly, delicate features, holding a small lantern, isolated on neutral background, full body' },
  { name: 'Baby Dragon',             categoryId: C.FAMILIAR,      generationPrompt: 'A cute baby dragon familiar, small stubby wings, big expressive eyes, sitting pose, isolated on neutral background, full body' },
  { name: 'Spirit Fox',              categoryId: C.FAMILIAR,      generationPrompt: 'A spirit fox familiar with a translucent ethereal body, multiple tails, soft glowing eyes, isolated on neutral background, full body side view' },

  { name: 'Stone Golem Boss',        categoryId: C.BOSS,          generationPrompt: 'A massive stone golem with rough hewn rock body, glowing rune cracks, enormous fists raised, isolated on neutral background, full body front view' },
  { name: 'Kraken Tentacles',        categoryId: C.BOSS,          generationPrompt: 'A kraken sea monster with a massive round body and multiple long tentacles spreading outward, glowing yellow eyes, isolated on neutral background' },
  { name: 'Fire Dragon Boss',        categoryId: C.BOSS,          generationPrompt: 'A massive fire dragon rearing up on hind legs, wings spread wide, mouth open with flames, isolated on neutral background, full body three-quarter view' },

  { name: 'Giant Scorpion',          categoryId: C.INSECT,        generationPrompt: 'A giant scorpion with armored exoskeleton, large claws raised, segmented tail with venomous stinger, isolated on neutral background, slightly above view' },
  { name: 'Giant Spider',            categoryId: C.INSECT,        generationPrompt: 'A large hairy spider with multiple eyes, detailed arachnid body, eight legs spread, isolated on neutral background, front view' },
  { name: 'Rhinoceros Beetle',       categoryId: C.INSECT,        generationPrompt: 'A large rhinoceros beetle with a prominent horn on its head, iridescent shell, isolated on neutral background, three-quarter view' },

  // ── Vehicles & Mechs ─────────────────────────────────────────────────────
  { name: 'Sports Car',              categoryId: C.CAR,           generationPrompt: 'A sleek sports car with low aerodynamic body, wide fenders, large alloy wheels, isolated on neutral background, three-quarter front view' },
  { name: 'Monster Truck',           categoryId: C.CAR,           generationPrompt: 'A massive monster truck with enormous oversized wheels, lifted suspension, aggressive body kit, isolated on neutral background, three-quarter front view' },
  { name: 'Off-Road Buggy',          categoryId: C.CAR,           generationPrompt: 'A compact off-road buggy with exposed roll cage, large all-terrain tires, open cockpit, isolated on neutral background, three-quarter view' },

  { name: 'Battle Tank',             categoryId: C.TANK,          generationPrompt: 'A heavy battle tank with a long cannon barrel, reactive armor panels, tank tracks, isolated on neutral background, three-quarter front view' },
  { name: 'Armored APC',             categoryId: C.TANK,          generationPrompt: 'An armored personnel carrier with a top-mounted machine gun, boxy armored body, thick tracks, isolated on neutral background, three-quarter view' },
  { name: 'Anti-Aircraft Vehicle',   categoryId: C.TANK,          generationPrompt: 'A wheeled anti-aircraft gun vehicle with twin rotating barrels pointing upward, radar dish on back, isolated on neutral background' },

  { name: 'Fighter Jet',             categoryId: C.AIRCRAFT,      generationPrompt: 'A sleek fighter jet with swept wings, twin engines, cockpit canopy, missiles under wings, isolated on neutral background, side view' },
  { name: 'Propeller Biplane',       categoryId: C.AIRCRAFT,      generationPrompt: 'A vintage propeller biplane with two stacked wings, open cockpit, round engine cowling, isolated on neutral background, three-quarter view' },
  { name: 'Attack Helicopter',       categoryId: C.AIRCRAFT,      generationPrompt: 'An attack helicopter with tandem cockpit, stub wings with missiles, chin-mounted gun turret, tail rotor, isolated on neutral background, side view' },

  { name: 'Scout Spaceship',         categoryId: C.SPACESHIP,     generationPrompt: 'A small nimble scout spaceship with swept wings, single cockpit, smooth hull, isolated on neutral background, three-quarter view' },
  { name: 'Heavy Cruiser',           categoryId: C.SPACESHIP,     generationPrompt: 'A massive heavy cruiser battleship with multiple gun turrets, engine pods, elongated hull, isolated on neutral background, three-quarter view' },
  { name: 'Flying Saucer UFO',       categoryId: C.SPACESHIP,     generationPrompt: 'A classic disc-shaped flying saucer with a dome on top, smooth metallic surface, landing gear extended, isolated on neutral background' },

  { name: 'Pirate Ship',             categoryId: C.BOAT,          generationPrompt: 'A wooden pirate sailing ship with three masts, tattered sails, cannon ports along the hull, isolated on neutral background, three-quarter view' },
  { name: 'Speed Boat',              categoryId: C.BOAT,          generationPrompt: 'A sleek modern speed boat with a pointed bow, single outboard engine, low profile, isolated on neutral background, three-quarter view' },
  { name: 'Viking Longship',         categoryId: C.BOAT,          generationPrompt: 'A Viking longship with a carved dragon prow, rows of oars, striped sail, isolated on neutral background, side view' },

  { name: 'Biped Combat Mech',       categoryId: C.MECH,          generationPrompt: 'A bipedal combat mech with heavy shoulder cannons, thick armor plating, reverse-joint legs, isolated on neutral background, full body front view' },
  { name: 'Spider Mech Walker',      categoryId: C.MECH,          generationPrompt: 'A spider-like mech walker with six articulated legs, a central armored body, mounted weapons on top, isolated on neutral background' },
  { name: 'Industrial Loader Mech',  categoryId: C.MECH,          generationPrompt: 'An industrial loader exo-frame mech, open cockpit with pilot seat, large claw manipulators, yellow and grey colors, isolated on neutral background, full body' },

  { name: 'Sport Motorcycle',        categoryId: C.MOTORCYCLE,    generationPrompt: 'A sleek sport motorcycle with full aerodynamic fairing, low handlebars, large disc brakes, isolated on neutral background, side view' },
  { name: 'Chopper Bike',            categoryId: C.MOTORCYCLE,    generationPrompt: 'A classic chopper motorcycle with extended front forks, low seat, custom exhaust pipes, isolated on neutral background, side view' },
  { name: 'Futuristic Hover Bike',   categoryId: C.MOTORCYCLE,    generationPrompt: 'A futuristic hover bike with no wheels, sleek angular body, glowing thrusters underneath, isolated on neutral background, three-quarter view' },

  { name: 'Fantasy Carriage',        categoryId: C.FANTASY_VEH,   generationPrompt: 'An ornate fantasy horse-drawn carriage with gilded trim, lanterns, large wooden wheels, no horses shown, isolated on neutral background, side view' },
  { name: 'Steampunk Airship',       categoryId: C.FANTASY_VEH,   generationPrompt: 'A steampunk fantasy airship with a large balloon envelope, wooden gondola below, multiple propellers, rigging ropes, isolated on neutral background' },
  { name: 'War Chariot',             categoryId: C.FANTASY_VEH,   generationPrompt: 'A fantasy war chariot with ornate design, spinning blade wheels, carved dragon head on front, isolated on neutral background, three-quarter view' },

  // ── Architecture & Environments ──────────────────────────────────────────
  { name: 'Fantasy Cottage',         categoryId: C.BUILDING,      generationPrompt: 'A cozy fantasy cottage with a thatched roof, stone walls, wooden shutters, flowers around the entrance, isolated on neutral background' },
  { name: 'Sci-Fi Office Tower',     categoryId: C.BUILDING,      generationPrompt: 'A sleek sci-fi office tower with glass and metal facade, clean geometric lines, antenna on top, isolated on neutral background' },
  { name: 'Japanese Pagoda',         categoryId: C.BUILDING,      generationPrompt: 'A three-tiered Japanese pagoda with curved eaves, red lacquered columns, stone base, isolated on neutral background, front view' },

  { name: 'Medieval Castle',         categoryId: C.CASTLE,        generationPrompt: 'A compact medieval castle with a central keep, corner towers, crenellated battlements, portcullis gate, isolated on neutral background, front view' },
  { name: 'Dark Gothic Citadel',     categoryId: C.CASTLE,        generationPrompt: 'A dark gothic citadel with twisted spires, gargoyles on the walls, jagged battlements, isolated on neutral background, front view' },
  { name: 'Dwarven Fortress Gate',   categoryId: C.CASTLE,        generationPrompt: 'A massive dwarven fortress gate carved into a mountainside, heavy stone doors with rune carvings, isolated on neutral background, front view' },

  { name: 'Dungeon Cell',            categoryId: C.INTERIOR,      generationPrompt: 'A dark dungeon prison cell interior with stone walls, iron-barred door, straw on floor, torch sconce, isolated on neutral background' },
  { name: 'Tavern Interior',         categoryId: C.INTERIOR,      generationPrompt: 'A cozy medieval tavern interior with wooden tables, fireplace, barrel in corner, mounted deer head on wall, isolated on neutral background' },
  { name: 'Sci-Fi Command Bridge',   categoryId: C.INTERIOR,      generationPrompt: 'A sci-fi spacecraft command bridge with holographic displays, captain chair in center, control panels, isolated on neutral background' },

  { name: 'Ancient Greek Ruins',     categoryId: C.RUINS,         generationPrompt: 'Crumbling ancient Greek temple ruins with broken marble columns, overgrown with ivy, isolated on neutral background' },
  { name: 'Mayan Pyramid',           categoryId: C.RUINS,         generationPrompt: 'A stepped Mayan pyramid with intricate stone carvings, partially covered in vegetation, isolated on neutral background, front three-quarter view' },
  { name: 'Sunken Ruin Fragment',    categoryId: C.RUINS,         generationPrompt: 'A sunken underwater ruin wall fragment with barnacle-encrusted stone, coral growing on it, seaweed, isolated on neutral background' },

  { name: 'Cave Entrance',           categoryId: C.DUNGEON,       generationPrompt: 'A dark cave entrance set into a rocky cliff face, stalactites visible inside, eerie glow from within, isolated on neutral background' },
  { name: 'Crystal Cave Chamber',    categoryId: C.DUNGEON,       generationPrompt: 'A cave chamber with large glowing crystal formations jutting from walls and floor, bioluminescent light, isolated on neutral background' },
  { name: 'Stone Dungeon Corridor',  categoryId: C.DUNGEON,       generationPrompt: 'A stone dungeon corridor with torches on the wall, iron-banded door at the end, worn stone floor, isolated on neutral background' },

  { name: 'Space Station Module',    categoryId: C.SCIFI_STRUCT,  generationPrompt: 'A cylindrical space station module with solar panels, docking ports, and antenna arrays, isolated on neutral background' },
  { name: 'Sci-Fi Research Lab',     categoryId: C.SCIFI_STRUCT,  generationPrompt: 'A compact sci-fi research lab building with large windows, antenna arrays, heavy blast doors, isolated on neutral background, front view' },
  { name: 'Energy Generator Tower',  categoryId: C.SCIFI_STRUCT,  generationPrompt: 'A tall sci-fi energy generator tower with glowing plasma coils, exhaust vents, caution markings, isolated on neutral background' },

  { name: 'Stone Wall Segment',      categoryId: C.MODULAR,       generationPrompt: 'A single modular stone wall segment with crenellations on top, dressed stone surface, isolated on neutral background, slightly angled view' },
  { name: 'Sci-Fi Corridor Panel',   categoryId: C.MODULAR,       generationPrompt: 'A sci-fi corridor wall panel with integrated pipe details, lighting strips, and ventilation grilles, isolated on neutral background' },
  { name: 'Wooden Platform Piece',   categoryId: C.MODULAR,       generationPrompt: 'A square wooden platform with rope railings and a ladder on one side, isolated on neutral background' },

  { name: 'Medieval Stone Bridge',   categoryId: C.BRIDGE,        generationPrompt: 'A medieval stone arch bridge, mossy stones, parapet walls on both sides, isolated on neutral background, front three-quarter view' },
  { name: 'Rope Bridge',             categoryId: C.BRIDGE,        generationPrompt: 'A rickety rope bridge with wooden planks and frayed rope handrails, isolated on neutral background, side view' },
  { name: 'Sci-Fi Force Bridge',     categoryId: C.BRIDGE,        generationPrompt: 'A sci-fi bridge where the walkway is glowing blue force field panels supported by metal pylons, isolated on neutral background' },

  // ── Weapons & Armor ──────────────────────────────────────────────────────
  { name: 'Medieval Broadsword',     categoryId: C.SWORD,         generationPrompt: 'A medieval broadsword with a straight double-edged blade, cross-guard, leather-wrapped grip, pommel, isolated on neutral background, vertical orientation' },
  { name: 'Fantasy Greatsword',      categoryId: C.SWORD,         generationPrompt: 'A massive fantasy two-handed greatsword with runes etched in the blade, ornate guard with gemstones, isolated on neutral background, vertical orientation' },
  { name: 'Japanese Katana',         categoryId: C.SWORD,         generationPrompt: 'A Japanese katana with a curved single-edged blade, round tsuba guard, wrapped tsuka handle, isolated on neutral background, horizontal orientation' },

  { name: 'War Axe',                 categoryId: C.AXE,           generationPrompt: 'A single-bladed war axe with a wide crescent blade, rough iron finish, wooden shaft, isolated on neutral background, vertical orientation' },
  { name: 'Dwarven War Hammer',      categoryId: C.AXE,           generationPrompt: 'A massive dwarven war hammer with a square head, carved runes, short thick shaft, isolated on neutral background, vertical orientation' },
  { name: 'Double-Headed Fantasy Axe', categoryId: C.AXE,         generationPrompt: 'A double-headed fantasy axe with ornate crescent blades on both sides, central long haft, isolated on neutral background, front view' },

  { name: 'Longbow',                 categoryId: C.BOW,           generationPrompt: 'A tall wooden longbow with a nocked arrow, simple bowstring, isolated on neutral background, vertical orientation' },
  { name: 'Medieval Crossbow',       categoryId: C.BOW,           generationPrompt: 'A medieval crossbow with a wooden stock, metal prod, and a bolt loaded in the track, isolated on neutral background, side view' },
  { name: 'Elven Recurve Bow',       categoryId: C.BOW,           generationPrompt: 'An elven recurve bow with elegant curved tips, leaf motif decorations carved into the limbs, isolated on neutral background, vertical orientation' },

  { name: 'Revolver Pistol',         categoryId: C.GUN,           generationPrompt: 'A classic six-shooter revolver with a wooden grip, visible cylinder, isolated on neutral background, side view' },
  { name: 'Assault Rifle',           categoryId: C.GUN,           generationPrompt: 'A modern assault rifle with a suppressor, scope, and folding stock, isolated on neutral background, side view' },
  { name: 'Sci-Fi Plasma Pistol',    categoryId: C.GUN,           generationPrompt: 'A sleek sci-fi plasma pistol with a glowing energy cell, angular futuristic design, isolated on neutral background, side view' },

  { name: 'Medieval Spear',          categoryId: C.POLEARM,       generationPrompt: 'A simple medieval spear with a leaf-shaped iron tip, long wooden shaft, isolated on neutral background, vertical orientation' },
  { name: 'Fantasy Halberd',         categoryId: C.POLEARM,       generationPrompt: 'A fantasy halberd with a large axe blade, spike on top, and hook on back, long pole shaft, isolated on neutral background, vertical orientation' },
  { name: 'Wizard Staff',            categoryId: C.POLEARM,       generationPrompt: 'A gnarled wizard staff with a glowing crystal orb at the top, carved magical symbols along the shaft, isolated on neutral background, vertical orientation' },

  { name: 'Kite Shield',             categoryId: C.SHIELD,        generationPrompt: 'A medieval kite shield with a painted heraldic crest, metal boss in center, worn leather edging, isolated on neutral background, front view' },
  { name: 'Viking Round Shield',     categoryId: C.SHIELD,        generationPrompt: 'A circular Viking shield with an iron boss at center, wooden planks with painted pattern, isolated on neutral background, front view' },
  { name: 'Sci-Fi Energy Shield',    categoryId: C.SHIELD,        generationPrompt: 'A futuristic arm-mounted energy shield with a transparent blue force field emanating from it, isolated on neutral background' },

  { name: 'Knight Great Helm',       categoryId: C.ARMOR,         generationPrompt: 'A full-face medieval knight great helm with a T-shaped visor, detailed metalwork, isolated on neutral background, three-quarter view' },
  { name: 'Fantasy Pauldron',        categoryId: C.ARMOR,         generationPrompt: 'A fantasy shoulder pauldron with layered plates and decorative spikes, isolated on neutral background, three-quarter view' },
  { name: 'Viking Helmet',           categoryId: C.ARMOR,         generationPrompt: 'A Viking helmet with a rounded iron cap and nose guard, no horns, isolated on neutral background, front three-quarter view' },

  { name: 'Fantasy Fire Bomb',       categoryId: C.THROWABLE,     generationPrompt: 'A small clay pot filled with glowing orange fire oil, wrapped in a cloth wick, isolated on neutral background' },
  { name: 'Frag Grenade',            categoryId: C.THROWABLE,     generationPrompt: 'A classic pineapple-style fragmentation grenade with pull pin and safety lever, isolated on neutral background' },
  { name: 'Ninja Throwing Star',     categoryId: C.THROWABLE,     generationPrompt: 'A metal four-pointed ninja throwing star (shuriken) with sharp blades, isolated on neutral background, flat view' },

  // ── Props & Items ─────────────────────────────────────────────────────────
  { name: 'Wooden Chair',            categoryId: C.FURNITURE,     generationPrompt: 'A simple wooden chair with four legs, ladder-back, isolated on neutral background, three-quarter front view' },
  { name: 'Fantasy Throne',          categoryId: C.FURNITURE,     generationPrompt: 'An ornate fantasy throne with carved stone armrests, padded velvet seat, elaborate back with crown motif, isolated on neutral background, front view' },
  { name: 'Bookshelf',               categoryId: C.FURNITURE,     generationPrompt: 'A tall wooden bookshelf filled with books of various sizes and colors, isolated on neutral background, front view' },

  { name: 'Iron Cooking Pot',        categoryId: C.HOUSEHOLD,     generationPrompt: 'A large iron cooking cauldron with a handle, lid, isolated on neutral background' },
  { name: 'Oak Wooden Barrel',       categoryId: C.HOUSEHOLD,     generationPrompt: 'A classic oak wooden barrel with iron hoops, bung hole on the side, isolated on neutral background, slightly angled view' },
  { name: 'Oil Lantern',             categoryId: C.HOUSEHOLD,     generationPrompt: 'An old oil lantern with a glass chimney, metal frame, burning flame inside, handle on top, isolated on neutral background' },

  { name: 'Laptop Computer',         categoryId: C.ELECTRONICS,   generationPrompt: 'A modern laptop computer with screen open showing a glowing display, isolated on neutral background, three-quarter view' },
  { name: 'Sci-Fi Data Pad',         categoryId: C.ELECTRONICS,   generationPrompt: 'A futuristic sci-fi data pad with a holographic glowing screen, sleek metallic casing, isolated on neutral background, front view' },
  { name: 'Military Walkie Talkie',  categoryId: C.ELECTRONICS,   generationPrompt: 'A chunky military walkie-talkie radio with antenna, buttons, small screen, isolated on neutral background' },

  { name: 'Roast Chicken',           categoryId: C.FOOD,          generationPrompt: 'A golden-brown roasted whole chicken on a wooden platter with herbs, isolated on neutral background' },
  { name: 'Medieval Feast Tray',     categoryId: C.FOOD,          generationPrompt: 'A medieval wooden tray with a bread loaf, goblet of wine, cheese wedge, and a red apple, isolated on neutral background' },
  { name: 'Health Potion Drink',     categoryId: C.FOOD,          generationPrompt: 'A small bottle of glowing red health potion with a cork stopper, label, isolated on neutral background' },

  { name: 'Fantasy Cape',            categoryId: C.CLOTHING,      generationPrompt: 'A long flowing fantasy cloak with hood, clasp at neck, displayed on an invisible mannequin, isolated on neutral background, front view' },
  { name: 'Combat Boots',            categoryId: C.CLOTHING,      generationPrompt: 'A pair of heavy military combat boots, laced up, worn leather texture, isolated on neutral background, three-quarter view' },
  { name: 'Wizard Hat',              categoryId: C.CLOTHING,      generationPrompt: 'A tall pointed wizard hat with stars and moon patterns, slightly bent tip, isolated on neutral background' },

  { name: 'Treasure Chest',          categoryId: C.CONTAINER,     generationPrompt: 'A classic wooden treasure chest with iron fittings, padlock, slightly open lid showing coins inside, isolated on neutral background, three-quarter view' },
  { name: 'Magic Crate',             categoryId: C.CONTAINER,     generationPrompt: 'A wooden crate with glowing arcane symbols branded onto the wood, metal corner brackets, isolated on neutral background, three-quarter view' },
  { name: 'Adventurer Backpack',     categoryId: C.CONTAINER,     generationPrompt: 'A well-worn leather adventurer backpack with multiple buckled pouches and a bedroll strapped on top, isolated on neutral background' },

  { name: 'Blacksmith Hammer',       categoryId: C.TOOL,          generationPrompt: 'A heavy blacksmith hammer with a flat striking face and a wooden handle, isolated on neutral background' },
  { name: 'Mining Pickaxe',          categoryId: C.TOOL,          generationPrompt: 'A mining pickaxe with a metal double head, worn wooden handle, isolated on neutral background, side view' },
  { name: 'Shovel',                  categoryId: C.TOOL,          generationPrompt: 'A sturdy round-point shovel with metal blade and wooden shaft, isolated on neutral background, side view' },

  { name: 'Golden Trophy Cup',       categoryId: C.COLLECTIBLE,   generationPrompt: 'A shiny gold trophy cup with two handles, mounted on a base with a star emblem, isolated on neutral background, front view' },
  { name: 'Crystal Skull',           categoryId: C.COLLECTIBLE,   generationPrompt: 'A life-sized crystal skull made of clear quartz, detailed teeth and eye sockets, isolated on neutral background, front view' },
  { name: 'Ancient Gold Coin',       categoryId: C.COLLECTIBLE,   generationPrompt: 'A large ancient gold coin with a king profile embossed on one face, raised edge detail, isolated on neutral background, front view' },

  // ── Nature & Terrain ─────────────────────────────────────────────────────
  { name: 'Oak Tree',                categoryId: C.TREE,          generationPrompt: 'A large mature oak tree with a wide gnarled trunk, spreading branches, full green canopy, isolated on neutral background' },
  { name: 'Dead Twisted Tree',       categoryId: C.TREE,          generationPrompt: 'A bare dead tree with gnarled twisted branches, no leaves, cracked grey bark, isolated on neutral background' },
  { name: 'Fantasy Magic Tree',      categoryId: C.TREE,          generationPrompt: 'A fantasy magic tree with a glowing trunk, luminous floating leaves, roots slightly lifted off ground, isolated on neutral background' },

  { name: 'Round Hedge Bush',        categoryId: C.BUSH,          generationPrompt: 'A neatly rounded garden hedge bush, dense green foliage, isolated on neutral background' },
  { name: 'Wild Thorny Bush',        categoryId: C.BUSH,          generationPrompt: 'A wild thorny bush with sharp spines, sparse green leaves, isolated on neutral background' },
  { name: 'Tall Saguaro Cactus',     categoryId: C.BUSH,          generationPrompt: 'A tall saguaro cactus with two raised arms, spines visible, isolated on neutral background' },

  { name: 'Sunflower',               categoryId: C.FLOWER,        generationPrompt: 'A tall sunflower with a large yellow bloom and green stalk with leaves, isolated on neutral background' },
  { name: 'Red Rose Cluster',        categoryId: C.FLOWER,        generationPrompt: 'A cluster of red roses with leaves and thorns on stems, isolated on neutral background' },
  { name: 'Fantasy Glowing Flower',  categoryId: C.FLOWER,        generationPrompt: 'A magical blue flower with luminescent petals, floating sparkle particles around it, isolated on neutral background' },

  { name: 'Mossy Rock Cluster',      categoryId: C.ROCK,          generationPrompt: 'A cluster of three mossy rocks of varying sizes, rough granite texture, isolated on neutral background' },
  { name: 'Giant Boulder',           categoryId: C.ROCK,          generationPrompt: 'A massive single boulder with visible cracks and lichen growing on its surface, isolated on neutral background' },
  { name: 'Volcanic Rock',           categoryId: C.ROCK,          generationPrompt: 'A jagged dark volcanic rock with visible gas pockets, rough porous texture, isolated on neutral background' },

  { name: 'Grassy Hill',             categoryId: C.TERRAIN,       generationPrompt: 'A small grassy hill with rocky outcroppings on one side, isolated on neutral background' },
  { name: 'Cliff Edge',              categoryId: C.TERRAIN,       generationPrompt: 'A flat-topped cliff edge with a sheer vertical face showing rock strata layers, isolated on neutral background' },
  { name: 'Sand Dune',               categoryId: C.TERRAIN,       generationPrompt: 'A smooth crescent-shaped sand dune with wind ripple patterns on the surface, isolated on neutral background' },

  { name: 'Giant Red Mushroom',      categoryId: C.MUSHROOM,      generationPrompt: 'A large oversized red mushroom with white spots, fat stalk, isolated on neutral background' },
  { name: 'Mushroom Cluster',        categoryId: C.MUSHROOM,      generationPrompt: 'A cluster of five small brown mushrooms growing from a mossy log base, isolated on neutral background' },
  { name: 'Glowing Fantasy Shroom',  categoryId: C.MUSHROOM,      generationPrompt: 'A glowing bioluminescent fantasy mushroom with turquoise light emanating from its gills, isolated on neutral background' },

  { name: 'Tiered Fountain',         categoryId: C.WATER,         generationPrompt: 'A tiered stone fountain with water flowing between bowls, isolated on neutral background' },
  { name: 'Waterfall',               categoryId: C.WATER,         generationPrompt: 'A compact waterfall flowing over mossy rocks into a small pool, isolated on neutral background' },
  { name: 'Wooden Well',             categoryId: C.WATER,         generationPrompt: 'A classic stone and wood wishing well with a rope and bucket, wooden roof overhang, isolated on neutral background' },

  { name: 'Amethyst Crystal Cluster', categoryId: C.CRYSTAL,      generationPrompt: 'A cluster of large amethyst purple crystals with sharp faceted faces, isolated on neutral background' },
  { name: 'Quartz Formation',        categoryId: C.CRYSTAL,       generationPrompt: 'A white quartz crystal formation with multiple pointed spires growing from a rock base, isolated on neutral background' },
  { name: 'Energy Crystal',          categoryId: C.CRYSTAL,       generationPrompt: 'A tall glowing blue energy crystal, slightly translucent with inner light, isolated on neutral background' },

  // ── Sci-Fi & Futuristic ──────────────────────────────────────────────────
  { name: 'Service Android',         categoryId: C.ROBOT,         generationPrompt: 'A humanoid service android with a smooth white chassis, expressionless face with LED eyes, isolated on neutral background, full body front view' },
  { name: 'Combat Quad-Bot',         categoryId: C.ROBOT,         generationPrompt: 'A four-legged combat robot with weapon mounts and armored chassis, isolated on neutral background, three-quarter view' },
  { name: 'Retro Tin Robot',         categoryId: C.ROBOT,         generationPrompt: 'A retro 1950s-style tin robot with rivets, antenna, simple rectangular body, friendly face, isolated on neutral background, front view' },

  { name: 'Neon Street Sign',        categoryId: C.CYBERPUNK,     generationPrompt: 'A glowing neon Japanese street sign with bright pink and blue neon tubes, mounted on a pole, isolated on neutral background' },
  { name: 'Cyberpunk Vending Machine', categoryId: C.CYBERPUNK,   generationPrompt: 'A futuristic cyberpunk vending machine with a holographic display, glowing product slots, neon trim, isolated on neutral background, front view' },
  { name: 'AR Visor',                categoryId: C.CYBERPUNK,     generationPrompt: 'A sleek augmented reality visor with HUD display visible, thin wraparound frame, isolated on neutral background' },

  { name: 'Docking Clamp',           categoryId: C.SPACE_STATION, generationPrompt: 'A large mechanical space station docking clamp mechanism with hydraulic arms, isolated on neutral background' },
  { name: 'Solar Panel Array',       categoryId: C.SPACE_STATION, generationPrompt: 'A space station solar panel array with blue photovoltaic cells on a folding arm, isolated on neutral background' },
  { name: 'Space Airlock Door',      categoryId: C.SPACE_STATION, generationPrompt: 'A heavy space station airlock door with wheel handle, warning stripes, pressure gauge, isolated on neutral background, front view' },

  { name: 'Quadcopter Drone',        categoryId: C.DRONE,         generationPrompt: 'A consumer quadcopter drone with four propellers, camera pod underneath, compact body, isolated on neutral background, slightly above view' },
  { name: 'NASA-style Space Probe',  categoryId: C.DRONE,         generationPrompt: 'A NASA-style space probe with solar panels, large dish antenna, scientific instruments on booms, isolated on neutral background' },
  { name: 'Military Recon Drone',    categoryId: C.DRONE,         generationPrompt: 'A military reconnaissance drone with swept wings, camera pod underneath, no cockpit, isolated on neutral background, three-quarter view' },

  { name: 'Alien Monolith',          categoryId: C.ALIEN_ART,     generationPrompt: 'A smooth featureless black alien monolith obelisk with faint glowing hieroglyphs on its surface, isolated on neutral background, front view' },
  { name: 'Alien Power Orb',         categoryId: C.ALIEN_ART,     generationPrompt: 'A floating alien orb with a metallic shell, alien script etched on the surface, faint blue inner glow, isolated on neutral background' },
  { name: 'Xenotech Device',         categoryId: C.ALIEN_ART,     generationPrompt: 'An unknown alien technology device with crystalline protrusions, organic-looking connectors, bioluminescent glow, isolated on neutral background' },

  { name: 'Laser Rifle',             categoryId: C.ENERGY_WPN,    generationPrompt: 'A sci-fi laser rifle with a long barrel, energy cell magazine, glowing emitter at the muzzle, isolated on neutral background, side view' },
  { name: 'Plasma Cannon',           categoryId: C.ENERGY_WPN,    generationPrompt: 'A heavy plasma cannon with a wide barrel and glowing coils, shoulder-mounted design, isolated on neutral background, three-quarter view' },
  { name: 'Energy Sword',            categoryId: C.ENERGY_WPN,    generationPrompt: 'A sci-fi energy sword with a glowing plasma blade, metal hilt with activation button, isolated on neutral background, vertical orientation' },

  { name: 'Holographic Display',     categoryId: C.HOLOGRAM,      generationPrompt: 'A floating holographic display screen with a translucent blue UI, minimal stand at the base, isolated on neutral background' },
  { name: 'Data Sphere',             categoryId: C.HOLOGRAM,      generationPrompt: 'A sphere of interconnected holographic data nodes floating in mid-air, glowing blue, isolated on neutral background' },
  { name: 'Sci-Fi Command Terminal', categoryId: C.HOLOGRAM,      generationPrompt: 'A futuristic command terminal with a curved holographic display, physical keyboard, isolated on neutral background' },

  { name: 'Heavy Power Armor',       categoryId: C.POWER_ARMOR,   generationPrompt: 'A massive power armor exo-suit with heavy plating, hydraulic limbs, glowing chest reactor, isolated on neutral background, full body front view' },
  { name: 'Light Exo-Skeleton',      categoryId: C.POWER_ARMOR,   generationPrompt: 'A lightweight sci-fi exo-skeleton suit with exposed mechanical joints, smooth white panels, isolated on neutral background, full body front view' },
  { name: 'Hazmat Power Suit',       categoryId: C.POWER_ARMOR,   generationPrompt: 'A futuristic hazmat power suit with sealed helmet, radiation symbols, heavy gloves, isolated on neutral background, full body front view' },

  // ── Fantasy & Magic ──────────────────────────────────────────────────────
  { name: 'Wizard Staff',            categoryId: C.MAGIC_WPN,     generationPrompt: 'A twisted wizard staff with a large glowing crystal sphere at the top, carved runes along the shaft, isolated on neutral background, vertical orientation' },
  { name: 'Enchanted Sword',         categoryId: C.MAGIC_WPN,     generationPrompt: 'A broadsword with glowing runes etched along the blade, ethereal energy wisps surrounding it, ornate hilt, isolated on neutral background, vertical orientation' },
  { name: 'Druidic Nature Staff',    categoryId: C.MAGIC_WPN,     generationPrompt: 'A staff made from intertwined living wood branches, glowing green leaves growing from it, isolated on neutral background, vertical orientation' },

  { name: 'Health Potion',           categoryId: C.POTION,        generationPrompt: 'A small round glass bottle glowing bright red, cork stopper with a wax seal, isolated on neutral background' },
  { name: 'Mana Potion',             categoryId: C.POTION,        generationPrompt: 'A teardrop-shaped glass flask glowing deep blue, swirling mana essence visible inside, isolated on neutral background' },
  { name: 'Poison Vial',             categoryId: C.POTION,        generationPrompt: 'A small dark green glass vial with a skull label, bubbling poisonous liquid inside, isolated on neutral background' },

  { name: 'Magic Portal Ring',       categoryId: C.SPELL,         generationPrompt: 'A circular magical portal ring floating in air, swirling purple and blue energy inside, stone frame with rune carvings, isolated on neutral background' },
  { name: 'Fire Spell Orb',          categoryId: C.SPELL,         generationPrompt: 'A swirling ball of magical fire energy, red and orange flames with arcane sparks, isolated on neutral background' },
  { name: 'Lightning Rune Stone',    categoryId: C.SPELL,         generationPrompt: 'A flat rune stone with glowing lightning bolt symbol etched into it, crackling energy emanating from the rune, isolated on neutral background' },

  { name: 'Ancient Amulet',          categoryId: C.ARTIFACT,      generationPrompt: 'An ancient golden amulet with a large gemstone at center, intricate filigree work, on a chain, isolated on neutral background, front view' },
  { name: 'Mystical Crystal Orb',    categoryId: C.ARTIFACT,      generationPrompt: 'A polished crystal orb on an ornate stand with clawed feet, swirling magical mist inside, isolated on neutral background' },
  { name: 'Cursed Idol',             categoryId: C.ARTIFACT,      generationPrompt: 'A carved stone idol of an ancient god, faintly glowing with dark magic, hieroglyphs on its base, isolated on neutral background, front view' },

  { name: 'Pirate Treasure Chest',   categoryId: C.TREASURE,      generationPrompt: 'A pirate treasure chest overflowing with gold coins, gems, and jewels, wooden with iron banding, open lid, isolated on neutral background, three-quarter view' },
  { name: 'Royal Gold Crown',        categoryId: C.TREASURE,      generationPrompt: 'An ornate king\'s crown made of gold with large inset rubies and diamonds, isolated on neutral background, three-quarter view' },
  { name: 'Pile of Gold Coins',      categoryId: C.TREASURE,      generationPrompt: 'A neat pile of shining gold coins with embossed crowns visible on each face, isolated on neutral background' },

  { name: 'Cut Ruby Gemstone',       categoryId: C.GEM,           generationPrompt: 'A large faceted ruby gemstone, deep red color, multiple cut faces catching the light, isolated on neutral background' },
  { name: 'Brilliant Diamond',       categoryId: C.GEM,           generationPrompt: 'A brilliant-cut diamond with perfect facets, sparkling light reflections, isolated on neutral background' },
  { name: 'Raw Emerald Crystal',     categoryId: C.GEM,           generationPrompt: 'A rough-cut emerald with natural hexagonal crystal form, vivid green color, isolated on neutral background' },

  { name: 'Demon Summoning Circle',  categoryId: C.SUMMON,        generationPrompt: 'A dark ritual summoning circle on stone floor with dark fire glowing in the etched runes, pentagram at center, isolated on neutral background, above view' },
  { name: 'Divine Angel Glyph',      categoryId: C.SUMMON,        generationPrompt: 'A divine summoning glyph with golden glowing runes, rays of light emanating from the center, isolated on neutral background, above view' },

  { name: 'Magic Scroll',            categoryId: C.SCROLL,        generationPrompt: 'An old rolled-up magic scroll with visible rune text on yellowed parchment, tied with a red ribbon, isolated on neutral background' },
  { name: 'Spellbook Tome',          categoryId: C.SCROLL,        generationPrompt: 'A large leather-bound spellbook with a glowing cover emblem, metal clasp, open to show illustrated glowing pages, isolated on neutral background, three-quarter view' },
  { name: 'Fantasy Map',             categoryId: C.SCROLL,        generationPrompt: 'An unrolled fantasy treasure map with glowing location markers, aged parchment texture, coastlines and terrain, isolated on neutral background, above view' },

  // ── Cartoon & Animation ──────────────────────────────────────────────────
  { name: 'Cartoon Pirate',          categoryId: C.CARTOON_CHAR,  generationPrompt: 'A cartoon pirate with an exaggerated big head, hook hand, eye patch, striped shirt, isolated on neutral background, full body front view' },
  { name: 'Cartoon Wizard',          categoryId: C.CARTOON_CHAR,  generationPrompt: 'A cute cartoon wizard with a big round head, oversized starry hat, tiny body, waving a wand, isolated on neutral background, full body' },
  { name: 'Friendly Cartoon Robot',  categoryId: C.CARTOON_CHAR,  generationPrompt: 'A friendly cartoon robot with a boxy body, round head with visor eyes, big cheery smile, isolated on neutral background, full body front view' },

  { name: 'Chibi Warrior',           categoryId: C.CHIBI,         generationPrompt: 'A chibi warrior character with a huge head and tiny body, holding an oversized sword, adorable expression, isolated on neutral background, full body' },
  { name: 'Chibi Cat Girl',          categoryId: C.CHIBI,         generationPrompt: 'A chibi catgirl with cat ears, large sparkling eyes, tiny cute body, paw-mittens, isolated on neutral background, full body' },
  { name: 'Chibi Baby Dragon',       categoryId: C.CHIBI,         generationPrompt: 'A chibi baby dragon with stubby wings, huge eyes, round body, sitting cutely, isolated on neutral background, full body' },

  { name: 'Anime School Hero',       categoryId: C.ANIME_CHAR,    generationPrompt: 'An anime high school hero in a school uniform with a cape, spiky hair, determined pose, isolated on neutral background, full body' },
  { name: 'Anime Ninja',             categoryId: C.ANIME_CHAR,    generationPrompt: 'An anime female ninja in dark bodysuit, kunai in hand, headband, intense expression, isolated on neutral background, full body' },
  { name: 'Anime Demon Slayer',      categoryId: C.ANIME_CHAR,    generationPrompt: 'An anime demon slayer in a patterned haori, holding a katana with flame effects, isolated on neutral background, full body' },

  { name: 'Low-Poly Tree',           categoryId: C.LOWPOLY,       generationPrompt: 'A geometric low-poly tree with flat triangular faces, distinct polygon shapes, bright green and brown colors, isolated on neutral background' },
  { name: 'Low-Poly Fox',            categoryId: C.LOWPOLY,       generationPrompt: 'A geometric low-poly fox with angular faceted surfaces, orange and white colors, isolated on neutral background, side view' },
  { name: 'Voxel Knight',            categoryId: C.LOWPOLY,       generationPrompt: 'A blocky voxel-art knight made of cubic voxels, simplified pixel-art style, sword and shield, isolated on neutral background, front view' },

  { name: 'Cartoon Bomb',            categoryId: C.TOON_PROP,     generationPrompt: 'A classic cartoon round black bomb with a lit fuse, googly eyes, isolated on neutral background' },
  { name: 'Toon Treasure Chest',     categoryId: C.TOON_PROP,     generationPrompt: 'A cartoon exaggerated treasure chest with a big shiny padlock, overflowing with gold, plump round design, isolated on neutral background' },
  { name: 'Bubble Cartoon Car',      categoryId: C.TOON_PROP,     generationPrompt: 'A cartoony round bubble-shaped car with exaggerated proportions, big round wheels, headlights with eyes, isolated on neutral background, three-quarter view' },

  { name: 'Game Studio Mascot Robot', categoryId: C.MASCOT,       generationPrompt: 'A friendly game studio mascot robot holding a game controller, small cute design, isolated on neutral background, full body front view' },
  { name: 'Sports Bear Mascot',      categoryId: C.MASCOT,        generationPrompt: 'A sports team mascot bear in a jersey, fist pumped, exaggerated athletic build, isolated on neutral background, full body' },
  { name: 'Dragon Company Mascot',   categoryId: C.MASCOT,        generationPrompt: 'A cute dragon company mascot with big eyes, holding a logo shield, friendly pose, isolated on neutral background, full body' },

  { name: 'Gingerbread House',       categoryId: C.STORYBOOK,     generationPrompt: 'A whimsical gingerbread house with candy decorations, frosting trim, chocolate door, sugar window panes, isolated on neutral background, front view' },
  { name: 'Fairy Tale Castle',       categoryId: C.STORYBOOK,     generationPrompt: 'A storybook fairy tale castle with pastel colors, round turrets, rainbow bridge, fluffy clouds around towers, isolated on neutral background, front view' },
  { name: 'Cinderella Pumpkin Carriage', categoryId: C.STORYBOOK, generationPrompt: 'A magical storybook pumpkin carriage glowing orange with golden filigree trim, no horses, fairy dust sparkles, isolated on neutral background' },

  { name: 'Achievement Badge',       categoryId: C.GAME_ICON,     generationPrompt: 'A 3D game achievement badge in a shield shape with a star emblem at center, gold and silver colors, isolated on neutral background, front view' },
  { name: 'Rank Diamond Icon',       categoryId: C.GAME_ICON,     generationPrompt: 'A 3D game rank icon shaped like a diamond with a lightning bolt inside, purple gradient, isolated on neutral background, front view' },
  { name: 'Spinning Power-Up Coin',  categoryId: C.GAME_ICON,     generationPrompt: 'A 3D spinning game power-up coin with a star embossed on its face, shiny gold color, slightly tilted, isolated on neutral background' },
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

// Maps sub-category ID → top-level category ID (for filtering in import modal)
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
