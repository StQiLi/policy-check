module Api
  module V1
    class SnapshotsController < ApplicationController
      include Authenticable
      
      def create
        # Find or create store
        store = Store.find_or_create_by!(domain: snapshot_params[:store_domain]) do |s|
          s.platform = 'shopify'
          s.name = snapshot_params[:store_domain]
        end
        
        # Create snapshot
        snapshot = PolicySnapshot.new(
          store: store,
          user: current_user,
          policy_url: snapshot_params[:policy_url],
          policy_type: snapshot_params[:policy_type] || 'refund',
          summary: snapshot_params[:summary],
          raw_text_snippet: snapshot_params[:raw_text_snippet],
          extracted_at: Time.current
        )
        
        if snapshot.save
          render json: {
            id: snapshot.id,
            status: 'saved',
            store_domain: store.domain,
            policy_url: snapshot.policy_url,
            extracted_at: snapshot.extracted_at.iso8601,
            checksum: snapshot.checksum,
            created_at: snapshot.created_at.iso8601
          }, status: :created
        else
          render json: {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              details: snapshot.errors.messages
            }
          }, status: :unprocessable_entity
        end
      rescue ActiveRecord::RecordNotUnique
        existing = PolicySnapshot.find_by(store: store, checksum: snapshot.checksum)
        render json: {
          error: {
            code: 'DUPLICATE_SNAPSHOT',
            message: 'Snapshot with identical content already exists',
            existing_snapshot_id: existing&.id
          }
        }, status: :conflict
      end
      
      private
      
      def snapshot_params
        params.permit(:store_domain, :policy_url, :policy_type, :raw_text_snippet,
                      summary: [fields: {}, confidence: {}])
      end
    end
  end
end
