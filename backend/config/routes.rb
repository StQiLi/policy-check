Rails.application.routes.draw do
  # Health check endpoint
  get '/health', to: 'health#index'
  
  # API routes
  namespace :api do
    namespace :v1 do
      # AI policy extraction
      post 'extract', to: 'extract#create'

      # Snapshots
      resources :snapshots, only: [:create, :index]
      
      # Stores
      get 'stores/:domain/latest', to: 'stores#latest', constraints: { domain: /[^\/]+/ }
      get 'stores/:domain/history', to: 'stores#history', constraints: { domain: /[^\/]+/ }
      
      # Feedback
      resources :feedback, only: [:create]
    end
  end
end
