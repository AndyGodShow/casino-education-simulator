export type DebitBet = (amount: number) => boolean;

export const commitDebitedBet = (
    amount: number,
    debit: DebitBet,
    commit: () => void,
): boolean => {
    if (!debit(amount)) return false;
    commit();
    return true;
};
