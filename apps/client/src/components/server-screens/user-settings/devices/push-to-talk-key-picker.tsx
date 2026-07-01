import { formatKeyCombo, sortKeyCodes } from '@/helpers/format-key-code';
import { Badge, Button } from '@caesar/ui';
import { memo, useEffect, useState } from 'react';

type TPushToTalkKeyPickerProps = {
    combo: string;
    onComboChange: (combo: string) => void;
    disabled?: boolean;
};

const PushToTalkKeyPicker = memo(
    ({ combo, onComboChange, disabled }: TPushToTalkKeyPickerProps) => {
        const [listening, setListening] = useState(false);

        useEffect(() => {
            if (!listening) return;

            const captured = new Set<string>();

            const handleKeyDown = (event: KeyboardEvent) => {
                event.preventDefault();

                if (event.code === 'Escape') {
                    setListening(false);
                    return;
                }

                captured.add(event.code);
            };

            // Finalize on the first key release: whatever was held together
            // up to that point becomes the combo. Mirrors how most hotkey
            // recorders (VS Code, Mousetrap, etc.) capture chords.
            const handleKeyUp = (event: KeyboardEvent) => {
                event.preventDefault();

                if (captured.size === 0) return;

                onComboChange(sortKeyCodes([...captured]).join('+'));
                setListening(false);
            };

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);

            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('keyup', handleKeyUp);
            };
        }, [listening, onComboChange]);

        return (
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => setListening(true)}
            >
                {listening ? (
                    'Hold the key(s), then release...'
                ) : (
                    <>
                        Key:{' '}
                        <Badge variant="secondary">
                            {formatKeyCombo(combo)}
                        </Badge>
                    </>
                )}
            </Button>
        );
    }
);

export default PushToTalkKeyPicker;
