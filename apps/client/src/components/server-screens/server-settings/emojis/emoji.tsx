import { cn } from '@/lib/utils';
import { memo } from 'react';

type TEmojiProps = {
    src: string;
    name: string;
    className?: string;
    onClick?: () => void;
};

const Emoji = memo(({ src, name, onClick, className }: TEmojiProps) => {
    return (
        <div
            className={cn('rounded-md cursor-pointer aspect-square', className)}
            onClick={onClick}
        >
            <img
                src={src}
                alt={name}
                className="w-full h-full rounded-md object-cover"
            />
        </div>
    );
});

export { Emoji };
