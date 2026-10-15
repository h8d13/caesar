import { type RectangleLayer } from '@caesar/shared';
import { memo } from 'react';
import { getLayerStyle } from '../utils';

type RectangleProps = {
    layer: RectangleLayer;
    onPointerDown?: (e: React.PointerEvent) => void;
    selectionColor?: string;
};

const Rectangle = memo(
    ({ layer, onPointerDown, selectionColor }: RectangleProps) => {
        const { x, y, width, height, fill } = layer;

        return (
            <rect
                onPointerDown={onPointerDown}
                x={0}
                y={0}
                width={width}
                height={height}
                style={getLayerStyle(x, y, fill, selectionColor)}
            />
        );
    }
);

export { Rectangle };
