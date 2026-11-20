// clamp lightness into the theme's readable band so white/black
// roles stay visible on both themes, hue untouched
const getReadableRoleColor = (color: string): string =>
    `oklch(from ${color} clamp(var(--role-color-l-min), l, var(--role-color-l-max)) c h)`;

export { getReadableRoleColor };
