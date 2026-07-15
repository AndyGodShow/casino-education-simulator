import React from 'react';

interface GameStatusAnnouncerProps {
    message: string;
    balance: number;
}

export const GameStatusAnnouncer: React.FC<GameStatusAnnouncerProps> = ({ message, balance }) => (
    <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
    >
        {message} 余额 ${balance.toLocaleString()}
    </div>
);
