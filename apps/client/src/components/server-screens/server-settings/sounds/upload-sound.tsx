import { Button, Card, CardContent } from '@caesar/ui';
import { Upload, Volume2 } from 'lucide-react';
import { memo } from 'react';

type TUploadSoundProps = {
    uploadSound: () => void;
    isUploading: boolean;
};

const UploadSound = memo(({ uploadSound, isUploading }: TUploadSoundProps) => {
    return (
        <Card className="flex flex-1 items-center justify-center">
            <CardContent className="py-12 text-center text-muted-foreground max-w-md">
                <Volume2 className="h-10 w-10 mx-auto mb-4" />
                <h3 className="font-medium mb-2">Upload Sounds</h3>
                <p className="text-sm mb-4">
                    Select a sound to edit or upload new ones to customize your
                    server&apos;s soundboard
                </p>
                <Button onClick={uploadSound} disabled={isUploading}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Sounds
                </Button>
            </CardContent>
        </Card>
    );
});

export { UploadSound };
