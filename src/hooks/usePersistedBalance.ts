// ===== 通用余额持久化 Hook =====

import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

const STORAGE_PREFIX = 'casino_sim_';
export const MAX_SAFE_BALANCE = Number.MAX_SAFE_INTEGER;

export const sanitizeBalance = (value: unknown, fallback: number): number => {
    if (typeof value === 'string' && value.trim() === '') return fallback;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) return fallback;
    return Math.min(numericValue, MAX_SAFE_BALANCE);
};

/**
 * 与 useState 行为相同，但值会自动同步到 localStorage。
 * 页面刷新后自动恢复上一次的余额。
 */
export const usePersistedBalance = (gameKey: string, defaultValue: number) => {
    const storageKey = `${STORAGE_PREFIX}${gameKey}_balance`;
    const skipNextPersistRef = useRef(false);

    const [balance, setBalanceState] = useState<number>(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored !== null) {
                return sanitizeBalance(stored, defaultValue);
            }
        } catch {
            // localStorage 不可用时使用默认值
        }
        return defaultValue;
    });
    const balanceRef = useRef(balance);

    // 余额变化时自动保存
    useEffect(() => {
        balanceRef.current = balance;
        if (skipNextPersistRef.current) {
            skipNextPersistRef.current = false;
            return;
        }
        try {
            localStorage.setItem(storageKey, String(balance));
        } catch {
            // 静默处理写入失败
        }
    }, [balance, storageKey]);

    const setBalance: Dispatch<SetStateAction<number>> = useCallback((value) => {
        const currentBalance = balanceRef.current;
        const nextBalance = sanitizeBalance(
            typeof value === 'function' ? value(currentBalance) : value,
            defaultValue,
        );
        balanceRef.current = nextBalance;
        setBalanceState(nextBalance);
    }, [defaultValue]);

    const debitBalance = useCallback((amount: number): boolean => {
        if (!Number.isFinite(amount) || amount <= 0) return false;
        if (amount > balanceRef.current) return false;

        const nextBalance = balanceRef.current - amount;
        balanceRef.current = nextBalance;
        setBalanceState(nextBalance);
        return true;
    }, []);

    const creditBalance = useCallback((amount: number): void => {
        if (!Number.isFinite(amount) || amount <= 0) return;

        const nextBalance = balanceRef.current + amount;
        const safeNextBalance = sanitizeBalance(nextBalance, MAX_SAFE_BALANCE);
        balanceRef.current = safeNextBalance;
        setBalanceState(safeNextBalance);
    }, []);

    // 重置余额时清除存储
    const resetBalance = useCallback(() => {
        skipNextPersistRef.current = true;
        balanceRef.current = defaultValue;
        setBalanceState(defaultValue);
        try {
            localStorage.removeItem(storageKey);
        } catch {
            // ignore
        }
    }, [defaultValue, storageKey]);

    return { balance, setBalance, debitBalance, creditBalance, resetBalance };
};
