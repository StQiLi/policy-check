class HealthController < ApplicationController
  def index
    render json: {
      status: 'ok',
      timestamp: Time.current.iso8601,
      version: '1.0.0'
    }
  end
end
