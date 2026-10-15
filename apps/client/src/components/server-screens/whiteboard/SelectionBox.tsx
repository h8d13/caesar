import { type Layer, LayerType, Side } from '@caesar/shared';
import { memo } from 'react';

type SelectionBoxProps = {
    layers: Record<string, Layer>;
    selection: string[];
    onResizeHandlePointerDown: (
        corner: Side,
        initialBounds: { x: number; y: number; width: number; height: number }
    ) => void;
};

const HANDLE_WIDTH = 8;

const SelectionBox = memo(
    ({ layers, selection, onResizeHandlePointerDown }: SelectionBoxProps) => {
        if (selection.length === 0) return null;

        // Skip selection box for lines/arrows they highlight themselves
        const selectedType =
            selection.length === 1 ? layers[selection[0]]?.type : null;
        if (
            selectedType === LayerType.Line ||
            selectedType === LayerType.Arrow
        ) {
            return null;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const id of selection) {
            const layer = layers[id];
            if (!layer) continue;
            minX = Math.min(minX, layer.x);
            minY = Math.min(minY, layer.y);
            maxX = Math.max(maxX, layer.x + layer.width);
            maxY = Math.max(maxY, layer.y + layer.height);
        }

        if (!isFinite(minX)) return null;

        const bounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };

        const handlePointerDown = (corner: Side) => (e: React.PointerEvent) => {
            e.stopPropagation();
            onResizeHandlePointerDown(corner, bounds);
        };

        return (
            <>
                <rect
                    x={bounds.x}
                    y={bounds.y}
                    width={bounds.width}
                    height={bounds.height}
                    fill="transparent"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    pointerEvents="none"
                    style={{ strokeDasharray: '5 5' }}
                />
                {/* Corner handles. Encoded as data so adding/removing
                    a handle (e.g. mid-edge resize) is one array entry. */}
                {(
                    [
                        {
                            side: Side.Top + Side.Left,
                            dx: 0,
                            dy: 0,
                            cursor: 'nwse-resize'
                        },
                        {
                            side: Side.Top + Side.Right,
                            dx: bounds.width,
                            dy: 0,
                            cursor: 'nesw-resize'
                        },
                        {
                            side: Side.Bottom + Side.Left,
                            dx: 0,
                            dy: bounds.height,
                            cursor: 'nesw-resize'
                        },
                        {
                            side: Side.Bottom + Side.Right,
                            dx: bounds.width,
                            dy: bounds.height,
                            cursor: 'nwse-resize'
                        }
                    ] as const
                ).map(({ side, dx, dy, cursor }) => (
                    <rect
                        key={side}
                        x={bounds.x + dx - HANDLE_WIDTH / 2}
                        y={bounds.y + dy - HANDLE_WIDTH / 2}
                        width={HANDLE_WIDTH}
                        height={HANDLE_WIDTH}
                        fill="white"
                        stroke="#3b82f6"
                        strokeWidth={1}
                        style={{ cursor }}
                        onPointerDown={handlePointerDown(side)}
                    />
                ))}
            </>
        );
    }
);

export { SelectionBox };
