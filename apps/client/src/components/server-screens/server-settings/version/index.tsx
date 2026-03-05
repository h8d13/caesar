import { closeServerScreens } from '@/features/server-screens/actions';
import { infoSelector } from '@/features/server/selectors';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group
} from '@sharkord/ui';
import { CheckCircle } from 'lucide-react';
import { memo } from 'react';
import { useSelector } from 'react-redux';

const Version = memo(() => {
    const info = useSelector(infoSelector);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Version</CardTitle>
                <CardDescription>
                    Current version information for your Sharkord server.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Group label="Current Version">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-mono">
                            {info?.version || 'Unknown'}
                        </span>
                    </div>
                </Group>

                <div className="flex justify-end pt-4">
                    <Button variant="outline" onClick={closeServerScreens}>
                        Close
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
});

export { Version };
