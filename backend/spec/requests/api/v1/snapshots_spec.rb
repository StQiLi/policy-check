require 'rails_helper'

RSpec.describe 'Snapshots API', type: :request do
  let(:user) { create(:user) }
  let(:headers) { { 'Authorization' => "Bearer #{user.auth_token}" } }

  let(:valid_params) do
    {
      store_domain: 'example.myshopify.com',
      policy_url: 'https://example.myshopify.com/policies/refund-policy',
      page_url: 'https://example.myshopify.com/products/sample-dress',
      policy_type: 'refund',
      summary: {
        fields: {
          returnWindow: '30 days',
          conditionRequirements: 'Unworn with tags',
          fees: 'No restocking fee',
          returnShipping: 'Customer pays',
          exclusions: 'Final sale items'
        },
        confidence: {
          returnWindow: 'high',
          conditionRequirements: 'medium',
          fees: 'high',
          returnShipping: 'medium',
          exclusions: 'low'
        }
      },
      raw_text_snippet: 'Returns accepted within 30 days...'
    }
  end

  describe 'POST /api/v1/snapshots' do
    context 'with valid auth token' do
      it 'creates a snapshot' do
        post '/api/v1/snapshots', params: valid_params, headers: headers

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json['id']).to be_present
        expect(json['status']).to eq('saved')
      end

      it 'creates a store if not exists' do
        expect do
          post '/api/v1/snapshots', params: valid_params, headers: headers
        end.to change(Store, :count).by(1)
      end

      it 'persists page_url when provided' do
        post '/api/v1/snapshots', params: valid_params, headers: headers

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json['page_url']).to eq(valid_params[:page_url])

        snapshot = PolicySnapshot.find(json['id'])
        expect(snapshot.page_url).to eq(valid_params[:page_url])
      end
    end

    context 'without auth token' do
      it 'returns 401' do
        post '/api/v1/snapshots', params: valid_params

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'with invalid params' do
      it 'returns 422 with validation errors' do
        post '/api/v1/snapshots', params: { store_domain: '' }, headers: headers

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end
  end

  describe 'GET /api/v1/snapshots' do
    let(:other_user) { create(:user) }
    let(:store_a) { create(:store, domain: 'store-a.myshopify.com', name: 'Store A') }
    let(:store_b) { create(:store, domain: 'store-b.myshopify.com', name: 'Store B') }

    let!(:oldest_snapshot) do
      create(
        :policy_snapshot,
        store: store_a,
        user: user,
        policy_type: 'shipping',
        page_url: 'https://store-a.myshopify.com/products/old-item',
        extracted_at: 2.weeks.ago
      )
    end

    let!(:latest_snapshot) do
      create(
        :policy_snapshot,
        store: store_b,
        user: user,
        policy_type: 'refund',
        page_url: 'https://store-b.myshopify.com/products/new-item',
        extracted_at: 1.hour.ago
      )
    end

    let!(:other_user_store) { create(:store, domain: 'store-c.myshopify.com', name: 'Store C') }

    let!(:other_user_snapshot) do
      create(
        :policy_snapshot,
        store: other_user_store,
        user: other_user,
        policy_type: 'refund',
        extracted_at: 10.minutes.ago
      )
    end

    it 'returns snapshots scoped to current user with pagination metadata' do
      get '/api/v1/snapshots', headers: headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)

      expect(json['snapshots'].length).to eq(2)
      expect(json['pagination']['current_page']).to eq(1)
      expect(json['pagination']['total_count']).to eq(2)
      expect(json['pagination']['per_page']).to eq(10)
      expect(json['pagination']['total_pages']).to eq(1)
    end

    it 'orders snapshots by extracted_at descending' do
      get '/api/v1/snapshots', headers: headers

      json = JSON.parse(response.body)
      ids = json.fetch('snapshots').map { |snapshot| snapshot.fetch('id') }

      expect(ids).to eq([latest_snapshot.id, oldest_snapshot.id])
    end

    it 'includes store and page_url data in each item' do
      get '/api/v1/snapshots', headers: headers

      json = JSON.parse(response.body)
      snapshot = json.fetch('snapshots').first

      expect(snapshot['store']).to include('domain', 'name', 'platform')
      expect(snapshot['policy_url']).to be_present
      expect(snapshot).to have_key('page_url')
      expect(snapshot['summary']).to be_present
      expect(snapshot['extracted_at']).to be_present
      expect(snapshot['created_at']).to be_present
    end

    it 'supports pagination parameters' do
      get '/api/v1/snapshots', params: { per_page: 1, page: 2 }, headers: headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['snapshots'].length).to eq(1)
      expect(json['pagination']['current_page']).to eq(2)
      expect(json['pagination']['total_pages']).to eq(2)
      expect(json['pagination']['total_count']).to eq(2)
      expect(json['pagination']['per_page']).to eq(1)
    end

    it 'supports filtering by policy_type' do
      get '/api/v1/snapshots', params: { policy_type: 'shipping' }, headers: headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['snapshots'].length).to eq(1)
      expect(json['snapshots'].first['id']).to eq(oldest_snapshot.id)
    end

    it 'supports filtering by store_domain' do
      get '/api/v1/snapshots', params: { store_domain: store_b.domain }, headers: headers

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json['snapshots'].length).to eq(1)
      expect(json['snapshots'].first.dig('store', 'domain')).to eq(store_b.domain)
    end

    it 'returns 401 without auth token' do
      get '/api/v1/snapshots'

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
