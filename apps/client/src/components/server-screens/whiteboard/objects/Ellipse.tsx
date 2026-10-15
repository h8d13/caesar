import { type EllipseLayer } from '@caesar/shared';
import { memo } from 'react';
import { getLayerStyle } from '../utils';

type EllipseProps = {
    layer: EllipseLayer;
    onPointerDown?: (e: React.PointerEvent) => void;
    selectionColor?: string;
};

const Ellipse = memo(
    ({ layer, onPointerDown, selectionColor }: EllipseProps) => {
        const { x, y, width, height, fill } = layer;

        return (
            <ellipse
                onPointerDown={onPointerDown}
                cx={width / 2}
                cy={height / 2}
                rx={width / 2}
                ry={height / 2}
                style={getLayerStyle(x, y, fill, selectionColor)}
            />
        );
    }
);

export { Ellipse };
