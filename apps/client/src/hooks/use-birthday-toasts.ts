import { useUsers } from '@/features/server/users/hooks';
import {
    getLocalStorageItem,
    LocalStorageKey,
    setLocalStorageItem
} from '@/helpers/storage';
import { useEffect } from 'react';
import { toast } from 'sonner';

// "MM-DD" of tomorrow in the user's local timezone. We only care about
// month and day for matching the user's birth year is stored but not
// used in the comparison.
const tomorrowMMDD = (): string => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    const dd = String(t.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
};

// "MM-DD" portion of an ISO "YYYY-MM-DD" birthday.
const birthdayMMDD = (iso: string | null): string | null => {
    if (!iso) return null;
    const match = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return `${match[1]}-${match[2]}`;
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

        const target = tomorrowMMDD();
        const matches = users.filter(
            (u) => !u.banned && birthdayMMDD(u.birthday) === target
        );

        if (matches.length === 0) return;

        for (const u of matches) {
            toast(`🎂 Tomorrow is ${u.name}'s birthday!`, {
                duration: 8000
            });
        }

        setLocalStorageItem(LocalStorageKey.BIRTHDAY_LAST_SHOWN, today);
    }, [users]);
};

export { useBirthdayToasts };
