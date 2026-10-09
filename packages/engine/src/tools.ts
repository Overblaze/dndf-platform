// The tools of the 5th Edition rules (SRD 5.1, pp. 154–155), offered as suggestions where a character
// is asked to name one. Any name may be typed: the handbooks and a DM add their own.
export const TOOL_KINDS: { id: 'artisan' | 'gaming' | 'instrument' | 'kit' | 'vehicle'; name: string; tools: string[] }[] = [
  {
    id: 'artisan', name: 'Artisan’s tools',
    tools: ['Alchemist’s supplies', 'Brewer’s supplies', 'Calligrapher’s supplies', 'Carpenter’s tools', 'Cartographer’s tools', 'Cobbler’s tools', 'Cook’s utensils', 'Glassblower’s tools',
      'Jeweler’s tools', 'Leatherworker’s tools', 'Mason’s tools', 'Painter’s supplies', 'Potter’s tools', 'Smith’s tools', 'Tinker’s tools', 'Weaver’s tools', 'Woodcarver’s tools'],
  },
  { id: 'gaming', name: 'Gaming sets', tools: ['Dice set', 'Playing card set'] },
  { id: 'instrument', name: 'Musical instruments', tools: ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Lute', 'Lyre', 'Horn', 'Pan flute', 'Shawm', 'Viol'] },
  { id: 'kit', name: 'Kits and other tools', tools: ['Disguise kit', 'Forgery kit', 'Herbalism kit', 'Navigator’s tools', 'Poisoner’s kit', 'Thieves’ tools'] },
  { id: 'vehicle', name: 'Vehicles', tools: ['Vehicles (land)', 'Vehicles (water)'] },
];

/**
 * The tools to suggest for a choice, from the book's own words for it: "One type of gaming set or Thieves’
 * Tools" suggests the gaming sets and thieves' tools; "Two of your choice" suggests them all.
 */
export function toolSuggestions(label: string): string[] {
  const said = label.toLowerCase();
  const kinds = TOOL_KINDS.filter((kind) =>
    (kind.id === 'artisan' && /artisan/.test(said)) || (kind.id === 'gaming' && /gaming/.test(said)) || (kind.id === 'instrument' && /instrument/.test(said)));
  const named = TOOL_KINDS.flatMap((kind) => kind.tools).filter((tool) => said.includes(tool.toLowerCase().replace(/’/g, "'")) || said.includes(tool.toLowerCase()));
  const found = [...kinds.flatMap((kind) => kind.tools), ...named];
  return found.length ? [...new Set(found)] : TOOL_KINDS.flatMap((kind) => kind.tools);
}
