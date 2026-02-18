module Api
  module V1
    class FeedbackController < ApplicationController
      include Authenticable
      
      def create
        snapshot = PolicySnapshot.find(feedback_params[:snapshot_id])
        
        feedback = Feedback.new(
          policy_snapshot: snapshot,
          user: current_user,
          field_name: feedback_params[:field_name],
          correction: feedback_params[:correction],
          comment: feedback_params[:comment]
        )
        
        if feedback.save
          render json: {
            id: feedback.id,
            status: 'received',
            snapshot_id: snapshot.id,
            field_name: feedback.field_name,
            created_at: feedback.created_at.iso8601,
            message: 'Thank you for your feedback! We\'ll review and improve our extraction.'
          }, status: :created
        else
          render json: {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              details: feedback.errors.messages
            }
          }, status: :unprocessable_entity
        end
      end
      
      private
      
      def feedback_params
        params.permit(:snapshot_id, :field_name, :correction, :comment)
      end
    end
  end
end
