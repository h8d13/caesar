import { formatKeyCode } from '@/helpers/format-key-code';
import { Badge, Button } from '@caesar/ui';
import { memo, useEffect, useState } from 'react';

type TPushToTalkKeyPickerProps = {
    keyCode: string;
    onKeyCodeChange: (code: string) => void;
    disabled?: boolean;
};

const PushToTalkKeyPicker = memo(
    ({ keyCode, onKeyCodeChange, disabled }: TPushToTalkKeyPickerProps) => {
        const [listening, setListening] = useState(false);

        useEffect(() => {
            if (!listening) return;

            const handleKeyDown = (event: KeyboardEvent) => {
                event.preventDefault();

                if (event.code !== 'Escape') {
                    onKeyCodeChange(event.code);
                }

                setListening(false);
            };

            window.addEventListener('keydown', handleKeyDown);

            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [listening, onKeyCodeChange]);

        return (
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => setListening(true)}
            >
                {listening ? (
                    'Press any key...'
                ) : (
                    <>
                        Key:{' '}
                        <Badge variant="secondary">
                            {formatKeyCode(keyCode)}
                        </Badge>
                    </>
                )}
            </Button>
        );
    }
);

export default PushToTalkKeyPicker;
