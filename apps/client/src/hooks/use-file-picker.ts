import { useCallback } from 'react';

const useFilePicker = () => {
    const openFilePicker = useCallback(
        (accept: string = '*', multiple: boolean = false): Promise<File[]> => {
            return new Promise((resolve, reject) => {
                try {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = accept;
                    input.multiple = multiple;

                    input.onchange = () => {
                        if (!input.files) {
                            reject(new Error('No files selected'));
                            return;
                        }

                        resolve(Array.from(input.files));
                    };

                    input.click();
                } catch (err) {
                    reject(err);
                }
            });
        },
        []
    );

    return openFilePicker;
};

export { useFilePicker };
