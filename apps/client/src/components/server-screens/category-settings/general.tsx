import { SettingsFooterActions } from '@/components/server-screens/settings-footer-actions';
import { useAdminCategoryGeneral } from '@/features/server/admin/hooks';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Group,
    Input
} from '@caesar/ui';
import { memo } from 'react';

type TGeneralProps = {
    categoryId: number;
};

const General = memo(({ categoryId }: TGeneralProps) => {
    const { category, loading, onChange, submit, errors } =
        useAdminCategoryGeneral(categoryId);

    if (!category) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Category Information</CardTitle>
                <CardDescription>
                    Manage your category's basic information
                </CardDescription>
                <SettingsFooterActions onSave={submit} loading={loading} />
            </CardHeader>
            <CardContent className="space-y-4">
                <Group label="Name">
                    <Input
                        value={category.name}
                        onChange={(e) => onChange('name', e.target.value)}
                        placeholder="Enter category name"
                        error={errors.name}
                    />
                </Group>
            </CardContent>
        </Card>
    );
});

export { General };
