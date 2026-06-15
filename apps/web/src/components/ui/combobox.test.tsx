import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from './combobox';

afterEach(cleanup);

// jsdom implements no layout/scrolling; the combobox calls scrollIntoView on
// the highlighted row.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const options = [
  { value: 's1', label: 'Alice Johnson', description: 'alice@school.edu' },
  { value: 's2', label: 'Bob Smith', description: 'bob@school.edu' },
  { value: 's3', label: 'Carol Danvers', description: 'carol@school.edu' },
];

function setup() {
  const onSelect = vi.fn();
  render(
    <Combobox
      options={options}
      onSelect={onSelect}
      placeholder="Add a student…"
      searchPlaceholder="Search students…"
      emptyText="No students found"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add a student…' }));
  return onSelect;
}

describe('Combobox', () => {
  it('opens to a search box and all options', () => {
    setup();
    expect(screen.getByPlaceholderText('Search students…')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters options by the search query (label, case-insensitive)', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('Search students…'), { target: { value: 'bob' } });
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(1);
    expect(opts[0]).toHaveTextContent('Bob Smith');
  });

  it('also matches on the description (e.g. email)', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('Search students…'), {
      target: { value: 'carol@school' },
    });
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(1);
    expect(opts[0]).toHaveTextContent('Carol Danvers');
  });

  it('shows the empty state when nothing matches', () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText('Search students…'), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No students found')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen value and closes', () => {
    const onSelect = setup();
    fireEvent.click(screen.getByRole('option', { name: /carol danvers/i }));
    expect(onSelect).toHaveBeenCalledWith('s3');
    expect(screen.queryByPlaceholderText('Search students…')).not.toBeInTheDocument();
  });

  it('selects the keyboard-highlighted option on Enter', () => {
    const onSelect = setup();
    const input = screen.getByPlaceholderText('Search students…');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight moves 0 -> 1
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('s2');
  });
});
