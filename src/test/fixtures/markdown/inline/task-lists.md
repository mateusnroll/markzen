# Sprint 24 Planning

## Release Checklist

- [x] Merge feature branch into main
- [x] Run full test suite
- [x] Update changelog
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Get sign-off from QA
- [ ] Deploy to production
- [ ] Monitor error rates for 1 hour
- [ ] Send release announcement

## Backend Tasks

- [x] Implement user authentication endpoint
- [x] Add rate limiting middleware
- [ ] Write integration tests for payment flow
  - [x] Test successful payment
  - [x] Test declined card
  - [ ] Test refund process
  - [ ] Test subscription renewal
- [ ] Optimize database queries
  - [ ] Add index on `users.email`
  - [ ] Rewrite N+1 query in orders endpoint

## Frontend Tasks

- [ ] Build settings page
  - [x] Layout and navigation
  - [ ] Profile section
  - [ ] Notification preferences
  - [ ] Theme selection
- [x] Fix responsive layout on mobile

## Task Items with Formatting

- [x] **Critical:** Fix authentication bypass vulnerability
- [ ] Update `README.md` with new setup instructions
- [ ] Review [PR #847](https://example.com/pulls/847) for the API refactor
- [x] ~~Remove deprecated endpoints~~ (completed in v3.1)

## Mixed Regular and Task Items

- [x] Completed task
- [ ] Pending task
- Regular list item without a checkbox
- Another regular item
- [ ] Back to a task item

## Nested Tasks Under Regular Items

- Platform support
  - [x] macOS builds passing
  - [x] Windows builds passing
  - [ ] Linux ARM builds need investigation

## Notes

Task lists are a planned feature. These fixtures will validate rendering once the TipTap `TaskList` and `TaskItem` extensions are added.
