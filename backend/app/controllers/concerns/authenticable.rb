module Authenticable
  extend ActiveSupport::Concern
  
  included do
    before_action :authenticate_user!
  end
  
  private
  
  def authenticate_user!
    token = extract_token
    @current_user = User.find_by(auth_token: token) if token
    
    return if @current_user
    
    render json: {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing authentication token'
      }
    }, status: :unauthorized
  end
  
  def extract_token
    request.headers['Authorization']&.gsub(/^Bearer /, '')
  end
  
  def current_user
    @current_user
  end
end
