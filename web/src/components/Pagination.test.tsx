import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = render(
      <Pagination page={1} pageCount={1} pageSize={20} totalItems={5} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the item range, disables Prev on page 1, and calls onChange for Next/a page number', async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pageCount={3} pageSize={20} totalItems={45} onChange={onChange} />);
    expect(screen.getByText('Showing 1–20 of 45')).toBeInTheDocument();
    expect(screen.getByText('‹ Prev')).toBeDisabled();
    expect(screen.getByText('Next ›')).toBeEnabled();

    await userEvent.click(screen.getByText('Next ›'));
    expect(onChange).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByText('3'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('disables Next on the last page', () => {
    render(<Pagination page={3} pageCount={3} pageSize={20} totalItems={45} onChange={vi.fn()} />);
    expect(screen.getByText('Showing 41–45 of 45')).toBeInTheDocument();
    expect(screen.getByText('Next ›')).toBeDisabled();
    expect(screen.getByText('‹ Prev')).toBeEnabled();
  });
});
