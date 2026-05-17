import { type PathLayer } from '@caesar/shared';
import getStroke from 'perfect-freehand';
import { memo } from 'react';
import { getLayerStyle, getSvgPathFromStroke } from '../utils';

type PathProps = {
    layer: PathLayer;
    onPointerDown?: (e: React.PointerEvent) => void;
    selectionColor?: string;
};

const Path = memo(({ layer, onPointerDown, selectionColor }: PathProps) => {
    const { x, y, fill, points, strokeSize } = layer;

    const stroke = getStroke(points, {
        size: strokeSize ?? 16,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5
    });

    const pathData = getSvgPathFromStroke(stroke);

    return (
        <path
            onPointerDown={onPointerDown}
            d={pathData}
            style={getLayerStyle(x, y, fill, selectionColor)}
        />
    );
});

export { Path };
