import type { TFile } from '@caesar/shared';

const getHostFromServer = () => {
    if (import.meta.env.MODE === 'development') {
        return 'localhost:4991';
    }

    return window.location.host;
};

const getUrlFromServer = () => {
    // In dev, hit the vite origin so the dev proxy forwards HTTP to :4991.
    // Avoids cross-origin CORS without carving a dev branch into the server.
    if (import.meta.env.MODE === 'development') {
        return window.location.origin;
    }

    const host = window.location.host;
    const currentProtocol = window.location.protocol;

    const finalUrl = `${currentProtocol}//${host}`;

    return finalUrl;
};

const getFileUrl = (file: TFile | undefined | null) => {
    if (!file) return '';

    const url = getUrlFromServer();
    const query = file._accessToken
        ? `?accessToken=${encodeURIComponent(file._accessToken)}`
        : '';

    return encodeURI(`${url}/public/${file.name}`) + query;
};

export { getFileUrl, getHostFromServer, getUrlFromServer };
