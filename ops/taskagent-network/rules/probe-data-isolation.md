# Probe Data Isolation

Every writable probe carries a run nonce and records the exact resource ID it created. Cleanup accepts only that ID and nonce. It must not search by broad filename pattern or delete resources created by another run or user.
