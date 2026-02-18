Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch('ALLOWED_ORIGINS', 'http://localhost:*').split(',').map(&:strip)
    
    resource '/api/*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head],
      credentials: true,
      max_age: 86400
  end
  
  # Health check endpoint (no auth required)
  allow do
    origins '*'
    resource '/health', headers: :any, methods: [:get]
  end
end
