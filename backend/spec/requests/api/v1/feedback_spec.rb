require 'rails_helper'

RSpec.describe 'POST /api/v1/feedback', type: :request do
  let(:user) { create(:user) }
  let(:headers) { { 'Authorization' => "Bearer #{user.auth_token}" } }
  let(:snapshot) { create(:policy_snapshot, user: user) }

  let(:valid_params) do
    {
      snapshot_id: snapshot.id,
      field_name: 'returnWindow',
      correction: '60 days (not 30 days)',
      comment: 'Policy changed last week'
    }
  end

  context 'with valid auth token' do
    it 'creates feedback' do
      post '/api/v1/feedback', params: valid_params, headers: headers

      expect(response).to have_http_status(:created)
      json = JSON.parse(response.body)
      expect(json['status']).to eq('received')
      expect(json['field_name']).to eq('returnWindow')
    end
  end

  context 'without auth token' do
    it 'returns 401' do
      post '/api/v1/feedback', params: valid_params

      expect(response).to have_http_status(:unauthorized)
    end
  end

  context 'with invalid field_name' do
    it 'returns 422' do
      post '/api/v1/feedback',
           params: valid_params.merge(field_name: 'invalidField'),
           headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  context 'with nonexistent snapshot' do
    it 'returns 404' do
      post '/api/v1/feedback',
           params: valid_params.merge(snapshot_id: 99999),
           headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end
end
