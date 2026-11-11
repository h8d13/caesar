export type TTokenPayload = {
  userId: number;
  sessionEpoch: number;
  remember?: boolean;
  exp: number;
};

export type TConnectionInfo = {
  ip?: string;
  userAgent?: string;
};
