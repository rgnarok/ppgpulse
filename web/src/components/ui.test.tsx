import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KpiCard, Pill, Empty } from './ui';

describe('design-token components (T7.1)', () => {
  it('KpiCard renders label, value and sub', () => {
    render(
      <KpiCard tone="blue" icon="▤" label="Requirements Received" value={145} sub="this period" />,
    );
    expect(screen.getByText('Requirements Received')).toBeInTheDocument();
    expect(screen.getByText('145')).toBeInTheDocument();
    expect(screen.getByText('this period')).toBeInTheDocument();
  });

  it('Pill picks a tone from its label', () => {
    const { container } = render(<Pill>On Hold</Pill>);
    expect(container.querySelector('.p-amber')).toBeTruthy();
  });

  it('Empty renders a title', () => {
    render(<Empty title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
