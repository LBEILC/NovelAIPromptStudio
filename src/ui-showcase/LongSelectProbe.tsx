import { useState } from 'react';
import { Select } from '../ui';

// Synthetic inventory: CI and developer machines have different system fonts.
export function LongSelectProbe() {
  const [value, setValue] = useState('0');
  return (
    <main
      data-long-select-probe
      style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Select
        label="长列表验收"
        value={value}
        onChange={setValue}
        options={Array.from({ length: 100 }, (_, index) => ({
          value: String(index),
          label: `Synthetic option ${index}`,
        }))}
      />
      <output>{value}</output>
    </main>
  );
}
