FactoryBot.define do
  factory :feedback do
    association :policy_snapshot
    association :user
    field_name { 'returnWindow' }
    correction { '60 days (not 30 days)' }
    comment { 'Policy was recently updated' }
  end
end
