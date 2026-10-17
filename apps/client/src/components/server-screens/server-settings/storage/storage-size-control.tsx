import { Button, Input, Slider } from '@caesar/ui';
import { memo, useCallback, useState, type ReactNode } from 'react';
import { FILE_SIZE_STEP, MEGABYTE } from './presets';

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));

type TStorageControlPreset = {
    label: string;
    value: number;
};

type TStorageSizeControlProps = {
    value: number;
    min: number;
    max: number;
    disabled?: boolean;
    onChange: (value: number) => void;
    preview: ReactNode;
    presets: TStorageControlPreset[];
};

const StorageSizeControl = memo(
    ({
        value,
        min,
        max,
        disabled,
        onChange,
        preview,
        presets
    }: TStorageSizeControlProps) => {
        const valueInMb = Math.round(Number(value) / MEGABYTE);

        // Clamping on every keystroke made values unreachable whenever the
        // minimum exceeds a partial entry (quota min is 1024 MB: typing "2"
        // snapped to 1024). Edit a draft, clamp and commit on blur/Enter.
        const [draft, setDraft] = useState<string | null>(null);

        const commitDraft = useCallback(() => {
            if (draft === null) return;

            const nextValue = Number(draft);

            setDraft(null);

            if (draft.trim() === '' || !Number.isFinite(nextValue)) return;

            onChange(clamp(nextValue * MEGABYTE, min, max));
        }, [draft, onChange, min, max]);

        return (
            <div className="max-w-150 space-y-2">
                <Slider
                    value={[Number(value)]}
                    max={max}
                    min={min}
                    step={FILE_SIZE_STEP}
                    disabled={disabled}
                    onValueChange={(values) =>
                        onChange(clamp(values[0], min, max))
                    }
                    rightSlot={<span className="text-sm">{preview}</span>}
                />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            className="w-28"
                            min={Math.ceil(min / MEGABYTE)}
                            max={Math.floor(max / MEGABYTE)}
                            step={1}
                            value={draft ?? valueInMb}
                            disabled={disabled}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitDraft}
                            onEnter={commitDraft}
                        />
                        <span className="text-xs text-muted-foreground">
                            MB
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {presets.map((preset) => (
                            <Button
                                key={preset.value}
                                size="sm"
                                variant="outline"
                                disabled={disabled}
                                onClick={() => onChange(preset.value)}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
);

export { StorageSizeControl };
