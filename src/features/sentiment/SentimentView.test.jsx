import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SentimentView } from './SentimentView';

const mockUseAuth = vi.hoisted(() => vi.fn(() => ({ token: 'test-token' })));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('SentimentView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  function mockSentimentApi(options = {}) {
    const { healthOk = true, startStatus = 'started' } = options;
    fetch.mockImplementation((url, init) => {
      if (typeof url !== 'string') return Promise.reject(new Error('Invalid URL'));
      if (url.includes('/api/sentiment/health')) {
        return Promise.resolve({
          ok: healthOk,
          json: () => Promise.resolve(healthOk ? { status: 'ok' } : {}),
        });
      }
      if (url.includes('/api/sentiment-backend/start') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: startStatus }),
        });
      }
      if (url.includes('/api/composite/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(url.includes('history') ? [] : {}),
        });
      }
      if (url.includes('/api/sentiment/') && url.includes('/historical/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (url.includes('/api/sentiment/') && !url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              aggregated_score: 0.1,
              window_end: new Date().toISOString(),
              signal_count: 5,
            }),
        });
      }
      return Promise.reject(new Error(`Unmocked: ${url}`));
    });
  }

  function renderSentimentView() {
    return render(
      <MemoryRouter>
        <SentimentView />
      </MemoryRouter>
    );
  }

  it('renders Sentiment page with heading and breadcrumbs', () => {
    mockSentimentApi();
    renderSentimentView();
    const pageHeading = screen.getByRole('heading', { level: 1 });
    expect(pageHeading).toHaveTextContent(/^Sentiment$/);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByText('Sentiment').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Market Sentiment and Composite & Indices tabs', () => {
    mockSentimentApi();
    renderSentimentView();
    expect(screen.getByRole('tab', { name: /market sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /composite & indices/i })).toBeInTheDocument();
  });

  it('has Lookup panel with Symbol, API, and Get sentiment button', () => {
    mockSentimentApi();
    renderSentimentView();
    expect(screen.getByLabelText(/symbol to look up/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/api provider/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get sentiment/i })).toBeInTheDocument();
  });

  it('has Options panel with Aggregation and checkboxes', () => {
    mockSentimentApi();
    renderSentimentView();
    expect(screen.getByLabelText(/aggregation mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/use time decay/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/include uncertainty/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/use prime-modular/i)).toBeInTheDocument();
  });

  it('auto-connects on mount and has no Connect button', () => {
    mockSentimentApi();
    renderSentimentView();
    expect(screen.queryByRole('button', { name: /start sentiment api|connect/i })).not.toBeInTheDocument();
  });

  it('auto-loads sentiment with default AAPL on mount', async () => {
    mockSentimentApi();
    renderSentimentView();
    await waitFor(() => {
      const calls = fetch.mock.calls.map((c) => c[0]);
      expect(calls.some((url) => String(url).includes('/api/sentiment/AAPL') && !String(url).includes('/historical/'))).toBe(true);
    });
    await waitFor(() => {
      const calls = fetch.mock.calls.map((c) => c[0]);
      expect(calls.some((url) => String(url).includes('/api/sentiment/historical/AAPL'))).toBe(true);
    });
  });

  it('displays sentiment section for default symbol after load', async () => {
    mockSentimentApi();
    renderSentimentView();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /AAPL sentiment/i })).toBeInTheDocument();
    });
  });

  it('Get sentiment button updates loaded symbol when clicked', async () => {
    mockSentimentApi();
    renderSentimentView();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /AAPL sentiment/i })).toBeInTheDocument();
    });
    const symbolInput = screen.getByLabelText(/symbol to look up/i);
    fireEvent.change(symbolInput, { target: { value: 'TSLA' } });
    const getButton = screen.getByRole('button', { name: /get sentiment/i });
    fireEvent.click(getButton);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /TSLA sentiment/i })).toBeInTheDocument();
    });
  });

  it('Get sentiment button is disabled when symbol is empty', () => {
    mockSentimentApi();
    renderSentimentView();
    const symbolInput = screen.getByLabelText(/symbol to look up/i);
    fireEvent.change(symbolInput, { target: { value: '' } });
    expect(screen.getByRole('button', { name: /get sentiment/i })).toBeDisabled();
  });

  it('when Sentiment API is not running (health fails), calls start API on mount when authenticated', async () => {
    mockSentimentApi({ healthOk: false, startStatus: 'started' });
    renderSentimentView();
    await waitFor(() => {
      const startCalls = fetch.mock.calls.filter(
        (c) => String(c[0]).includes('/api/sentiment-backend/start') && c[1]?.method === 'POST'
      );
      expect(startCalls.length).toBeGreaterThanOrEqual(1);
      expect(startCalls[0][1].headers?.Authorization).toBe('Bearer test-token');
    });
  });

  it('when not authenticated, does not call start API when health fails', async () => {
    mockUseAuth.mockReturnValue({ token: null });
    mockSentimentApi({ healthOk: false });
    renderSentimentView();
    await waitFor(() => {
      const startCalls = fetch.mock.calls.filter(
        (c) => String(c[0]).includes('/api/sentiment-backend/start')
      );
      expect(startCalls.length).toBe(0);
    });
    mockUseAuth.mockReturnValue({ token: 'test-token' });
  });

  it('switching to Composite & Indices tab shows composite panel', async () => {
    mockSentimentApi();
    renderSentimentView();
    const compositeTab = screen.getByRole('tab', { name: /composite & indices/i });
    fireEvent.click(compositeTab);
    await waitFor(() => {
      expect(compositeTab).toHaveAttribute('aria-selected', 'true');
    });
    const tabpanels = screen.getAllByRole('tabpanel');
    expect(tabpanels.length).toBeGreaterThanOrEqual(1);
  });

  it('Aggregation dropdown changes value', () => {
    mockSentimentApi();
    renderSentimentView();
    const aggregation = screen.getByLabelText(/aggregation mode/i);
    expect(aggregation).toHaveValue('mean');
    fireEvent.change(aggregation, { target: { value: 'median' } });
    expect(aggregation).toHaveValue('median');
  });

  it('Uncertainty checkbox is checked by default', () => {
    mockSentimentApi();
    renderSentimentView();
    expect(screen.getByLabelText(/include uncertainty/i)).toBeChecked();
  });

  it('Time decay and Prime-modular checkboxes are unchecked by default', () => {
    mockSentimentApi();
    renderSentimentView();
    expect(screen.getByLabelText(/use time decay/i)).not.toBeChecked();
    expect(screen.getByLabelText(/use prime-modular/i)).not.toBeChecked();
  });
});
