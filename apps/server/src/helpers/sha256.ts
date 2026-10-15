import { hash } from 'node:crypto';

export const sha256 = (s: string) => hash('sha256', s);
