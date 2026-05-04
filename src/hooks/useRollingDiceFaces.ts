import { useEffect, useState } from 'react';

const randomFace = () => Math.floor(Math.random() * 6) + 1;

const nextRollingFaces = (faceCount: number, previousFaces: readonly number[]) => (
    Array.from({ length: faceCount }, (_, index) => {
        let face = randomFace();
        const previousFace = previousFaces[index];

        if (face === previousFace) {
            face = (face % 6) + 1;
        }

        return face;
    })
);

export const useRollingDiceFaces = (
    finalFaces: readonly number[],
    isRolling: boolean,
    tickMs: number,
) => {
    const [displayFaces, setDisplayFaces] = useState<number[]>(() => [...finalFaces]);

    useEffect(() => {
        if (!isRolling) return undefined;

        const timerId = window.setInterval(() => {
            setDisplayFaces((previousFaces) => nextRollingFaces(finalFaces.length, previousFaces));
        }, tickMs);

        return () => window.clearInterval(timerId);
    }, [finalFaces.length, isRolling, tickMs]);

    return isRolling ? displayFaces : [...finalFaces];
};
