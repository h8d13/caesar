import type { IRootState } from '@/features/store';
import { useSelector } from 'react-redux';
import { categoriesSelector, categoryByIdSelector } from './selectors';

export const useCategories = () => useSelector(categoriesSelector);

export const useCategoryById = (categoryId: number) =>
    useSelector((state: IRootState) => categoryByIdSelector(state, categoryId));
