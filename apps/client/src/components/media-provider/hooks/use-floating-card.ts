import {
    getLocalStorageItemAsJSON,
    LocalStorageKey,
    setLocalStorageItemAsJSON
} from '@/helpers/storage';
import { useCallback, useEffect, useRef, useState } from 'react';

type TPosition = {
    x: number;
    y: number;
};

type TSize = {
    width: number;
    height: number;
};

type TResizeEdge = 'se' | 's' | 'e' | 'sw' | 'w';

const DEFAULT_SIZE: TSize = { width: 384, height: 216 };
const MIN_WIDTH = 200;
const MIN_HEIGHT = 112;

export const useFloatingCard = (
    positionKey: LocalStorageKey = LocalStorageKey.FLOATING_CARD_POSITION,
    sizeKey: LocalStorageKey = LocalStorageKey.FLOATING_CARD_SIZE
) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<TPosition | undefined>(
        getLocalStorageItemAsJSON<TPosition>(positionKey)
    );
    const [size, setSize] = useState<TSize>(
        getLocalStorageItemAsJSON<TSize>(sizeKey) ??
            DEFAULT_SIZE
    );
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const resizeInfo = useRef<{
        edge: TResizeEdge;
        startX: number;
        startY: number;
        startWidth: number;
        startHeight: number;
        // Card's top-left in parent coords at resize start. Needed for
        // sw/w edges which grow the box leftward, which requires updating
        // position.x in lock-step with the width change.
        startLeft: number;
        startTop: number;
    } | null>(null);

    useEffect(() => {
        if (position) {
            setLocalStorageItemAsJSON<TPosition>(positionKey, position);
        }
    }, [position, positionKey]);

    useEffect(() => {
        setLocalStorageItemAsJSON<TSize>(sizeKey, size);
    }, [size, sizeKey]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!cardRef.current) return;

        const rect = cardRef.current.getBoundingClientRect();
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    }, []);

    const handleResizeMouseDown = useCallback(
        (e: React.MouseEvent, edge: TResizeEdge) => {
            e.stopPropagation();
            if (!cardRef.current) return;

            const rect = cardRef.current.getBoundingClientRect();
            const parentRect =
                cardRef.current.parentElement?.getBoundingClientRect();
            resizeInfo.current = {
                edge,
                startX: e.clientX,
                startY: e.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
                startLeft: rect.left - (parentRect?.left ?? 0),
                startTop: rect.top - (parentRect?.top ?? 0)
            };
        },
        []
    );

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (resizeInfo.current) {
                const {
                    edge,
                    startX,
                    startY,
                    startWidth,
                    startHeight,
                    startLeft,
                    startTop
                } = resizeInfo.current;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                const growsLeft = edge === 'sw' || edge === 'w';
                const onlyHorizontal = edge === 'e' || edge === 'w';
                const onlyVertical = edge === 's';

                const intendedWidth = growsLeft
                    ? startWidth - dx
                    : startWidth + dx;
                const newWidth = onlyVertical
                    ? startWidth
                    : Math.max(MIN_WIDTH, intendedWidth);
                const newHeight = onlyHorizontal
                    ? startHeight
                    : Math.max(MIN_HEIGHT, startHeight + dy);

                setSize({ width: newWidth, height: newHeight });

                if (growsLeft) {
                    // Pin the right edge: as width clamps to MIN_WIDTH, left
                    // stops moving instead of overshooting.
                    const widthDelta = startWidth - newWidth;
                    setPosition({
                        x: Math.max(0, startLeft + widthDelta),
                        y: startTop
                    });
                }
                return;
            }

            if (!isDragging || !cardRef.current) return;

            const parent = cardRef.current.parentElement;
            if (!parent) return;

            const parentRect = parent.getBoundingClientRect();
            const cardRect = cardRef.current.getBoundingClientRect();

            let newX = e.clientX - parentRect.left - dragOffset.x;
            let newY = e.clientY - parentRect.top - dragOffset.y;

            newX = Math.max(
                0,
                Math.min(newX, parentRect.width - cardRect.width)
            );
            newY = Math.max(
                0,
                Math.min(newY, parentRect.height - cardRect.height)
            );

            setPosition({ x: newX, y: newY });
        },
        [isDragging, dragOffset]
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        resizeInfo.current = null;
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const getStyle = useCallback(() => {
        return {
            right: position ? undefined : '1rem',
            bottom: position ? undefined : '1rem',
            left: position ? `${position.x}px` : undefined,
            top: position ? `${position.y}px` : undefined,
            width: `${size.width}px`,
            height: `${size.height}px`
        };
    }, [position, size]);

    const resetCard = useCallback(() => {
        setPosition(undefined);
        setSize(DEFAULT_SIZE);
    }, []);

    return {
        cardRef,
        handleMouseDown,
        handleResizeMouseDown,
        getStyle,
        resetCard
    };
};
