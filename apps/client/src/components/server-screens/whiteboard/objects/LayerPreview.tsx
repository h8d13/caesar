import { type Layer, LayerType } from '@caesar/shared';
import { memo } from 'react';
import { Arrow } from './Arrow';
import { Ellipse } from './Ellipse';
import { Line } from './Line';
import { Note } from './Note';
import { Path } from './Path';
import { Polygon } from './Polygon';
import { Rectangle } from './Rectangle';
import { Text } from './Text';

// Handlers take the layer id and are shared by every layer: binding
// them here keeps props stable, so a board re-render (pen draft, cursor,
// camera) skips layers that did not change.
type LayerPreviewProps = {
    layerId: string;
    layer: Layer;
    onLayerPointerDown: (e: React.PointerEvent, layerId: string) => void;
    selectionColor?: string;
    onLayerValueChange: (layerId: string, value: string) => void;
    isEditing?: boolean;
};

const LayerPreview = memo(
    ({
        layerId,
        layer,
        onLayerPointerDown,
        selectionColor,
        onLayerValueChange,
        isEditing
    }: LayerPreviewProps) => {
        const onPointerDown = (e: React.PointerEvent) =>
            onLayerPointerDown(e, layerId);
        const onValueChange = (value: string) =>
            onLayerValueChange(layerId, value);

        switch (layer.type) {
            case LayerType.Rectangle:
                return (
                    <Rectangle
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                    />
                );
            case LayerType.Ellipse:
                return (
                    <Ellipse
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                    />
                );
            case LayerType.Triangle:
            case LayerType.Hexagon:
                return (
                    <Polygon
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                    />
                );
            case LayerType.Line:
                return (
                    <Line
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                    />
                );
            case LayerType.Arrow:
                return (
                    <Arrow
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                    />
                );
            case LayerType.Path:
                return (
                    <Path
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                    />
                );
            case LayerType.Text:
                return (
                    <Text
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                        onValueChange={onValueChange}
                        isEditing={isEditing}
                    />
                );
            case LayerType.Note:
                return (
                    <Note
                        layer={layer}
                        onPointerDown={onPointerDown}
                        selectionColor={selectionColor}
                        onValueChange={onValueChange}
                    />
                );
            default:
                return null;
        }
    }
);

export { LayerPreview };
