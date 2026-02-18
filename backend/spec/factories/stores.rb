FactoryBot.define do
  factory :store do
    sequence(:domain) { |n| "store#{n}.myshopify.com" }
    name { domain }
    platform { 'shopify' }
  end
end
