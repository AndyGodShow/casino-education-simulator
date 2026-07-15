export interface DicePip {
    row: number;
    col: number;
}

const DICE_PIP_PATTERNS: Record<number, DicePip[]> = {
    1: [{ row: 1, col: 1 }],
    2: [{ row: 0, col: 0 }, { row: 2, col: 2 }],
    3: [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
    4: [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 2, col: 0 }, { row: 2, col: 2 }],
    5: [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 2 }],
    6: [{ row: 0, col: 0 }, { row: 0, col: 2 }, { row: 1, col: 0 }, { row: 1, col: 2 }, { row: 2, col: 0 }, { row: 2, col: 2 }],
};

export const getDicePips = (value: number): DicePip[] => DICE_PIP_PATTERNS[value] ?? [];
