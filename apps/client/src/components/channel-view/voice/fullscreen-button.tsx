import { IconButton } from '@caesar/ui';
import { Maximize, Minimize } from 'lucide-react';
import { memo, type RefObject, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type TFullscreenButtonProps = {
    containerRef: RefObject<HTMLDivElement | null>;
};

const FullscreenButton = memo(({ containerRef }: TFullscreenButtonProps) => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(
                document.fullscreenElement === containerRef.current
            );
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener(
                'fullscreenchange',
                handleFullscreenChange
            );
        };
    }, [containerRef]);

    const handleToggle = useCallback(() => {
        if (!containerRef.current) return;

        if (document.fullscreenElement === containerRef.current) {
            // only rejects when nothing is fullscreen, ruled out above
            void document.exitFullscreen();
        } else {
            // refused without a user gesture or by a permissions policy
            containerRef.current.requestFullscreen().catch(() => {
                toast.error('Fullscreen is not available');
            });
        }
    }, [containerRef]);

    return (
        <IconButton
            variant={isFullscreen ? 'default' : 'ghost'}
            icon={isFullscreen ? Minimize : Maximize}
            onClick={handleToggle}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            size="sm"
        />
    );
});

export { FullscreenButton };
