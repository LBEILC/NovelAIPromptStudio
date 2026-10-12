import { vi } from 'vitest';

// Native database suites repeatedly open, repair and reopen isolated databases.
// Keep fresh files for rollback/migration coverage, with one shared disk-I/O budget.
vi.setConfig({ testTimeout: 20000 });
