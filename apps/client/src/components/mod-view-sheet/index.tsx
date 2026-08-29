import { setModViewOpen } from '@/features/app/actions';
import { useModViewOpen } from '@/features/app/hooks';
import { useAdminUserInfo } from '@/features/server/admin/hooks';
import { extractUrls } from '@caesar/shared';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@caesar/ui';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ModViewContext, ModViewScreen, type TModViewContext } from './context';
import { ModViewContent } from './mod-view-content';

type TContentWrapperProps = {
    userId: number;
};

const ContentWrapper = memo(({ userId }: TContentWrapperProps) => {
    const [currentView, setCurrentView] = useState<ModViewScreen | undefined>(
        undefined
    );
    const { user, loading, refetch, lastLoginIp, files, messages, storage } =
        useAdminUserInfo(userId);

    const contextValue = useMemo<TModViewContext>(() => {
        const links: string[] = messages
            .map((msg) => extractUrls(msg.content ?? ''))
            .flat()
            .filter((value, index, self) => self.indexOf(value) === index);

        return {
            userId,
            user: user!,
            lastLoginIp,
            files,
            storage,
            messages,
            links,
            refetch,
            view: currentView,
            setView: setCurrentView
        };
    }, [
        userId,
        refetch,
        files,
        storage,
        user,
        lastLoginIp,
        messages,
        currentView
    ]);

    if (loading || !user) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground">Loading...</p>
            </div>
        );
    }

    return (
        <ModViewContext.Provider value={contextValue}>
            <ModViewContent key={userId} />
        </ModViewContext.Provider>
    );
});

const ModViewSheet = memo(() => {
    const { isOpen, userId } = useModViewOpen();

    const handleClose = useCallback(() => {
        setModViewOpen(false);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen, handleClose]);

    return (
        <Sheet defaultOpen={false} open={isOpen}>
            <SheetContent close={handleClose}>
                <SheetTitle className="sr-only">
                    User Moderation Panel
                </SheetTitle>
                <SheetDescription className="sr-only">
                    Moderation actions and details for the selected user
                </SheetDescription>
                {userId && <ContentWrapper userId={userId} />}
            </SheetContent>
        </Sheet>
    );
});

export { ModViewSheet };
