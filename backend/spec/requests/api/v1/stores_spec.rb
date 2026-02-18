require 'rails_helper'

RSpec.describe 'Stores API', type: :request do
  let(:user) { create(:user) }
  let(:headers) { { 'Authorization' => "Bearer #{user.auth_token}" } }
  let(:store) { create(:store, domain: 'test-store.myshopify.com') }
  let!(:snapshot) { create(:policy_snapshot, store: store, user: user) }

  describe 'GET /api/v1/stores/:domain/latest' do
    context 'with valid auth token' do
      it 'returns the latest snapshot' do
        get "/api/v1/stores/#{store.domain}/latest", headers: headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json['id']).to eq(snapshot.id)
        expect(json['store']['domain']).to eq(store.domain)
        expect(json['summary']).to be_present
      end
    end

    context 'when store does not exist' do
      it 'returns 404' do
        get '/api/v1/stores/nonexistent.myshopify.com/latest', headers: headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context 'without auth token' do
      it 'returns 401' do
        get "/api/v1/stores/#{store.domain}/latest"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe 'GET /api/v1/stores/:domain/history' do
    let!(:older_snapshot) do
      create(:policy_snapshot, store: store, user: user, extracted_at: 1.week.ago)
    end

    context 'with valid auth token' do
      it 'returns paginated snapshots' do
        get "/api/v1/stores/#{store.domain}/history", headers: headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json['snapshots'].length).to eq(2)
        expect(json['pagination']['total_count']).to eq(2)
      end

      it 'respects per_page parameter' do
        get "/api/v1/stores/#{store.domain}/history",
            params: { per_page: 1 }, headers: headers

        json = JSON.parse(response.body)
        expect(json['snapshots'].length).to eq(1)
        expect(json['pagination']['total_pages']).to eq(2)
      end
    end

    context 'without auth token' do
      it 'returns 401' do
        get "/api/v1/stores/#{store.domain}/history"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
