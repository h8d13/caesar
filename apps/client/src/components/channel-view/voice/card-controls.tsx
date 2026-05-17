import { memo } from 'react';

// Wrapper-div classes shared by every voice card (user, screen share,
// external stream). Each card composes its own additions on top via cn().
const voiceCardBaseClasses = [
    'relative bg-card rounded-lg overflow-hidden group',
    'flex items-center justify-center',
    'w-full h-full',
    'border border-border'
];

type TCardControlsProps = {
    children?: React.ReactNode;
};

const CardControls = memo(({ children }: TCardControlsProps) => {
    return (
        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-1">
            {children}
        </div>
    );
});

export { CardControls, voiceCardBaseClasses };
