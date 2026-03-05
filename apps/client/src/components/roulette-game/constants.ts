import { BLACK_NUMBERS, RED_NUMBERS } from '@sharkord/shared/games/roulette';

// European roulette wheel order
export const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const getNumberColor = (n: number): 'red' | 'black' | 'green' => {
    if (n === 0) return 'green';
    if (RED_NUMBERS.includes(n)) return 'red';
    if (BLACK_NUMBERS.includes(n)) return 'black';
    return 'black';
};

// Standard roulette board layout: 3 columns × 12 rows
// Each row is [col1, col2, col3] reading left-to-right
export const BOARD_ROWS: number[][] = [
    [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
];
