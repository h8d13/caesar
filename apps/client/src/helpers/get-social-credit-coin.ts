type TSocialCreditTier = 'bronze' | 'silver' | 'gold';

const getSocialCreditTier = (score: number): TSocialCreditTier => {
    if (score >= 5000) return 'gold';
    if (score >= 200) return 'silver';
    return 'bronze';
};

const getSocialCreditCoin = (score: number): string =>
    `/coins/${getSocialCreditTier(score)}.png`;

export { getSocialCreditCoin, getSocialCreditTier };
export type { TSocialCreditTier };
