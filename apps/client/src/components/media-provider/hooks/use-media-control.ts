import { useContext } from 'react';
import { MediaControlContext } from '../media-control-context';

const useMediaControl = () => {
    const context = useContext(MediaControlContext);

    if (!context) {
        throw new Error(
            'useMediaControl must be used within MediaControlProvider'
        );
    }

    return context;
};

export { useMediaControl };
