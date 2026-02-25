FactoryBot.define do
  factory :policy_snapshot do
    association :store
    association :user
    policy_type { 'refund' }
    sequence(:policy_url) { |n| "https://store#{n}.myshopify.com/policies/refund-policy" }
    sequence(:page_url) { |n| "https://store#{n}.myshopify.com/products/item-#{n}" }
    summary do
      unique_suffix = SecureRandom.hex(2)
      {
        'fields' => {
          'returnWindow' => "30 days #{unique_suffix}",
          'conditionRequirements' => 'Unworn with tags',
          'fees' => 'No restocking fee',
          'returnShipping' => 'Customer pays',
          'exclusions' => 'Final sale items'
        },
        'confidence' => {
          'returnWindow' => 'high',
          'conditionRequirements' => 'medium',
          'fees' => 'high',
          'returnShipping' => 'medium',
          'exclusions' => 'low'
        }
      }
    end
    raw_text_snippet { 'Returns accepted within 30 days of purchase...' }
    extracted_at { Time.current }
  end
end
