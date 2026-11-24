# Security Specification — PITCH INVESTORS

## 1. Data Invariants
1. **Event Scoping Invariant**: Every document in `participants`, `projects`, `budgets`, `investments`, `reactions`, `presentations`, and `admin_logs` must belong to a valid `eventId` (`grade12_pitch_2026`) and enforce `resource.data.eventId == 'grade12_pitch_2026'` on list queries.
2. **Path Variable Hardening**: Every document ID (`{eventId}`, `{participantId}`, `{projectId}`, `{budgetId}`, `{investmentId}`, `{reactionId}`, `{presentationId}`, `{logId}`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
3. **Validation Blueprints (Anti-Update-Gap)**: Every `create` and `update` operation must pass `isValid[Entity](incoming())` enforcing strict key allowlists (`hasAll` and `hasOnly`), string length bounds (`.size() <= MAX`), and enum/number bounds.
4. **No Self-Investment Invariant**: An investment `amount` must be strictly positive (`amount > 0 && amount <= 1000000`), and `remainingCapital >= 0`.
5. **Immutable Identity Fields**: `id`, `eventId`, and `createdAt` cannot be mutated on `update`.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection on Participant**: Adding `"isSuperAdmin": true` to `/participants/p1` -> Rejected by `hasOnly()`.
2. **Oversized Name Attack (Denial of Wallet)**: Setting `name` to a 5,000-character string in `/participants/p1` -> Rejected by `data.name.size() <= 100`.
3. **Invalid Role Enum**: Setting `role: "hacker"` in `/participants/p1` -> Rejected by `data.role in ['entrepreneur', 'investor']`.
4. **ID Poisoning Attack**: Creating `/projects/invalid$id!@#` -> Rejected by `isValidId(projectId)`.
5. **Negative Investment Amount**: Creating `/investments/inv1` with `amount: -50000` -> Rejected by `data.amount >= 0`.
6. **Negative Remaining Budget**: Updating `/budgets/b1` with `availableBudget: -1000` -> Rejected by `data.availableBudget >= 0`.
7. **Invalid Reaction Type**: Creating `/reactions/r1` with `reactionType: "dislike"` -> Rejected by `data.reactionType in ['fire', 'idea', 'clap', 'rocket', 'heart', 'target', 'mindblown', 'star']`.
8. **Mutating Immutable CreatedAt**: Updating `createdAt` on `/projects/proj1` -> Rejected by `incoming().createdAt == existing().createdAt`.
9. **Cross-Event Query Scraping**: Listing `/participants` without `eventId == 'grade12_pitch_2026'` -> Rejected by `resource.data.eventId == 'grade12_pitch_2026'`.
10. **Invalid Event Stage Transition**: Updating `/events/grade12_pitch_2026` with `stage: "hacked"` -> Rejected by `data.stage in ['registration', 'closed_registration', 'roulette', 'presenting', 'paused', 'finished']`.
11. **Unbounded Presentation Duration**: Creating `/presentations/pres1` with `assignedDurationSec: 99999` -> Rejected by `data.assignedDurationSec >= 60 && data.assignedDurationSec <= 600`.
12. **Unverified Admin Email Spoof**: Accessing `/admins/uid1` with `email_verified: false` -> Rejected by `request.auth.token.email_verified == true`.
