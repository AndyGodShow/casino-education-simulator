const aliases: Record<string, string> = {
  usa: 'usa',
  'united states': 'usa',
  'united states of america': 'usa',
  'korea republic': 'south-korea',
  'republic of korea': 'south-korea',
  'south korea': 'south-korea',
  turkiye: 'turkey',
  turkey: 'turkey',
  "cote d'ivoire": 'ivory-coast',
  'ivory coast': 'ivory-coast',
  'the netherlands': 'netherlands',
  netherlands: 'netherlands',
};

const identityKey = (value: string) => value
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’]/g, "'")
  .replace(/\s+/g, ' ')
  .toLowerCase();

export function strategyTeamId(value: string) {
  const key = identityKey(value);
  return aliases[key] ?? key
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
