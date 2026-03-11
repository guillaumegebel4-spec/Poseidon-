// ============================================================
// POSEIDON — STEELPINE ART DIRECTION COLOR PALETTE
// Inspired by the Steelpine visual universe by Xesus bobomb
// Bold illustration style, muted terracotta/sage/steel tones
// ============================================================

export const PALETTE = {
  // Core background
  bg:           '#EDE4D3',
  bgDark:       '#0D0A08',
  bgMid:        '#1A1208',

  // Terracotta Red family (dominant accent)
  red:          '#C4614A',
  redLight:     '#D4816A',
  redMid:       '#B85040',
  redDark:      '#7A3020',
  redDeep:      '#5A2018',

  // Sage Green family
  green:        '#5B8C5A',
  greenLight:   '#7BAC7A',
  greenMid:     '#4A7A49',
  greenDark:    '#2A5A29',
  greenPale:    '#A0C890',

  // Steel Blue/Grey family
  steel:        '#6B7FA3',
  steelLight:   '#8B9FC3',
  steelMid:     '#4A5E82',
  steelDark:    '#2A3A5A',
  steelPale:    '#B0C0D8',

  // Warm Browns
  brown:        '#8B7355',
  brownLight:   '#A89370',
  brownMid:     '#6A5240',
  brownDark:    '#3A2A1A',
  beige:        '#D4C5A9',
  cream:        '#F0E8D8',

  // Near-black ink (outlines)
  ink:          '#1A1008',
  inkMid:       '#2A1F1A',
  inkLight:     '#3A2F28',

  // Gold / Antique
  gold:         '#C8A850',
  goldLight:    '#E0C870',
  goldDark:     '#8A7030',

  // Biome: Volcanic/Ember Wastes (purple-pink)
  volcanic:     '#7B6A9C',
  volcanicLight:'#9B8ABC',
  volcanicDark: '#4A3A6A',
  volcanicPink: '#C4A0B0',
  lava:         '#E87840',
  lavaLight:    '#F89860',
  lavaGlow:     '#FF6020',
  ember:        '#E84020',

  // Biome: Steelpine Forest (rich greens)
  forest:       '#3A6A39',
  forestLight:  '#5A8A59',
  forestDark:   '#1A3A19',
  forestFloor:  '#7A6A4A',
  bark:         '#5A4A3A',
  moss:         '#8A9A5A',

  // Biome: Neon Hub (cyberpunk)
  cyber:        '#0A1A2A',
  neon:         '#40E8F0',
  neonGreen:    '#40E880',
  neonPink:     '#F040A8',
  panel:        '#1A2A3A',
  circuit:      '#305060',

  // Biome: Ancient Ruins
  stone:        '#8A8A7A',
  stoneLight:   '#B0B0A0',
  stoneDark:    '#5A5A4A',
  portal:       '#60A8D0',
  portalGlow:   '#A0D8F8',
  water:        '#4A90B0',
  waterLight:   '#70B0D0',

  // Crystal / Magic
  crystal:      '#90C8D0',
  crystalGlow:  '#C0F0F8',
  crystalDeep:  '#4A8898',
  magic:        '#A060D0',
  magicGlow:    '#D090F8',

  // UI Colors
  uiBg:         'rgba(13, 10, 8, 0.85)',
  uiBorder:     '#3A2F28',
  uiAccent:     '#C4614A',
  uiText:       '#EDE4D3',
  uiTextMuted:  '#8B7355',
  uiHealth:     '#C4614A',
  uiMana:       '#6B7FA3',
  uiStamina:    '#5B8C5A',
  uiXP:         '#C8A850',
};

// Pre-computed hex to int conversions for Phaser
export const INT = {};
Object.keys(PALETTE).forEach(key => {
  const hex = PALETTE[key];
  if (hex.startsWith('#')) {
    INT[key] = parseInt(hex.replace('#', ''), 16);
  }
});

// Biome color sets
export const BIOME_PALETTES = {
  forest: {
    tileTop:    PALETTE.forest,
    tileLeft:   PALETTE.forestDark,
    tileRight:  PALETTE.forestFloor,
    accent:     PALETTE.greenLight,
    ambient:    PALETTE.greenPale,
    fog:        'rgba(90, 140, 90, 0.15)',
    sky:        '#1A2A0A',
  },
  volcanic: {
    tileTop:    PALETTE.volcanicPink,
    tileLeft:   PALETTE.volcanicDark,
    tileRight:  PALETTE.volcanic,
    accent:     PALETTE.lava,
    ambient:    PALETTE.ember,
    fog:        'rgba(120, 50, 20, 0.2)',
    sky:        '#1A0A08',
  },
  cyber: {
    tileTop:    PALETTE.panel,
    tileLeft:   PALETTE.cyber,
    tileRight:  PALETTE.circuit,
    accent:     PALETTE.neon,
    ambient:    PALETTE.neonGreen,
    fog:        'rgba(0, 80, 100, 0.2)',
    sky:        '#050A0F',
  },
  ruins: {
    tileTop:    PALETTE.stoneLight,
    tileLeft:   PALETTE.stoneDark,
    tileRight:  PALETTE.stone,
    accent:     PALETTE.portal,
    ambient:    PALETTE.portalGlow,
    fog:        'rgba(70, 90, 110, 0.15)',
    sky:        '#0A0F15',
  },
};
