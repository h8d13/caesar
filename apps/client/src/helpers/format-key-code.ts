const KEY_CODE_LABELS: Record<string, string> = {
    Space: 'Space',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    MetaLeft: 'Left Meta',
    MetaRight: 'Right Meta',
    CapsLock: 'Caps Lock'
};

const MODIFIER_CODE_ORDER = [
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'ShiftLeft',
    'ShiftRight',
    'MetaLeft',
    'MetaRight'
];

// Turns a KeyboardEvent.code (e.g. "KeyA", "Digit1") into a short display
// label. Falls back to the raw code for keys we don't special-case.
const formatKeyCode = (code: string): string => {
    if (KEY_CODE_LABELS[code]) return KEY_CODE_LABELS[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
};

// Modifiers first (in a fixed order), then the rest alphabetically, so
// stored/displayed combos are deterministic regardless of press order.
const sortKeyCodes = (codes: string[]): string[] =>
    [...codes].sort((a, b) => {
        const aIndex = MODIFIER_CODE_ORDER.indexOf(a);
        const bIndex = MODIFIER_CODE_ORDER.indexOf(b);

        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
    });

const parseKeyCombo = (combo: string): string[] =>
    combo.split('+').filter(Boolean);

const formatKeyCombo = (combo: string): string =>
    parseKeyCombo(combo).map(formatKeyCode).join(' + ');

export { formatKeyCode, formatKeyCombo, parseKeyCombo, sortKeyCodes };
