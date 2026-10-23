// Registered at startup so Web Push works once the user opts in. Kept
// apart from ./push, which needs tRPC, so the login page ships without it.

let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;

const registerServiceWorker = () => {
    if (!('serviceWorker' in navigator)) return;

    registrationPromise = navigator.serviceWorker
        .register('/sw.js')
        .catch((e) => {
            console.error('service worker registration failed', e);
            registrationPromise = undefined;
            throw e;
        });
};

const getRegistration = () => registrationPromise;

export { getRegistration, registerServiceWorker };
