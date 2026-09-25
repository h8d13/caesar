import { v7 as uuidv7 } from 'uuid';

// Time-ordered UUID (v7).
const randomUUIDv7 = (): string => uuidv7();

export { randomUUIDv7 };
