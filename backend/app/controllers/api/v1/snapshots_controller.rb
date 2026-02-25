module Api
  module V1
    class SnapshotsController < ApplicationController
      include Authenticable

      def index
        page = [params.fetch(:page, 1).to_i, 1].max
        per_page = [[params.fetch(:per_page, 10).to_i, 1].max, 100].min
        offset = (page - 1) * per_page

        scope = PolicySnapshot.includes(:store).where(user: current_user)
        scope = scope.where(policy_type: params[:policy_type]) if params[:policy_type].present?
        if params[:store_domain].present?
          scope = scope.joins(:store).where(stores: { domain: params[:store_domain] })
        end
        scope = scope.order(extracted_at: :desc, id: :desc)

        total_count = scope.count
        snapshots = scope.offset(offset).limit(per_page)

        render json: {
          snapshots: snapshots.map { |snapshot| serialize_snapshot(snapshot) },
          pagination: {
            current_page: page,
            total_pages: (total_count.to_f / per_page).ceil,
            total_count: total_count,
            per_page: per_page
          }
        }
      end

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
          page_url: snapshot_params[:page_url],
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
            page_url: snapshot.page_url,
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
        params.permit(:store_domain, :policy_url, :page_url, :policy_type, :raw_text_snippet,
                      summary: [fields: {}, confidence: {}])
      end

      def serialize_store(store)
        {
          domain: store.domain,
          name: store.name,
          platform: store.platform
        }
      end

      def serialize_snapshot(snapshot)
        {
          id: snapshot.id,
          store: serialize_store(snapshot.store),
          policy_url: snapshot.policy_url,
          page_url: snapshot.page_url,
          policy_type: snapshot.policy_type,
          summary: snapshot.summary,
          extracted_at: snapshot.extracted_at.iso8601,
          created_at: snapshot.created_at.iso8601
        }
      end
    end
  end
end
