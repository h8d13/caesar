const getInitialsFromName = (name: string): string => {
    const names = name.trim().split(' ');
    if (names.length === 0) return '';
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return names[0].charAt(0).toUpperCase() + names[1].charAt(0).toUpperCase();
};

export { getInitialsFromName };
