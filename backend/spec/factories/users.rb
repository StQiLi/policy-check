FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    auth_token { SecureRandom.uuid }
  end
end
