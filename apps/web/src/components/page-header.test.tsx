import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders one h1 with description, meta and actions', () => {
    render(
      <PageHeader
        title="Fleet"
        description="All vehicles"
        meta={<span>Updated now</span>}
        actions={<button>Add</button>}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Fleet' })).toBeInTheDocument();
    expect(screen.getByText('All vehicles')).toBeInTheDocument();
    expect(screen.getByText('Updated now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('omits optional regions when not given', () => {
    const { container } = render(<PageHeader title="Only title" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});
