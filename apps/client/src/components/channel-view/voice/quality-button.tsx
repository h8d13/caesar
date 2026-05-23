import { useMedia } from '@/features/server/voice/hooks';
import { cn } from '@/lib/utils';
import { StreamKind, type TStreamQualityLayer } from '@caesar/shared';
import {
    IconButton,
    Popover,
    PopoverContent,
    PopoverTrigger
} from '@caesar/ui';
import { Gauge } from 'lucide-react';
import { memo, useMemo } from 'react';

type TQualityButtonProps = {
    remoteId: number;
    kind: StreamKind.VIDEO | StreamKind.SCREEN | StreamKind.EXTERNAL_VIDEO;
};

// Auto = SFU adaptive (top layer requested, server downshifts on congestion).
// Anything else pins a spatial layer index that the producer published.
const buildOptions = (layers: TStreamQualityLayer[]) => {
    const sorted = [...layers].sort((a, b) => b.spatialLayer - a.spatialLayer);
    return [
        { key: 'auto', label: 'Auto', layer: null as number | null },
        ...sorted.map((l) => ({
            key: `layer-${l.spatialLayer}`,
            label: l.label,
            layer: l.spatialLayer
        }))
    ];
};

const QualityButton = memo(({ remoteId, kind }: TQualityButtonProps) => {
    const { getStreamQuality, setStreamQuality, getStreamQualityLayers } =
        useMedia();
    const layers = getStreamQualityLayers(remoteId, kind);
    const quality = getStreamQuality(remoteId, kind);
    const options = useMemo(() => buildOptions(layers), [layers]);

    if (layers.length === 0) return null;

    const activeKey =
        quality.mode === 'auto' ? 'auto' : `layer-${quality.spatialLayer}`;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <IconButton
                    variant="ghost"
                    icon={Gauge}
                    title="Stream Quality"
                    size="sm"
                />
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="bottom"
                className="w-40 p-1"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col">
                    {options.map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() =>
                                setStreamQuality(
                                    remoteId,
                                    kind,
                                    opt.layer === null
                                        ? { mode: 'auto' }
                                        : {
                                              mode: 'layer',
                                              spatialLayer: opt.layer
                                          }
                                )
                            }
                            className={cn(
                                'text-left px-2 py-1.5 rounded text-sm hover:bg-accent',
                                activeKey === opt.key &&
                                    'bg-accent font-medium'
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
});

QualityButton.displayName = 'QualityButton';

export { QualityButton };
