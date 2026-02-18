require 'rails_helper'

RSpec.describe 'POST /api/v1/snapshots', type: :request do
  let(:user) { create(:user) }
  let(:valid_params) do
    {
      store_domain: 'example.myshopify.com',
      policy_url: 'https://example.myshopify.com/policies/refund-policy',
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
  
  context 'with valid auth token' do
    let(:headers) { { 'Authorization' => "Bearer #{user.auth_token}" } }
    
    it 'creates a snapshot' do
      post '/api/v1/snapshots', params: valid_params, headers: headers
      
      expect(response).to have_http_status(:created)
      json = JSON.parse(response.body)
      expect(json['id']).to be_present
      expect(json['status']).to eq('saved')
    end
    
    it 'creates a store if not exists' do
      expect {
        post '/api/v1/snapshots', params: valid_params, headers: headers
      }.to change(Store, :count).by(1)
    end
  end
  
  context 'without auth token' do
    it 'returns 401' do
      post '/api/v1/snapshots', params: valid_params
      expect(response).to have_http_status(:unauthorized)
    end
  end
  
  context 'with invalid params' do
    let(:headers) { { 'Authorization' => "Bearer #{user.auth_token}" } }
    
    it 'returns 422 with validation errors' do
      post '/api/v1/snapshots', params: { store_domain: '' }, headers: headers
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
