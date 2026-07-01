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

// Turns a KeyboardEvent.code (e.g. "KeyA", "Digit1") into a short display
// label. Falls back to the raw code for keys we don't special-case.
const formatKeyCode = (code: string): string => {
    if (KEY_CODE_LABELS[code]) return KEY_CODE_LABELS[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
};

export { formatKeyCode };
