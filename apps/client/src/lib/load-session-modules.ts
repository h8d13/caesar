// tRPC, the e2ee crypto and the server subscriptions only matter once a
// session exists, so the login page an anonymous visitor loads ships
// without them. Module level: the React Compiler skips components
// containing import().
const loadSessionModules = () =>
    Promise.all([import('@/lib/e2ee'), import('@/features/server/actions')]);

export { loadSessionModules };
