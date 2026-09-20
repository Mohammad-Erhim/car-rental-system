import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChoiceTabs } from './choice-tabs';

const options = [
  { value: 'a', label: 'Alpha', description: 'First' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
];

describe('ChoiceTabs', () => {
  it('is a labelled radio group with every choice visible (no dropdown)', () => {
    render(<ChoiceTabs value="a" onChange={() => undefined} options={options} label="Pick one" />);
    expect(screen.getByRole('radiogroup', { name: 'Pick one' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
  });

  it('choosing a tab reports its value; a disabled one cannot be chosen', () => {
    const onChange = vi.fn();
    render(<ChoiceTabs value="a" onChange={onChange} options={options} label="Pick one" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('radio', { name: 'Gamma' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('the list layout shows each option’s explanation', () => {
    render(
      <ChoiceTabs
        layout="list"
        value="a"
        onChange={() => undefined}
        options={options}
        label="Pick one"
      />,
    );
    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('works controlled from state', () => {
    const Host = () => {
      const [v, setV] = useState('a');
      return <ChoiceTabs value={v} onChange={setV} options={options} label="Pick one" />;
    };
    render(<Host />);
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
  });
});
