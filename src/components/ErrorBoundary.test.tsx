import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('forwards caught errors to observability while retaining console diagnostics', () => {
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new ErrorBoundary({
      children: null,
      onError,
    });
    const error = new Error('render failed');
    const errorInfo = { componentStack: '\n at BrokenComponent' };

    boundary.componentDidCatch(error, errorInfo);

    expect(onError).toHaveBeenCalledWith(error, errorInfo);
    expect(consoleError).toHaveBeenCalledWith(
      '[ErrorBoundary] 捕获到错误:',
      error,
      errorInfo,
    );
  });
});
