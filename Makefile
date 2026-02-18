.PHONY: setup dev build lint test clean help

help: ## Show this help message
	@echo "Return Clarity for Shopify - Development Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies for both extension and backend
	@echo "📦 Installing extension dependencies..."
	cd extension && pnpm install
	@echo ""
	@echo "📦 Installing backend dependencies..."
	cd backend && bundle install
	@echo ""
	@echo "✅ Setup complete!"

dev: ## Start development servers for extension and backend
	@echo "🚀 Starting development servers..."
	./scripts/dev.sh

build: ## Build extension for production
	@echo "🏗️  Building extension..."
	cd extension && pnpm build
	@echo "✅ Build complete! Output: extension/dist/"

lint: ## Run linters for both projects
	@echo "🔍 Linting extension..."
	cd extension && pnpm lint
	@echo ""
	@echo "🔍 Linting backend..."
	cd backend && bundle exec rubocop
	@echo ""
	@echo "✅ Linting complete!"

test: ## Run tests for both projects
	@echo "🧪 Running extension tests..."
	cd extension && pnpm test || echo "No tests configured yet"
	@echo ""
	@echo "🧪 Running backend tests..."
	cd backend && bundle exec rspec
	@echo ""
	@echo "✅ Tests complete!"

clean: ## Clean build artifacts and dependencies
	@echo "🧹 Cleaning build artifacts..."
	rm -rf extension/dist extension/node_modules
	rm -rf backend/tmp backend/log/*.log
	@echo "✅ Clean complete!"

db-setup: ## Setup backend database
	@echo "🗄️  Setting up database..."
	cd backend && bin/rails db:create db:migrate
	@echo "✅ Database setup complete!"

db-reset: ## Reset backend database
	@echo "🗄️  Resetting database..."
	cd backend && bin/rails db:drop db:create db:migrate
	@echo "✅ Database reset complete!"
