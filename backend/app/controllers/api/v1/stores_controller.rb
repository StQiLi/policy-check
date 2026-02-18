module Api
  module V1
    class StoresController < ApplicationController
      include Authenticable

      def latest
        store = Store.find_by!(domain: params[:domain])
        snapshot = store.policy_snapshots.latest.first

        if snapshot
          render json: {
            id: snapshot.id,
            store: serialize_store(store),
            policy_url: snapshot.policy_url,
            policy_type: snapshot.policy_type,
            summary: snapshot.summary,
            extracted_at: snapshot.extracted_at.iso8601,
            created_at: snapshot.created_at.iso8601
          }
        else
          render json: {
            error: {
              code: 'NOT_FOUND',
              message: "No snapshots found for domain: #{params[:domain]}"
            }
          }, status: :not_found
        end
      end

      def history
        store = Store.find_by!(domain: params[:domain])
        page     = [params.fetch(:page, 1).to_i, 1].max
        per_page = [[params.fetch(:per_page, 10).to_i, 1].max, 100].min
        offset   = (page - 1) * per_page

        base_scope = store.policy_snapshots
                          .by_policy_type(params[:policy_type])
                          .order(extracted_at: :desc)

        total_count = base_scope.count
        snapshots   = base_scope.offset(offset).limit(per_page)

        render json: {
          store: serialize_store(store),
          snapshots: snapshots.map { |s| serialize_snapshot(s) },
          pagination: {
            current_page: page,
            total_pages: (total_count.to_f / per_page).ceil,
            total_count: total_count,
            per_page: per_page
          }
        }
      end

      private

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
          policy_url: snapshot.policy_url,
          policy_type: snapshot.policy_type,
          summary: snapshot.summary,
          extracted_at: snapshot.extracted_at.iso8601,
          created_at: snapshot.created_at.iso8601,
          has_changes: false # TODO: Implement diff detection in v2
        }
      end
    end
  end
end
