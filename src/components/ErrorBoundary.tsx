import React from 'react';
import { reportReactError } from '../observability/browserObservability';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallbackMessage?: string;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * React 错误边界 — 捕获子组件渲染崩溃，防止整个应用白屏。
 * 显示友好错误页面 + 重试按钮。
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error('[ErrorBoundary] 捕获到错误:', error, errorInfo);
        (this.props.onError ?? reportReactError)(error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '60vh',
                    padding: '2rem',
                    color: '#e0e0e0',
                    textAlign: 'center',
                    gap: '1rem',
                }}>
                    <span style={{ fontSize: '3rem' }}>⚠️</span>
                    <h2 style={{ margin: 0, color: '#ff6b6b' }}>
                        {this.props.fallbackMessage || '游戏加载出错'}
                    </h2>
                    <p style={{ maxWidth: '400px', color: '#999', fontSize: '0.9rem' }}>
                        {this.state.error?.message || '发生了未知错误'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        style={{
                            padding: '0.6rem 1.5rem',
                            border: 'none',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: '#fff',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => {
                            (e.target as HTMLButtonElement).style.transform = 'scale(1.05)';
                            (e.target as HTMLButtonElement).style.boxShadow = '0 4px 15px rgba(102,126,234,0.4)';
                        }}
                        onMouseLeave={e => {
                            (e.target as HTMLButtonElement).style.transform = 'scale(1)';
                            (e.target as HTMLButtonElement).style.boxShadow = 'none';
                        }}
                    >
                        🔄 重试
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
