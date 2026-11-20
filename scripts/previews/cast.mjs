// Who and what the demo server holds. Shared by run.mjs (which creates
// it all) and the scenarios (which act in it).

// caesar signs up first and claims Owner; `colors` paint the
// generated avatar.
export const OWNER = { identity: 'caesar', colors: ['0x7c3aed', '0xdb2777'] };
export const MEMBERS = [
    { identity: 'brutus', colors: ['0x0369a1', '0x14b8a6'] },
    { identity: 'cassius', colors: ['0xb45309', '0xfacc15'] }
];
// signs up during the signup scenario
export const NEWCOMER = { identity: 'antony', colors: ['0x15803d', '0xa3e635'] };

export const VOICE_CHANNEL = 'General Voice';
export const SECOND_VOICE_CHANNEL = 'Forum';
export const TEXT_CHANNEL = 'General Text';
