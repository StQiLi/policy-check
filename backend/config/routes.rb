Rails.application.routes.draw do
  # Health check endpoint
  get '/health', to: 'health#index'
  
  # API routes
  namespace :api do
    namespace :v1 do
      # AI policy extraction
      post 'extract', to: 'extract#create'

      # Snapshots
      resources :snapshots, only: [:create]
      
      # Stores
      get 'stores/:domain/latest', to: 'stores#latest'
      get 'stores/:domain/history', to: 'stores#history'
      
      # Feedback
      resources :feedback, only: [:create]
    end
  end
end
