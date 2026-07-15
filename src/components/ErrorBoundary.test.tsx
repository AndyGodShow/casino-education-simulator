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

  it('delegates retry handling without clearing the captured error state', () => {
    const onRetry = vi.fn();
    const boundary = new ErrorBoundary({
      children: null,
      onRetry,
    });
    boundary.state = { hasError: true, error: new Error('render failed') };
    const setState = vi.spyOn(boundary, 'setState');

    boundary.handleRetry();

    expect(onRetry).toHaveBeenCalledOnce();
    expect(setState).not.toHaveBeenCalled();
    expect(boundary.state.hasError).toBe(true);
  });

  it('clears the captured error state when no retry handler is provided', () => {
    const boundary = new ErrorBoundary({ children: null });
    const setState = vi.spyOn(boundary, 'setState');

    boundary.handleRetry();

    expect(setState).toHaveBeenCalledWith({ hasError: false, error: null });
  });
});
