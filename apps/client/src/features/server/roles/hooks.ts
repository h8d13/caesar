import type { IRootState } from '@/features/store';
import { useSelector } from 'react-redux';
import { roleByIdSelector, rolesSelector } from './selectors';

export const useRoleById = (roleId: number) =>
    useSelector((state: IRootState) => roleByIdSelector(state, roleId));

export const useRoles = () => useSelector(rolesSelector);
