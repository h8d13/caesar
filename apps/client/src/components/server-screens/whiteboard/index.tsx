import { memo } from 'react';
import { ServerScreenLayout } from '../server-screen-layout';
import { WhiteboardPanel } from './WhiteboardPanel';

type TWhiteboardProps = {
    close: () => void;
};

const Whiteboard = memo(({ close }: TWhiteboardProps) => {
    return (
        <ServerScreenLayout close={close} title="Whiteboard">
            <div className="flex h-full flex-col">
                <WhiteboardPanel />
            </div>
        </ServerScreenLayout>
    );
});

export { Whiteboard };
