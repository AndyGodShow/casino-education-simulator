export interface OptionalGamePreloadInput {
  screenType: string;
  saveData?: boolean;
  effectiveType?: string;
}

const CONSTRAINED_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

export const shouldPreloadOptionalGames = ({
  screenType,
  saveData,
  effectiveType,
}: OptionalGamePreloadInput): boolean =>
  screenType === 'traditional'
  && saveData !== true
  && !CONSTRAINED_EFFECTIVE_TYPES.has(effectiveType ?? '');
