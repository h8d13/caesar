import { v7 as uuidv7 } from 'uuid';

// Wrapper so callsites stay identical to the Bun version
// (`randomUUIDv7()` returning a v7 UUID string).
const randomUUIDv7 = (): string => uuidv7();

export { randomUUIDv7 };
