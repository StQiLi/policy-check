# Return Clarity Backend

Rails 7.2 API for policy snapshot persistence, history tracking, and feedback collection.

## Prerequisites

Before setting up the backend, you need:

### 1. Ruby Version Manager (rbenv)

```bash
# Fix Homebrew permissions first (if needed)
sudo chown -R $(whoami) /opt/homebrew

# Install rbenv and ruby-build
brew install rbenv ruby-build

# Add rbenv to shell (if not already done)
echo 'eval "$(rbenv init - zsh)"' >> ~/.zshrc
source ~/.zshrc
```

### 2. Ruby 3.3.6

```bash
# Install Ruby 3.3.6
rbenv install 3.3.6

# Set as local version for this project
cd /path/to/policy-check
rbenv local 3.3.6

# Verify installation
ruby --version  # Should show ruby 3.3.6
```

### 3. Rails 7.2

```bash
# Install Rails globally
gem install rails -v '~> 7.2'

# Install Bundler
gem install bundler

# Verify installation
rails --version  # Should show Rails 7.2.x
```

## Setup

Once Ruby and Rails are installed:

```bash
# Install dependencies
bundle install

# Setup database
bin/rails db:create
bin/rails db:migrate

# (Optional) Seed with test data
bin/rails db:seed
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins (include your extension ID)
- `SECRET_KEY_BASE`: Generate with `bin/rails secret`
- `RACK_ATTACK_ENABLED`: Enable/disable rate limiting

## Running the Server

```bash
# Development server (default port 3000)
bin/rails server

# Or use Puma directly
bundle exec puma -C config/puma.rb
```

Server will be available at `http://localhost:3000`

## Testing

```bash
# Run all specs
bundle exec rspec

# Run specific spec file
bundle exec rspec spec/requests/api/v1/snapshots_spec.rb

# Run with coverage
bundle exec rspec --format documentation
```

## Linting

```bash
# Run Rubocop
bundle exec rubocop

# Auto-fix issues
bundle exec rubocop -A
```

## API Endpoints

### Health Check
```
GET /health
```

Returns server status (no auth required).

### Snapshots
```
POST /api/v1/snapshots
```

Save a policy snapshot. Requires auth token.

### Stores
```
GET /api/v1/stores/:domain/latest
GET /api/v1/stores/:domain/history
```

Retrieve latest or all snapshots for a store. Requires auth token.

### Feedback
```
POST /api/v1/feedback
```

Submit feedback on extraction accuracy. Requires auth token.

See [docs/API_CONTRACT.md](../docs/API_CONTRACT.md) for full API documentation.

## Database Schema

### Users
- `email` (string, unique)
- `auth_token` (string, unique, indexed)

### Stores
- `domain` (string, unique, indexed)
- `name` (string)
- `platform` (string, default: 'shopify')

### PolicySnapshots
- `store_id` (FK → stores)
- `user_id` (FK → users)
- `policy_type` (string: refund, shipping, privacy, terms, subscription)
- `policy_url` (string)
- `summary` (jsonb)
- `raw_text_snippet` (text)
- `extracted_at` (datetime)
- `checksum` (string, unique per store)

### Feedbacks
- `policy_snapshot_id` (FK → policy_snapshots)
- `user_id` (FK → users)
- `field_name` (string)
- `correction` (string)
- `comment` (text)

## Authentication (v1 Placeholder)

Current implementation uses simple token-based auth:

1. User record has `auth_token` (UUID)
2. Extension sends `Authorization: Bearer <token>` header
3. Backend validates token against `users.auth_token`

**Creating a user (Rails console):**

```ruby
User.create!(email: 'test@example.com')
# Auth token is auto-generated, check it with:
User.last.auth_token
```

**Upgrading to JWT/OAuth (v2):**
- Implement JWT with expiration
- Add refresh token rotation
- OAuth2 integration for Google/GitHub login

## CORS Configuration

Configured in `config/initializers/cors.rb`:

- Reads allowed origins from `ALLOWED_ORIGINS` env var
- Supports wildcards for localhost (e.g., `http://localhost:*`)
- Credentials enabled for auth tokens

**For extension:**
```bash
# Get your extension ID from chrome://extensions/
# Add to .env:
ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID_HERE,http://localhost:3000
```

## Rate Limiting

Configured in `config/initializers/rack_attack.rb`:

- **Per IP:** 1000 requests/hour (configurable)
- **Per Token:** 100 requests/hour (configurable)
- Returns 429 with `Retry-After` header when exceeded

Disable for development:
```bash
RACK_ATTACK_ENABLED=false
```

## Project Structure

```
backend/
├── app/
│   ├── controllers/
│   │   ├── concerns/
│   │   │   ├── authenticable.rb    # Token auth
│   │   │   └── error_handler.rb    # Centralized error handling
│   │   ├── api/v1/                 # API endpoints
│   │   │   ├── snapshots_controller.rb
│   │   │   ├── stores_controller.rb
│   │   │   └── feedback_controller.rb
│   │   └── health_controller.rb
│   └── models/
│       ├── user.rb
│       ├── store.rb
│       ├── policy_snapshot.rb
│       └── feedback.rb
├── config/
│   ├── routes.rb
│   └── initializers/
│       ├── cors.rb                 # CORS config
│       └── rack_attack.rb          # Rate limiting
├── db/
│   ├── migrate/                    # Database migrations
│   └── schema.rb                   # Generated schema
├── spec/
│   ├── requests/                   # Request specs
│   ├── models/                     # Model specs
│   └── factories/                  # FactoryBot factories
├── Gemfile
├── .env.example
└── README.md
```

## Common Tasks

### Create a Test User

```bash
bin/rails console
> user = User.create!(email: 'dev@example.com')
> puts "Token: #{user.auth_token}"
```

### Reset Database

```bash
bin/rails db:drop db:create db:migrate
```

### View Recent Snapshots

```bash
bin/rails console
> PolicySnapshot.order(created_at: :desc).limit(5)
```

### Check Rate Limit Status

Rate limit info is in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
```

## Deployment (Future)

For production deployment:

1. **Database**: Migrate from SQLite to PostgreSQL
2. **Environment**: Set production env vars (SECRET_KEY_BASE, DATABASE_URL, etc.)
3. **Hosting**: Deploy to Heroku, Render, Railway, or AWS
4. **Monitoring**: Add error tracking (Sentry, Rollbar)
5. **Logging**: Configure structured logging (Lograge)
6. **Performance**: Add Redis caching for frequent queries

## Troubleshooting

### Rails Not Found

Make sure rbenv is initialized:
```bash
eval "$(rbenv init - zsh)"
rbenv which rails
```

### Database Errors

Reset database:
```bash
bin/rails db:drop db:create db:migrate
```

### CORS Errors

Check that extension ID is in `ALLOWED_ORIGINS` env var:
```bash
echo $ALLOWED_ORIGINS
```

### Port Already in Use

Kill process on port 3000:
```bash
lsof -ti:3000 | xargs kill -9
```

## Resources

- [Rails 7.2 Guide](https://guides.rubyonrails.org/v7.2/)
- [Rails API Mode](https://guides.rubyonrails.org/api_app.html)
- [RSpec Rails](https://github.com/rspec/rspec-rails)
- [Rack CORS](https://github.com/cyu/rack-cors)
- [Rack Attack](https://github.com/rack/rack-attack)
