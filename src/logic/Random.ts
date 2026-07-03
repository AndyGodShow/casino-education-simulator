/**
 * 通用加密级随机数工具
 * 使用浏览器原生的 crypto.getRandomValues 确保不可预测性和统计学的公平性
 */

const getCrypto = (): Crypto => {
    return typeof crypto !== 'undefined' ? crypto : window.crypto;
};

/**
 * 生成一个安全的随机整数 [0, max)
 * 使用拒绝采样（Rejection Sampling）以消除取模偏差（Modulo Bias）
 */
export const getSecureRandomInt = (max: number): number => {
    if (max <= 0) return 0;
    if (max === 1) return 0;

    const cryptoInstance = getCrypto();
    const array = new Uint32Array(1);

    // 限制范围以避免取模偏差
    const limit = 0xFFFFFFFF - (0xFFFFFFFF % max);
    let randomVal: number;

    do {
        cryptoInstance.getRandomValues(array);
        randomVal = array[0];
    } while (randomVal >= limit);

    return randomVal % max;
};

/**
 * 使用 Fisher-Yates 算法对数组进行原地洗牌
 */
export const shuffleArray = <T>(array: T[]): void => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = getSecureRandomInt(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
};

/**
 * 从数组中随机抽取一个元素
 */
export const pickRandom = <T>(array: T[] | readonly T[]): T => {
    const index = getSecureRandomInt(array.length);
    return array[index];
};

/**
 * 生成 [0, 1) 区间的随机小数，用于策略权重选择。
 */
export const getSecureRandomFloat = (): number => {
    return getSecureRandomInt(1_000_000) / 1_000_000;
};
