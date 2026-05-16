import { useUsers } from '@/features/server/users/hooks';
import {
    getLocalStorageItem,
    LocalStorageKey,
    setLocalStorageItem
} from '@/helpers/storage';
import { useEffect } from 'react';
import { toast } from 'sonner';

// "DD-MM" of tomorrow in the user's local timezone.
const tomorrowDDMM = (): string => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const dd = String(t.getDate()).padStart(2, '0');
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}`;
};

// ISO date (YYYY-MM-DD) of today, used to gate "shown once per day".
const todayISO = (): string => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

const useBirthdayToasts = () => {
    const users = useUsers();

    useEffect(() => {
        if (users.length === 0) return;

        const lastShown = getLocalStorageItem(
            LocalStorageKey.BIRTHDAY_LAST_SHOWN
        );
        const today = todayISO();

        if (lastShown === today) return;

        const target = tomorrowDDMM();
        const matches = users.filter(
            (u) => !u.banned && u.birthday && u.birthday === target
        );

        if (matches.length === 0) {
            setLocalStorageItem(LocalStorageKey.BIRTHDAY_LAST_SHOWN, today);
            return;
        }

        for (const u of matches) {
            toast(`🎂 Tomorrow is ${u.name}'s birthday!`, {
                duration: 8000
            });
        }

        setLocalStorageItem(LocalStorageKey.BIRTHDAY_LAST_SHOWN, today);
    }, [users]);
};

export { useBirthdayToasts };
