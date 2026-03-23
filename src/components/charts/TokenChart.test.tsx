import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenChart } from './TokenChart';
import { useSettingsStore } from '../../stores/settingsStore';

describe('TokenChart', () => {
  it('renders model costs from the derived costByModel prop instead of legacy token bucket cost', () => {
    useSettingsStore.setState({ language: 'en' });

    render(
      <TokenChart
        tokens={{
          input: 1_000_000,
          output: 0,
          cache_read: 0,
          cache_creation: 0,
          by_model: {
            'model-a': {
              input: 1_000_000,
              output: 0,
              cache_read: 0,
              cache_creation: 0,
              cost_usd: 99,
            },
          },
        }}
        costByModel={{ 'model-a': 1.5 }}
      />
    );

    expect(screen.getByText('$1.50')).toBeInTheDocument();
    expect(screen.queryByText('$99.00')).not.toBeInTheDocument();
  });
});
