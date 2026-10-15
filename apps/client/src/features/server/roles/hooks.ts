import type { IRootState } from '@/features/store';
import { useSelector } from 'react-redux';
import {
    defaultRoleSelector,
    roleByIdSelector,
    rolesSelector
} from './selectors';

export const useDefaultRole = () => useSelector(defaultRoleSelector);

export const useRoleById = (roleId: number) =>
    useSelector((state: IRootState) => roleByIdSelector(state, roleId));

export const useRoles = () => useSelector(rolesSelector);
