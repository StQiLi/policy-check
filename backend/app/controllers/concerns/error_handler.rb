module ErrorHandler
  extend ActiveSupport::Concern
  
  included do
    rescue_from ActiveRecord::RecordNotFound, with: :not_found
    rescue_from ActionController::ParameterMissing, with: :bad_request
    rescue_from ActiveRecord::RecordInvalid, with: :unprocessable_entity
  end
  
  private
  
  def not_found(exception)
    render json: {
      error: {
        code: 'NOT_FOUND',
        message: exception.message
      }
    }, status: :not_found
  end
  
  def bad_request(exception)
    render json: {
      error: {
        code: 'BAD_REQUEST',
        message: exception.message
      }
    }, status: :bad_request
  end
  
  def unprocessable_entity(exception)
    render json: {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: exception.record.errors.messages
      }
    }, status: :unprocessable_entity
  end
end
