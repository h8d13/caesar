import type { TFile } from '@caesar/shared';

const getHostFromServer = () => {
    if (import.meta.env.MODE === 'development') {
        return 'localhost:4991';
    }

    return window.location.host;
};

const getUrlFromServer = () => {
    if (import.meta.env.MODE === 'development') {
        return 'http://localhost:4991';
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
