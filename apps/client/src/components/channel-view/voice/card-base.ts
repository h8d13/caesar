// Wrapper-div Tailwind classes shared by every voice card (user,
// screen share, external stream). Each card composes its own additions
// on top via cn(...voiceCardBaseClasses, ...extras).
const voiceCardBaseClasses = [
    'relative bg-card rounded-lg overflow-hidden group',
    'flex items-center justify-center',
    'w-full h-full',
    'border border-border'
];

export { voiceCardBaseClasses };
