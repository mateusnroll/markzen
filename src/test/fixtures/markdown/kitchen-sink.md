# Setting Up a Development Environment

This guide walks you through configuring a complete local development environment for the **Meridian** platform. By the end, you'll have a running instance with hot reload and test coverage.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js 20 LTS** or later (`node --version` to check)
- **Git 2.40+** for version control
- A code editor — we recommend [VS Code](https://code.visualstudio.com) or [Zed](https://zed.dev "A modern code editor")
- Docker Desktop for running ~~PostgreSQL~~ the containerized database stack

## Step 1: Clone the Repository

1. Fork the repository on GitHub
2. Clone your fork locally
3. Add the upstream remote

```bash
git clone https://github.com/your-username/meridian.git
cd meridian
git remote add upstream https://github.com/meridian-org/meridian.git
```

## Step 2: Install Dependencies

Run the following command from the project root:

```
npm install
```

> **Note:** If you encounter permission errors on macOS, do *not* use `sudo`. Instead, fix your npm prefix:
>
> ```bash
> mkdir ~/.npm-global
> npm config set prefix '~/.npm-global'
> ```
>
> Then add `~/.npm-global/bin` to your `PATH`.

## Step 3: Configure the Environment

Copy the example environment file and fill in your local values:

```bash
cp .env.example .env.local
```

The key variables are:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://localhost:5432/meridian` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `API_KEY` | Your development API key | *(none)* |
| `LOG_LEVEL` | Logging verbosity | `debug` |

## Step 4: Start the Services

### Database

```typescript
import { createPool } from './db';

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
```

### Running Everything Together

1. Start Docker containers for the database and cache
2. Run database migrations
3. Seed the development data
4. Start the dev server

```bash
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

> The dev server starts on `http://localhost:3000` with hot module replacement enabled.

## Step 5: Verify Your Setup

Open your browser and confirm the following:

- [ ] Home page loads at `http://localhost:3000`
- [ ] API health check returns 200 at `/api/health`
- [x] Database connection succeeds (checked by migrations)
- [x] Redis connection succeeds (checked by seed script)

---

## Project Structure

The repository is organized as follows:

- **`src/`** — Application source code
  - `components/` — React components
  - `lib/` — Shared utilities and helpers
  - `store/` — State management
- **`tests/`** — Test suites
  1. Unit tests with Vitest
  2. Integration tests against a real database
  3. End-to-end tests with Playwright

### Key Files

The entry point is `src/main.tsx`. Configuration lives in `meridian.config.ts` at the root.

## Troubleshooting

> **Common issue:** Port 3000 already in use.
>
> Find and kill the process:
>
> ```bash
> lsof -i :3000
> kill -9 <PID>
> ```

> > **Reply from a team member:**
> >
> > You can also set a custom port with `PORT=3001 npm run dev`.

If you encounter ~~the old `EACCES` error~~, it was fixed in version **2.4.1**. Update your dependencies with `npm update`.

### Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `E001` | Database connection failed | Check `DATABASE_URL` in `.env.local` |
| `E002` | Missing API key | Generate one at [dashboard](https://example.com/keys) |
| `E003` | Port conflict | Kill the existing process or change `PORT` |

## Testing

Run the full test suite with:

```bash
npm test
```

For a specific test file:

```bash
npm test -- --grep "authentication"
```

The CI pipeline requires ***all tests to pass*** before merging. Coverage must remain above 80% — check with `npm run test:coverage`.

## Contributing

We welcome contributions! Please read the [contributing guide](https://example.com/contributing) before submitting a pull request.

Key points to remember:

1. **Branch naming:** Use `feature/`, `fix/`, or `chore/` prefixes
2. **Commit messages:** Follow [Conventional Commits](https://www.conventionalcommits.org)
3. **Code style:** Run `npm run lint` before committing

> *"Any fool can write code that a computer can understand. Good programmers write code that humans can understand."*\
> — Martin Fowler

---

## Next Steps

After your environment is running, explore these resources:

- [Architecture overview](https://example.com/docs/architecture) for the big picture
- [API documentation](https://example.com/docs/api) for endpoint details
- The `#dev-help` channel on Slack for questions

![Meridian Architecture Diagram](https://example.com/docs/images/architecture.png "High-level system architecture")

Happy coding! 🚀
