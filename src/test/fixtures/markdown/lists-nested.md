# Q3 Project Roadmap

## Phase 1: Foundation

- Set up development environment
  - Install Node.js 20 LTS
  - Configure ESLint and Prettier
  - Set up Git hooks with Husky
- Initialize project scaffolding
  - Create monorepo structure
  - Configure workspace dependencies
  - Add shared TypeScript configuration
    - Enable strict mode
    - Set target to ES2022
    - Configure path aliases

## Phase 2: Core Features

- Authentication module
  - OAuth 2.0 integration
    - Google provider
    - GitHub provider
    - Custom OIDC provider
  - Session management
  - Role-based access control
- Data layer
  - Database schema design
  - Migration tooling
  - Query builder setup

## Phase 3: Ordered Sub-Tasks

1. Design the API contract
   - Define resource endpoints
   - Write OpenAPI specification
   - Generate client SDKs
2. Implement the backend
   1. Set up the router
   2. Add middleware stack
   3. Write controller logic
3. Build the frontend
   1. Create page layouts
   2. Connect API clients
   3. Add form validation

## Mixed Nesting Patterns

- Platform support
  1. macOS (primary target)
  2. Windows (secondary)
  3. Linux (community-supported)
- Release channels
  1. Stable
     - Monthly releases
     - Full QA cycle
  2. Beta
     - Biweekly releases
     - Limited testing
  3. Nightly
     - Automated builds
     - No manual QA

## Nested Items with Paragraphs

- First top-level item with an extended description.

  This paragraph continues the first item. It provides additional context that wouldn't fit in a single line.

  - A nested item under the first item
  - Another nested item

- Second top-level item.

  This also has a continuation paragraph with more details about the deliverable.

## Adjacent Lists of Different Types

- Unordered item alpha
- Unordered item beta
- Unordered item gamma

1. Ordered item one
2. Ordered item two
3. Ordered item three

- Back to unordered
- Another unordered item

## Deep Nesting

- Level 1
  - Level 2
    - Level 3
      - Level 4: this is quite deeply nested and tests how the editor handles indentation at multiple levels

## Sprint Summary

The team committed to 34 story points across all three phases, with a buffer of 8 points for unexpected work.
